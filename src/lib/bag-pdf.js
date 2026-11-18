// Browser-only: the printable bag manifest (A4), with real selectable text.
import { format } from "date-fns";
import { jsPDF } from "jspdf";
import { bagStatusInfo } from "@/lib/bags";

const LOGO_URL = "/images/logos/logo_header.png";
const LOGO_RATIO = 259 / 463;
const INK = [17, 24, 39];
const MUTED = [107, 114, 128];
const LINE = [229, 231, 235];

async function loadLogo() {
  try {
    const blob = await (await fetch(LOGO_URL)).blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null; // Still valid without the logo.
  }
}

const when = (date) => (date ? format(new Date(date), "MMM d, yyyy HH:mm") : "—");
const kg = (value) => `${(Number(value) || 0).toFixed(1)} kg`;

function textStyle(doc, size, color = INK, style = "normal", font = "helvetica") {
  doc.setFont(font, style).setFontSize(size).setTextColor(...color);
}

async function header(doc, title, subtitle, margin) {
  const logo = await loadLogo();
  const logoWidth = 18;
  if (logo) doc.addImage(logo, "PNG", margin, 10, logoWidth, logoWidth * LOGO_RATIO);
  const x = logo ? margin + logoWidth + 4 : margin;
  textStyle(doc, 14, INK, "bold");
  doc.text("Hand to Hand Express", x, 15);
  textStyle(doc, 9, MUTED);
  doc.text(`${title} · ${subtitle}`, x, 20.5);
}

// bag: the bag from /api/bags/:code.
export async function buildManifestPdf(bag) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 14;
  const right = width - margin;
  await header(doc, "Bag manifest", `Printed ${when(new Date())}`, margin);

  // Bag reference
  let y = 30;
  doc.setDrawColor(249, 192, 60).setFillColor(255, 251, 235).setLineWidth(0.4);
  doc.roundedRect(margin, y, right - margin, 30, 2, 2, "FD");
  textStyle(doc, 8.5, MUTED);
  doc.text("Bag reference", margin + 5, y + 8);
  textStyle(doc, 20, INK, "bold", "courier");
  doc.text(bag.code, margin + 5, y + 17);
  textStyle(doc, 9, MUTED);
  doc.text(`Status: ${bagStatusInfo(bag.status).label}`, margin + 5, y + 24.5);
  y += 38;

  // Details in two columns
  const details = [
    ["Origin", `${bag.origin.name} (${bag.origin.country})`],
    ["Destination", `${bag.destination.name} (${bag.destination.country})`],
    ["Created", `${when(bag.createdAt)} by ${bag.createdBy?.name ?? "—"}`],
    ["Closed", bag.closedAt ? `${when(bag.closedAt)} by ${bag.closedBy?.name ?? "—"}` : "—"],
    ["Dispatched", bag.dispatchedAt ? `${when(bag.dispatchedAt)} by ${bag.dispatchedBy?.name ?? "—"}` : "Not yet"],
    ["Transport ref.", bag.dispatch?.transportRef || "—"],
    ["Carrier / vehicle", bag.dispatch?.carrier || "—"],
    ["Packages", `${bag.items.length} · ${kg(bag.totalWeight)}`],
  ];
  const column = (right - margin) / 2;
  details.forEach(([label, value], index) => {
    const x = margin + (index % 2) * column;
    const rowY = y + Math.floor(index / 2) * 10;
    textStyle(doc, 8, MUTED);
    doc.text(label, x, rowY);
    textStyle(doc, 9.5);
    doc.text(doc.splitTextToSize(value, column - 4)[0], x, rowY + 4.5);
  });
  y += Math.ceil(details.length / 2) * 10 + 4;
  if (bag.notes) {
    textStyle(doc, 8, MUTED);
    doc.text("Notes", margin, y);
    textStyle(doc, 9);
    const lines = doc.splitTextToSize(bag.notes, right - margin);
    doc.text(lines, margin, y + 4.5);
    y += lines.length * 4.2 + 7;
  }

  // Package table
  const cols = [
    { label: "#", x: margin, w: 8 },
    { label: "Tracking number", x: margin + 8, w: 42 },
    { label: "Sender", x: margin + 50, w: 40 },
    { label: "Receiver", x: margin + 90, w: 40 },
    { label: "Weight", x: margin + 130, w: 20, align: "right" },
    { label: "Checked", x: margin + 154, w: 28 },
  ];
  const tableHeader = () => {
    doc.setFillColor(243, 244, 246).rect(margin, y - 4.5, right - margin, 7, "F");
    textStyle(doc, 8, MUTED, "bold");
    cols.forEach((col) => doc.text(col.label, col.align === "right" ? col.x + col.w : col.x + 1, y, col.align === "right" ? { align: "right" } : undefined));
    y += 7;
  };
  tableHeader();
  bag.items.forEach((item, index) => {
    if (y > height - 50) {
      doc.addPage();
      y = 20;
      tableHeader();
    }
    textStyle(doc, 9);
    doc.text(String(index + 1), margin + 1, y);
    textStyle(doc, 9, INK, "normal", "courier");
    doc.text(item.tracking, cols[1].x + 1, y);
    textStyle(doc, 9);
    doc.text(doc.splitTextToSize(item.sender ?? "", cols[2].w - 2)[0] ?? "", cols[2].x + 1, y);
    doc.text(doc.splitTextToSize(item.receiver ?? "", cols[3].w - 2)[0] ?? "", cols[3].x + 1, y);
    doc.text(kg(item.weight), cols[4].x + cols[4].w, y, { align: "right" });
    // A box to tick at each end, or the recorded result once received.
    if (item.verification) {
      doc.text(item.verification[0].toUpperCase() + item.verification.slice(1), cols[5].x + 1, y);
    } else {
      doc.setDrawColor(...MUTED).setLineWidth(0.3).rect(cols[5].x + 1, y - 3.2, 3.5, 3.5);
      doc.rect(cols[5].x + 9, y - 3.2, 3.5, 3.5);
    }
    doc.setDrawColor(...LINE).setLineWidth(0.2).line(margin, y + 2.5, right, y + 2.5);
    y += 7;
  });
  textStyle(doc, 9, INK, "bold");
  doc.text(`Total: ${bag.items.length} ${bag.items.length === 1 ? "package" : "packages"}`, margin + 1, y + 1);
  doc.text(kg(bag.totalWeight), cols[4].x + cols[4].w, y + 1, { align: "right" });
  textStyle(doc, 7.5, MUTED);
  doc.text("Checked: first box at dispatch, second at receipt.", cols[5].x - 40, y + 6);

  // Signatures
  if (y > height - 45) {
    doc.addPage();
    y = 20;
  }
  y = Math.max(y + 16, height - 40);
  const box = (label, x, w) => {
    textStyle(doc, 8.5, MUTED);
    doc.text(label, x, y);
    doc.setDrawColor(...MUTED).setLineWidth(0.3);
    doc.line(x, y + 12, x + w, y + 12);
    textStyle(doc, 7.5, MUTED);
    doc.text("Name, signature, date and time", x, y + 16);
  };
  const half = (right - margin - 10) / 2;
  box("Dispatched by (origin branch)", margin, half);
  box("Received and verified by (destination branch)", margin + half + 10, half);

  doc.setProperties({ title: `Manifest ${bag.code}`, author: "Hand to Hand Express" });
  return doc.output("blob");
}

export function openPdf(blob, filename) {
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, "_blank");
  if (!tab) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
