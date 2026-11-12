const API = "https://api.telegram.org";

export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

async function call(method, body) {
  const response = await fetch(`${API}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json().catch(() => null);
  if (!result?.ok) throw new Error(result?.description || `Telegram ${method} failed`);
  return result.result;
}

export function sendMessage(text, { chatId = process.env.TELEGRAM_CHAT_ID, replyTo } = {}) {
  return call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyTo && { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } }),
  });
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Replies staff can send, by number or word. Each maps to a tracking step.
export const REPLY_STEPS = [
  { key: "departed", label: "In transit", words: ["intransit", "transit", "shipped", "departed"] },
  { key: "arrived", label: "Arrived at destination", words: ["arrived"] },
  { key: "customs", label: "Cleared customs", words: ["customs", "cleared"] },
  { key: "pickup", label: "Ready for pickup", words: ["ready", "pickup"] },
  { key: "delivered", label: "Delivered", words: ["delivered", "collected"] },
];

export function stepFromReply(text) {
  const word = String(text ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (/^[1-9]$/.test(word)) return REPLY_STEPS[Number(word) - 1] ?? null;
  return REPLY_STEPS.find((step) => step.words.includes(word)) ?? null;
}

export function replyHelp() {
  return REPLY_STEPS.map((step, index) => `${index + 1} ${step.label}`).join("\n");
}

function newPackageText(pkg) {
  const express = pkg.shipping === "express";
  const items = pkg.items.map((item) => `• ${escapeHtml(item.description)} × ${item.qty} (${item.kg} kg)`).join("\n");
  return [
    `📦 <b>${escapeHtml(pkg.tracking)}</b> · ${express ? "🚨 EXPRESS" : "Normal"}`,
    `${escapeHtml(pkg.from)} → ${escapeHtml(pkg.to)} · ${pkg.weight} kg`,
    "",
    `<b>Sender:</b> ${escapeHtml(pkg.senderContact.name)} ${escapeHtml(pkg.senderContact.phone)}`,
    `<b>Receiver:</b> ${escapeHtml(pkg.receiverContact.name)} ${escapeHtml(pkg.receiverContact.phone)}`,
    `<b>Drop-off:</b> ${escapeHtml(pkg.branch.name)}`,
    "",
    items,
    ...(pkg.notes ? ["", `<b>Notes:</b> ${escapeHtml(pkg.notes)}`] : []),
    "",
    `<i>Reply to this message to update:</i>\n${replyHelp()}`,
  ].join("\n");
}

// Posts a newly registered package to the group; returns where it landed so replies can be matched.
export async function announcePackage(pkg) {
  if (!telegramConfigured()) return { status: "not-configured" };
  try {
    const message = await sendMessage(newPackageText(pkg));
    return { status: "sent", chatId: String(message.chat.id), messageId: message.message_id };
  } catch (error) {
    console.error("Telegram post failed", error);
    return { status: "failed" };
  }
}
