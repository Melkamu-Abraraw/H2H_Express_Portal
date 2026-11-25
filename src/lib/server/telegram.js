import { lastStep, stepsFor, trackingSteps } from "@/components/admin/package-tracking";
import { handlingLabels } from "@/lib/handling";
import { otherCurrency } from "@/lib/exchange";
import { getExchangeRates } from "@/lib/server/exchange";
import { isPhotoKey, signedUrl } from "@/lib/server/r2";

const API = "https://api.telegram.org";

export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

// Telegram limits a photo's caption to 1024 characters. Only cards well under it go out as a
// photo, leaving room for the status line to grow when the card is edited later.
const CAPTION_MAX = 900;
// An album holds at most 10 photos.
const ALBUM_MAX = 10;

async function call(method, body, timeout = 8000) {
  const response = await fetch(`${API}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
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

// Telegram downloads the photo from its URL, which can take longer than a text message.
function sendPhoto(url, caption, { chatId = process.env.TELEGRAM_CHAT_ID, replyMarkup } = {}) {
  return call(
    "sendPhoto",
    { chat_id: chatId, photo: url, caption, parse_mode: "HTML", ...(replyMarkup && { reply_markup: replyMarkup }) },
    20000,
  );
}

// One photo on its own, or several as an album, replying to the package's card.
function sendPhotos(urls, { chatId = process.env.TELEGRAM_CHAT_ID, replyTo } = {}) {
  const reply = replyTo && { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } };
  if (urls.length === 1) return call("sendPhoto", { chat_id: chatId, photo: urls[0], ...reply }, 20000);
  return call("sendMediaGroup", { chat_id: chatId, media: urls.map((url) => ({ type: "photo", media: url })), ...reply }, 30000);
}

// Rewrites a post in place. A card posted as a photo keeps its text in the caption, which
// Telegram edits with a different method. Telegram errors when nothing changed; that's fine to ignore.
export async function editMessage(chatId, messageId, text, replyMarkup) {
  const fields = { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: replyMarkup ?? { inline_keyboard: [] } };
  try {
    try {
      await call("editMessageText", { ...fields, text, disable_web_page_preview: true });
    } catch (error) {
      if (!/no text in the message/i.test(error.message)) throw error;
      await call("editMessageCaption", { ...fields, caption: text });
    }
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
  { key: "pickup", label: "Ready for pickup", words: ["ready", "pickup", "arrived"] },
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
  const key = lastStep(pkg);
  if (key === "lost") return "Lost";
  if (key === "damaged") return "Damaged";
  return stepsFor(pkg).find((step) => step.key === key)?.label ?? key;
}

// The card shown in the group. It is edited in place as the package moves, so one post
// per package always shows its latest status.
export function packageText(pkg, rate = null) {
  const express = pkg.shipping === "express";
  const last = pkg.events.at(-1);
  const items = pkg.items.map((item) => `• ${escapeHtml(item.description)} × ${item.qty} (${item.kg} kg)`).join("\n");
  const delivered = last.step === "delivered";
  const due = Math.max(0, Math.round((pkg.charge - pkg.amountPaid) * 100) / 100);
  const other = otherCurrency(pkg, due, rate);
  return [
    `📦 <b>${escapeHtml(pkg.tracking)}</b> · ${express ? "🚨 EXPRESS" : "Normal"}`,
    `${escapeHtml(pkg.from)} → ${escapeHtml(pkg.to)} · ${pkg.weight} kg`,
    "",
    `<b>Status: ${delivered ? "✅ " : "🔄 "}${escapeHtml(stepLabel(pkg))}</b>${last.by ? ` · ${escapeHtml(last.by.replace(" (Telegram)", ""))}` : ""}`,
    "",
    `<b>Sender:</b> ${escapeHtml(pkg.senderContact.name)} ${escapeHtml(pkg.senderContact.phone)}`,
    `<b>Receiver:</b> ${escapeHtml(pkg.receiverContact.name)} ${escapeHtml(pkg.receiverContact.phone)}`,
    `<b>Drop-off:</b> ${escapeHtml(pkg.branch.name)}`,
    ...(handlingLabels(pkg.handling).length ? [`⚠️ <b>${escapeHtml(handlingLabels(pkg.handling).join(" · "))}</b>`] : []),
    ...(due > 0
      ? [`<b>Balance due:</b> ${escapeHtml(pkg.currency ?? "CAD")} ${due.toFixed(2)}${other ? ` ≈ ${other}` : ""}`]
      : []),
    "",
    items,
    ...(pkg.notes ? ["", `<b>Notes:</b> ${escapeHtml(pkg.notes)}`] : []),
  ].join("\n");
}

// One button per step the package hasn't reached yet.
export function packageKeyboard(pkg) {
  const keys = trackingSteps(pkg.route).map((step) => step.key);
  // A lost or damaged package is closed: no buttons.
  if (["lost", "damaged"].includes(lastStep(pkg))) return { inline_keyboard: [] };
  const at = keys.indexOf(lastStep(pkg));
  const labels = new Map(stepsFor(pkg).map((step) => [step.key, step.label]));
  // Same wording as the portal's timeline; the first step (received) is never a button.
  const buttons = REPLY_STEPS.filter((step) => keys.indexOf(step.key) > at).map((step) => ({
    text: labels.get(step.key) ?? step.label,
    callback_data: `s:${pkg.tracking}:${step.key}`,
  }));
  const rows = [];
  for (let index = 0; index < buttons.length; index += 2) rows.push(buttons.slice(index, index + 2));
  return { inline_keyboard: rows };
}

// Telegram downloads photos itself, so it needs a link that works without signing in: a signed R2
// link (it fetches right away, so an hour is plenty), or a photo's own public https link.
function telegramPhotoUrl(photo) {
  if (isPhotoKey(photo?.key)) {
    try {
      return signedUrl(photo.key, 3600);
    } catch {
      return null;
    }
  }
  return /^https:\/\//.test(photo?.url ?? "") ? photo.url : null;
}

// Posts a newly registered package to the group; returns where it landed so replies can be matched.
// With photos, the card itself is the first photo (details in the caption) and any others follow
// as an album replying to it. A card too long for a caption stays text, with every photo in the reply.
export async function announcePackage(pkg, rate = null) {
  if (!telegramConfigured()) return { status: "not-configured" };
  const text = packageText(pkg, rate);
  const replyMarkup = packageKeyboard(pkg);
  const photos = (pkg.photos ?? []).map(telegramPhotoUrl).filter(Boolean).slice(0, ALBUM_MAX + 1);

  let message = null;
  let rest = photos;
  if (photos.length && text.length <= CAPTION_MAX) {
    try {
      message = await sendPhoto(photos[0], text, { replyMarkup });
      rest = photos.slice(1);
    } catch (error) {
      // Telegram couldn't fetch or accept the photo: post the card as text so it isn't lost.
      console.error("Telegram photo post failed, sending text instead", error);
    }
  }
  try {
    message ??= await sendMessage(text, { replyMarkup });
  } catch (error) {
    console.error("Telegram post failed", error);
    return { status: "failed" };
  }

  if (rest.length) {
    await sendPhotos(rest.slice(0, ALBUM_MAX), { chatId: message.chat.id, replyTo: message.message_id }).catch((error) =>
      console.error("Sending package photos to Telegram failed", error),
    );
  }
  return { status: "sent", chatId: String(message.chat.id), messageId: message.message_id };
}

// Redraws the group posts of packages whose status changed elsewhere (e.g. the admin portal),
// so the card shows the new status and only the steps still ahead as buttons.
export async function syncPackagePosts(db, trackings) {
  if (!telegramConfigured() || !trackings.length) return;
  const packages = await db
    .collection("packages")
    .find({ tracking: { $in: trackings }, "telegram.messageId": { $exists: true } }, { projection: { photos: 0 } })
    .toArray();
  const rate = await getExchangeRates(db).catch(() => null);
  await Promise.all(
    packages.map((pkg) =>
      editMessage(pkg.telegram.chatId, pkg.telegram.messageId, packageText(pkg, rate), packageKeyboard(pkg)).catch((error) =>
        console.error("Syncing Telegram post failed", error),
      ),
    ),
  );
}
