import { readFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

// Embedded in the email itself (cid:), so it shows even when the site isn't public yet.
const LOGO_CID = "h2h-logo";
const LOGO_PATH = path.join(process.cwd(), "public/images/logos/logo_header.png");

const cache = globalThis;

export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function logoAttachment() {
  try {
    cache.h2hLogo ??= await readFile(LOGO_PATH);
    return { filename: "h2h-logo.png", content: cache.h2hLogo, cid: LOGO_CID };
  } catch (error) {
    console.error("Email logo missing; sending without it", error);
    return null;
  }
}

function transporter() {
  const port = Number(process.env.SMTP_PORT) || 465;
  cache.h2hMailer ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return cache.h2hMailer;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(amount, currency) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(amount);
}

function row(label, value) {
  return `<tr>
    <td style="padding:6px 0;color:#6b7280;font-size:14px;vertical-align:top">${escapeHtml(label)}</td>
    <td style="padding:6px 0;color:#111827;font-size:14px;text-align:right">${value}</td>
  </tr>`;
}

function confirmationHtml(pkg, trackUrl, withLogo) {
  const balance = Math.max(0, pkg.charge - pkg.amountPaid);
  const items = pkg.items
    .map((item) => `${escapeHtml(item.description)} × ${item.qty} (${item.kg} kg)`)
    .join("<br>");

  return `<!doctype html>
<html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:10px;border:1px solid #e5e7eb">
        ${
          withLogo
            ? `<tr><td align="center" style="padding:24px 24px 4px">
          <img src="cid:${LOGO_CID}" width="88" alt="" style="display:block;width:88px;height:auto;border:0">
          <p style="margin:10px 0 0;font-size:17px;font-weight:800;letter-spacing:2px;color:#111827">HAND TO HAND</p>
          <p style="margin:2px 0 0;font-size:10px;font-weight:600;letter-spacing:3px;color:#6b7280">EXPRESS DELIVERY</p>
        </td></tr>`
            : ""
        }
        <tr><td style="padding:${withLogo ? "12px" : "24px"} 24px 8px">
          ${withLogo ? "" : '<p style="margin:0;font-size:13px;color:#6b7280">Hand to Hand Express</p>'}
          <h1 style="margin:6px 0 0;font-size:20px;color:#111827">We've received your package</h1>
          <p style="margin:8px 0 0;font-size:14px;color:#374151;line-height:1.5">
            Hi ${escapeHtml(pkg.senderContact.name)}, your package to ${escapeHtml(pkg.receiverContact.name)}
            is registered at ${escapeHtml(pkg.branch.name)}. Keep this email: it's your receipt.
          </p>
        </td></tr>
        <tr><td style="padding:16px 24px">
          <div style="border:1px solid #fbbf24;background:#fffbeb;border-radius:8px;padding:14px;text-align:center">
            <p style="margin:0;font-size:12px;color:#6b7280">Tracking number</p>
            <p style="margin:4px 0 0;font-size:22px;font-weight:700;letter-spacing:1px;font-family:Menlo,Consolas,monospace;color:#111827"><span style="-webkit-user-select:all;user-select:all">${escapeHtml(pkg.tracking)}</span></p>
            <p style="margin:4px 0 0;font-size:11px;color:#6b7280">Tap and hold the number to copy it</p>
          </div>
          <p style="margin:16px 0 0;text-align:center">
            <a href="${escapeHtml(trackUrl)}" style="display:inline-block;background:#f9c03c;color:#1c1c1c;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;border:1px solid #dca528">Track your package</a>
          </p>
        </td></tr>
        <tr><td style="padding:0 24px 8px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb">
            ${row("Receipt", escapeHtml(pkg.receiptNo))}
            ${row("Route", `${escapeHtml(pkg.from)} → ${escapeHtml(pkg.to)} · ${pkg.shipping === "express" ? "Express" : "Normal"}`)}
            ${row("Receiver", `${escapeHtml(pkg.receiverContact.name)}<br><span style="color:#6b7280">${escapeHtml(pkg.receiverContact.phone)}</span>`)}
            ${row("Items", items)}
            ${row("Total weight", `${pkg.weight.toFixed(1)} kg`)}
            ${row("Charged", money(pkg.charge, pkg.currency))}
            ${
              pkg.paymentMethod === "Pay at pickup"
                ? row("Payment", "Pay when you collect the package")
                : row("Paid", money(pkg.amountPaid, pkg.currency))
            }
            ${row("Balance due", `<strong>${money(balance, pkg.currency)}</strong>`)}
          </table>
        </td></tr>
        <tr><td style="padding:8px 24px 24px">
          <p style="margin:0;background:#f3f4f6;border-radius:8px;padding:12px;font-size:13px;line-height:1.5;color:#374151">
            <strong>Picking up:</strong> forward this email to ${escapeHtml(pkg.receiverContact.name)}.
            To collect the package they must bring this receipt (or the tracking number) and a valid
            photo ID that matches their name.
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">Hand to Hand Express · Canada, Ethiopia and Uganda</p>
    </td></tr>
  </table>
</body></html>`;
}

function confirmationText(pkg, trackUrl) {
  return [
    `Hi ${pkg.senderContact.name},`,
    "",
    `Your package to ${pkg.receiverContact.name} is registered at ${pkg.branch.name}.`,
    "",
    `Tracking number: ${pkg.tracking}`,
    `Track it: ${trackUrl}`,
    `Receipt: ${pkg.receiptNo}`,
    `Charged: ${money(pkg.charge, pkg.currency)} · Paid: ${money(pkg.amountPaid, pkg.currency)}`,
    "",
    `Forward this email to ${pkg.receiverContact.name}. To collect the package they must bring this receipt (or the tracking number) and a valid photo ID that matches their name.`,
    "",
    "Hand to Hand Express",
  ].join("\n");
}

export async function sendPackageConfirmation(pkg, trackUrl) {
  const logo = await logoAttachment();
  await transporter().sendMail({
    from: process.env.EMAIL_FROM || `Hand to Hand Express <${process.env.SMTP_USER}>`,
    to: pkg.senderContact.email,
    subject: `Package received — tracking number ${pkg.tracking}`,
    text: confirmationText(pkg, trackUrl),
    html: confirmationHtml(pkg, trackUrl, Boolean(logo)),
    attachments: logo ? [logo] : [],
  });
}
