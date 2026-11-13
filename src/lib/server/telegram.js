import { trackingSteps } from "@/components/admin/package-tracking";

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

export function sendMessage(text, { chatId = process.env.TELEGRAM_CHAT_ID, replyTo, replyMarkup } = {}) {
  return call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyTo && { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } }),
    ...(replyMarkup && { reply_markup: replyMarkup }),
  });
}

// Rewrites a post in place. Telegram errors when nothing changed; that's fine to ignore.
export async function editMessage(chatId, messageId, text, replyMarkup) {
  try {
    await call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: replyMarkup ?? { inline_keyboard: [] },
    });
  } catch (error) {
    if (!/not modified/i.test(error.message)) throw error;
  }
}

export function answerCallback(id, text) {
  return call("answerCallbackQuery", { callback_query_id: id, ...(text && { text, show_alert: text.length > 60 }) });
}

export function registerCommands() {
  return call("setMyCommands", {
    commands: [{ command: "find", description: "Find a package by tracking number or name" }],
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

function stepLabel(pkg) {
  const key = pkg.events.at(-1).step;
  return trackingSteps(pkg.route).find((step) => step.key === key)?.label ?? key;
}

// The card shown in the group. It is edited in place as the package moves, so one post
// per package always shows its latest status.
export function packageText(pkg) {
  const express = pkg.shipping === "express";
  const last = pkg.events.at(-1);
  const items = pkg.items.map((item) => `• ${escapeHtml(item.description)} × ${item.qty} (${item.kg} kg)`).join("\n");
  const delivered = last.step === "delivered";
  return [
    `📦 <b>${escapeHtml(pkg.tracking)}</b> · ${express ? "🚨 EXPRESS" : "Normal"}`,
    `${escapeHtml(pkg.from)} → ${escapeHtml(pkg.to)} · ${pkg.weight} kg`,
    "",
    `<b>Status: ${delivered ? "✅ " : "🔄 "}${escapeHtml(stepLabel(pkg))}</b>${last.by ? ` · ${escapeHtml(last.by.replace(" (Telegram)", ""))}` : ""}`,
    "",
    `<b>Sender:</b> ${escapeHtml(pkg.senderContact.name)} ${escapeHtml(pkg.senderContact.phone)}`,
    `<b>Receiver:</b> ${escapeHtml(pkg.receiverContact.name)} ${escapeHtml(pkg.receiverContact.phone)}`,
    `<b>Drop-off:</b> ${escapeHtml(pkg.branch.name)}`,
    "",
    items,
    ...(pkg.notes ? ["", `<b>Notes:</b> ${escapeHtml(pkg.notes)}`] : []),
  ].join("\n");
}

// One button per step the package hasn't reached yet.
export function packageKeyboard(pkg) {
  const keys = trackingSteps(pkg.route).map((step) => step.key);
  const at = keys.indexOf(pkg.events.at(-1).step);
  const buttons = REPLY_STEPS.filter((step) => keys.indexOf(step.key) > at).map((step) => ({
    text: step.label,
    callback_data: `s:${pkg.tracking}:${step.key}`,
  }));
  const rows = [];
  for (let index = 0; index < buttons.length; index += 2) rows.push(buttons.slice(index, index + 2));
  return { inline_keyboard: rows };
}

// Posts a newly registered package to the group; returns where it landed so replies can be matched.
export async function announcePackage(pkg) {
  if (!telegramConfigured()) return { status: "not-configured" };
  try {
    const message = await sendMessage(packageText(pkg), { replyMarkup: packageKeyboard(pkg) });
    return { status: "sent", chatId: String(message.chat.id), messageId: message.message_id };
  } catch (error) {
    console.error("Telegram post failed", error);
    return { status: "failed" };
  }
}

// Redraws the group posts of packages whose status changed elsewhere (e.g. the admin portal),
// so the card shows the new status and only the steps still ahead as buttons.
export async function syncPackagePosts(db, trackings) {
  if (!telegramConfigured() || !trackings.length) return;
  const packages = await db
    .collection("packages")
    .find({ tracking: { $in: trackings }, "telegram.messageId": { $exists: true } }, { projection: { photos: 0 } })
    .toArray();
  await Promise.all(
    packages.map((pkg) =>
      editMessage(pkg.telegram.chatId, pkg.telegram.messageId, packageText(pkg), packageKeyboard(pkg)).catch((error) =>
        console.error("Syncing Telegram post failed", error),
      ),
    ),
  );
}
