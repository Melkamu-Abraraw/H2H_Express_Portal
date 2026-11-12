// Browser-only: builds the customer receipt as a PDF with real (selectable, copyable) text.
import { format } from "date-fns";
import { jsPDF } from "jspdf";
import { formatMoney } from "@/components/admin/pricing-store";

const LOGO_URL = "/images/logos/logo_header.png";
const LOGO_RATIO = 259 / 463;
const COLLECTION_NOTE =
  "Send this receipt to the receiver. To collect the package, they must bring this receipt (or the tracking number) and a valid photo ID that matches the receiver's name.";

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
    return null; // The receipt is still valid without the logo.
  }
}

export async function buildReceiptPdf(receipt, trackUrl) {
  const doc = new jsPDF({ unit: "mm", format: "a5" });
  const width = doc.internal.pageSize.getWidth();
  const margin = 14;
  const right = width - margin;
  const money = (amount) => formatMoney(amount, receipt.currency);
  let y = 14;

  const setText = (size, color = INK, style = "normal", font = "helvetica") => {
    doc.setFont(font, style).setFontSize(size).setTextColor(...color);
  };
  const divider = () => {
    y += 2;
    doc.setDrawColor(...LINE).setLineWidth(0.3).line(margin, y, right, y);
    y += 6;
  };
  // Label on the left, one or more value lines on the right.
  const row = (label, values, { bold = false } = {}) => {
    setText(9.5, MUTED);
    doc.text(label, margin, y);
    const lines = (Array.isArray(values) ? values : [values]).filter(Boolean);
    lines.forEach((value, index) => {
      setText(9.5, index === 0 ? INK : MUTED, bold && index === 0 ? "bold" : "normal");
      const wrapped = doc.splitTextToSize(String(value), width * 0.55);
      doc.text(wrapped, right, y, { align: "right" });
      y += 5 * wrapped.length;
    });
    y += 1;
  };

  // Header
  const logo = await loadLogo();
  const logoWidth = 16;
  if (logo) doc.addImage(logo, "PNG", margin, y - 4, logoWidth, logoWidth * LOGO_RATIO);
  const textX = logo ? margin + logoWidth + 4 : margin;
  setText(13, INK, "bold");
  doc.text("Hand to Hand Express", textX, y);
  setText(8.5, MUTED);
  doc.text(
    `Receipt ${receipt.receiptNo} · ${format(receipt.date, "MMM d, yyyy HH:mm")}`,
    textX,
    y + 5,
  );
  y += 14;

  // Tracking number box
  doc.setDrawColor(249, 192, 60).setFillColor(255, 251, 235).setLineWidth(0.4);
  doc.roundedRect(margin, y, right - margin, 22, 2, 2, "FD");
  setText(8, MUTED);
  doc.text("Tracking number", width / 2, y + 6.5, { align: "center" });
  setText(17, INK, "bold", "courier");
  doc.text(receipt.tracking, width / 2, y + 14.5, { align: "center" });
  setText(7.5, MUTED);
  doc.text("Select the number to copy it", width / 2, y + 19.5, { align: "center" });
  y += 29;

  // Clickable link to the tracking page (which has a copy button).
  setText(9.5, [44, 54, 84], "bold");
  doc.textWithLink("Track online", width / 2, y, { url: trackUrl, align: "center" });
  const linkWidth = doc.getTextWidth("Track online");
  doc.setDrawColor(44, 54, 84).setLineWidth(0.2);
  doc.line(width / 2 - linkWidth / 2, y + 0.8, width / 2 + linkWidth / 2, y + 0.8);
  y += 8;

  row("Route", `${receipt.from} to ${receipt.to} · ${receipt.shipping}`);
  row("Drop-off", receipt.branch.name);
  divider();
  row("Sender", [receipt.sender.name, receipt.sender.phone]);
  row("Receiver", [receipt.receiver.name, receipt.receiver.phone]);
  divider();
  receipt.items.forEach((item) => row(`${item.description} × ${item.qty}`, `${item.kg} kg`));
  divider();
  row("Total weight", `${receipt.totalKg.toFixed(1)} kg`);
  row("Charged", money(receipt.fee));
  if (receipt.method === "Pay at pickup") row("Payment", "Pay when collecting the package");
  else row(`Paid (${receipt.method})`, money(receipt.paid));
  row("Balance due", money(receipt.balance), { bold: true });
  row("Cashier", receipt.cashier);

  // Collection note
  y += 3;
  setText(8.5, INK);
  const note = doc.splitTextToSize(COLLECTION_NOTE, right - margin - 8);
  const noteHeight = note.length * 4.2 + 7;
  doc.setFillColor(243, 244, 246).roundedRect(margin, y, right - margin, noteHeight, 2, 2, "F");
  doc.text(note, margin + 4, y + 6);
  y += noteHeight + 6;

  setText(7.5, MUTED);
  doc.text(doc.splitTextToSize(trackUrl, right - margin), margin, y);

  doc.setProperties({ title: `Receipt ${receipt.tracking}`, author: "Hand to Hand Express" });
  return doc.output("blob");
}
