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

function inviteHtml({ to, name, company, role, branch, inviter, link, expires }, withLogo) {
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
          <h1 style="margin:6px 0 0;font-size:20px;color:#111827">You're invited to the ${escapeHtml(company)} portal</h1>
          <p style="margin:8px 0 0;font-size:14px;color:#374151;line-height:1.5">
            Hi ${escapeHtml(name)}, ${escapeHtml(inviter)} has given you access to the ${escapeHtml(company)} staff portal.
            Set your password to activate your account.
          </p>
        </td></tr>
        <tr><td style="padding:8px 24px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb">
            ${row("Role", escapeHtml(role))}
            ${row("Branch", escapeHtml(branch))}
            ${row("Sign-in email", escapeHtml(to))}
          </table>
        </td></tr>
        <tr><td style="padding:20px 24px 8px" align="center">
          <a href="${escapeHtml(link)}" style="display:inline-block;background:#f9c03c;color:#1c1c1c;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;border:1px solid #dca528">Activate your account</a>
        </td></tr>
        <tr><td style="padding:8px 24px 24px">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280">
            This link works once and expires on ${escapeHtml(expires)}. If you weren't expecting it, you can ignore this email.
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">${escapeHtml(company)} · Canada, Ethiopia and Uganda</p>
    </td></tr>
  </table>
</body></html>`;
}

// Invites a new staff member to set their password. `invite`: { to, name, role, branch, inviter, link, expiresAt }
export async function sendStaffInvite(invite) {
  const company = "Hand to Hand Express";
  const expires = new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeStyle: "short" }).format(invite.expiresAt);
  const details = { ...invite, company, expires };
  const logo = await logoAttachment();
  await transporter().sendMail({
    from: process.env.EMAIL_FROM || `${company} <${process.env.SMTP_USER}>`,
    to: invite.to,
    subject: `You're invited to the ${company} portal`,
    text: [
      `Hi ${invite.name},`,
      "",
      `${invite.inviter} has given you access to the ${company} staff portal.`,
      `Role: ${invite.role}`,
      `Branch: ${invite.branch}`,
      `Sign-in email: ${invite.to}`,
      "",
      `Activate your account and set your password: ${invite.link}`,
      "",
      `This link works once and expires on ${expires}. If you weren't expecting it, you can ignore this email.`,
      "",
      company,
    ].join("\n"),
    html: inviteHtml(details, Boolean(logo)),
    attachments: logo ? [logo] : [],
  });
}

// --- Package status emails -------------------------------------------------------------------

// The public site address for links in emails. Status emails can be sent without a browser
// request (e.g. from a Telegram reply), so PUBLIC_SITE_URL is preferred over the request host.
export function publicSiteUrl(request) {
  const fallback = request ? new URL(request.url).origin : "";
  return (process.env.PUBLIC_SITE_URL || fallback).replace(/\/$/, "");
}

// The same card as the receipt: logo header, white card, footer.
function layout({ heading, intro, body, withLogo }) {
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
          <h1 style="margin:6px 0 0;font-size:20px;color:#111827">${heading}</h1>
          <p style="margin:8px 0 0;font-size:14px;color:#374151;line-height:1.5">${intro}</p>
        </td></tr>
        ${body}
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">Hand to Hand Express · Canada, Ethiopia and Uganda</p>
    </td></tr>
  </table>
</body></html>`;
}

// `trackUrl` null leaves out the "Track your package" button (lost and damaged packages aren't
// shown on the public tracking page).
function trackingBox(pkg, trackUrl) {
  return `<tr><td style="padding:16px 24px">
          <div style="border:1px solid #fbbf24;background:#fffbeb;border-radius:8px;padding:14px;text-align:center">
            <p style="margin:0;font-size:12px;color:#6b7280">Tracking number</p>
            <p style="margin:4px 0 0;font-size:22px;font-weight:700;letter-spacing:1px;font-family:Menlo,Consolas,monospace;color:#111827"><span style="-webkit-user-select:all;user-select:all">${escapeHtml(pkg.tracking)}</span></p>
          </div>
          ${
            trackUrl
              ? `<p style="margin:16px 0 0;text-align:center">
            <a href="${escapeHtml(trackUrl)}" style="display:inline-block;background:#f9c03c;color:#1c1c1c;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;border:1px solid #dca528">Track your package</a>
          </p>`
              : ""
          }
        </td></tr>`;
}

function detailsTable(rows) {
  return `<tr><td style="padding:0 24px 8px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb">
            ${rows.join("")}
          </table>
        </td></tr>`;
}

function note(html) {
  return `<tr><td style="padding:8px 24px 24px">
          <p style="margin:0;background:#f3f4f6;border-radius:8px;padding:12px;font-size:13px;line-height:1.5;color:#374151">${html}</p>
        </td></tr>`;
}

function dateText(date) {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeStyle: "short" }).format(date);
}

// What each status email says. `pkg` is the package record; `at` when the step happened;
// `pickupBranch` the branch that received it (for Ready for pickup).
const STATUS_EMAILS = {
  departed: ({ pkg }) => ({
    subject: `Your package is on its way — ${pkg.tracking}`,
    heading: "Your package is on its way",
    intro: `Your package to ${escapeHtml(pkg.receiverContact.name)} has left ${escapeHtml(pkg.branch.name)} and is in transit to ${escapeHtml(pkg.to)}.`,
    text: `Your package to ${pkg.receiverContact.name} has left ${pkg.branch.name} and is in transit to ${pkg.to}.`,
    rows: [
      row("Route", `${escapeHtml(pkg.from)} → ${escapeHtml(pkg.to)} · ${pkg.shipping === "express" ? "Express" : "Normal"}`),
      row("Receiver", escapeHtml(pkg.receiverContact.name)),
      row("Weight", `${Number(pkg.weight).toFixed(1)} kg`),
    ],
    note: "We'll email you again when it's ready for pickup.",
  }),
  pickup: ({ pkg, pickupBranch }) => {
    const balance = Math.max(0, Math.round((pkg.charge - pkg.amountPaid) * 100) / 100);
    const place = pickupBranch?.name ?? `our office in ${pkg.to}`;
    return {
      subject: `Ready for pickup — ${pkg.tracking}`,
      heading: "Your package is ready for pickup",
      intro: `The package for ${escapeHtml(pkg.receiverContact.name)} has arrived and can be collected at ${escapeHtml(place)}.`,
      text: `The package for ${pkg.receiverContact.name} has arrived and can be collected at ${place}.${balance > 0 ? ` Balance to pay at pickup: ${money(balance, pkg.currency)}.` : ""}`,
      rows: [
        row("Pickup at", escapeHtml(place)),
        row("Receiver", escapeHtml(pkg.receiverContact.name)),
        row("Balance due", balance > 0 ? `<strong>${money(balance, pkg.currency)}</strong>` : "Paid in full"),
      ],
      note: `<strong>To collect it:</strong> ${escapeHtml(pkg.receiverContact.name)} must bring the tracking number and a valid photo ID that matches their name.${balance > 0 ? " The balance is paid at pickup." : ""}`,
    };
  },
  delivered: ({ pkg, at }) => ({
    subject: `Delivered — ${pkg.tracking}`,
    heading: "Your package has been delivered",
    intro: `${escapeHtml(pkg.receiverContact.name)} collected the package on ${escapeHtml(dateText(at))}.`,
    text: `${pkg.receiverContact.name} collected the package on ${dateText(at)}.`,
    rows: [
      row("Route", `${escapeHtml(pkg.from)} → ${escapeHtml(pkg.to)}`),
      row("Collected by", escapeHtml(pkg.receiverContact.name)),
    ],
    note: "Thank you for shipping with Hand to Hand Express.",
  }),
};

// Lost or destroyed on the way. Honest and short; staff follow up in person.
STATUS_EMAILS.lost = ({ pkg }) => {
  const refund = pkg.refund?.amount > 0 ? money(pkg.refund.amount, pkg.currency) : null;
  const what = pkg.events?.at(-1)?.step === "damaged" ? "was damaged on its way" : "was lost on its way";
  return {
    subject: `About your package — ${pkg.tracking}`,
    heading: "We're sorry: your package couldn't be delivered",
    intro: `Your package to ${escapeHtml(pkg.receiverContact.name)} ${what}, so it can't be delivered. Our team will contact you.`,
    text: `Your package to ${pkg.receiverContact.name} ${what}, so it can't be delivered. Our team will contact you.${refund ? ` A refund of ${refund} has been arranged.` : ""}`,
    rows: [
      row("Route", `${escapeHtml(pkg.from)} → ${escapeHtml(pkg.to)}`),
      row("Receiver", escapeHtml(pkg.receiverContact.name)),
      ...(refund ? [row("Refund", `<strong>${refund}</strong>`)] : []),
    ],
    note: "We apologise for this. Reply to this email or call your branch if you have any questions.",
  };
};

export const STATUS_EMAIL_STEPS = Object.keys(STATUS_EMAILS);

// Sends one status email (In transit, Ready for pickup or Delivered) to one person:
// `recipient` is { email, name } (the sender or the receiver).
export async function sendStatusEmail(pkg, step, { recipient, trackUrl, at = new Date(), pickupBranch = null }) {
  const content = STATUS_EMAILS[step]({ pkg, at, pickupBranch });
  const logo = await logoAttachment();
  const greeting = `Hi ${recipient.name},`;
  // Lost and damaged packages have no public tracking page to link to.
  const link = step === "lost" ? null : trackUrl;
  await transporter().sendMail({
    from: process.env.EMAIL_FROM || `Hand to Hand Express <${process.env.SMTP_USER}>`,
    to: recipient.email,
    subject: content.subject,
    text: [greeting, "", content.text, "", `Tracking number: ${pkg.tracking}`, ...(link ? [`Track it: ${link}`] : []), "", "Hand to Hand Express"].join("\n"),
    html: layout({
      heading: escapeHtml(content.heading),
      intro: `${escapeHtml(greeting)} ${content.intro}`,
      body: `${trackingBox(pkg, link)}${detailsTable(content.rows)}${note(content.note)}`,
      withLogo: Boolean(logo),
    }),
    attachments: logo ? [logo] : [],
  });
}
