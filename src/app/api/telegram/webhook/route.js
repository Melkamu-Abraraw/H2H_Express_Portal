import { getDb } from "@/lib/server/mongodb";
import { moveToStep } from "@/lib/server/package-status";
import {
  REPLY_STEPS,
  answerCallback,
  editMessage,
  escapeHtml,
  packageKeyboard,
  packageText,
  replyHelp,
  sendMessage,
  stepFromReply,
} from "@/lib/server/telegram";

const NO_PHOTOS = { projection: { photos: 0 } };

function personName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username || "Telegram";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Redraws the package's original post in the group so it always shows the latest status.
async function refreshPost(pkg) {
  if (!pkg.telegram) return;
  await editMessage(pkg.telegram.chatId, pkg.telegram.messageId, packageText(pkg), packageKeyboard(pkg)).catch(
    (error) => console.error("Refreshing Telegram post failed", error),
  );
}

// Button taps: "s:<tracking>:<step>" moves a package, "v:<tracking>" opens its card.
async function handleButton(query) {
  const message = query.message;
  if (!message || String(message.chat.id) !== process.env.TELEGRAM_CHAT_ID) {
    await answerCallback(query.id).catch(() => {});
    return;
  }
  const [kind, tracking, stepKey] = String(query.data).split(":");
  const db = await getDb();
  let toast;

  if (kind === "s") {
    const step = REPLY_STEPS.find((item) => item.key === stepKey);
    if (!step) return answerCallback(query.id);
    const { moved, unpaid, skipped } = await moveToStep(db, [tracking], step.key, `${personName(query.from)} (Telegram)`);
    if (moved.length) toast = `${step.label} ✓`;
    else if (unpaid.length) toast = "Balance still due, so it can't be marked Delivered yet.";
    else if (skipped.length) toast = "Already at or past that step.";
  }

  const pkg = await db.collection("packages").findOne({ tracking }, NO_PHOTOS);
  if (!pkg) return answerCallback(query.id, "Package not found.");
  // The card that was tapped may be a search result, so refresh it and the original post.
  await editMessage(message.chat.id, message.message_id, packageText(pkg), packageKeyboard(pkg));
  if (pkg.telegram?.messageId !== message.message_id) await refreshPost(pkg);
  await answerCallback(query.id, toast);
}

// /find <tracking number or name>
async function handleFind(message, term) {
  const reply = (text, replyMarkup) =>
    sendMessage(text, { chatId: message.chat.id, replyTo: message.message_id, replyMarkup });
  const search = term.trim().slice(0, 60);
  if (!search) return reply("Send <code>/find</code> followed by a tracking number or a name, e.g. <code>/find melkamu</code>");

  const db = await getDb();
  const regex = new RegExp(escapeRegExp(search), "i");
  const matches = await db
    .collection("packages")
    .find({ $or: [{ tracking: regex }, { sender: regex }, { receiver: regex }] }, NO_PHOTOS)
    .sort({ createdAt: -1 })
    .limit(6)
    .toArray();

  if (!matches.length) return reply(`No package matches "${escapeHtml(search)}".`);
  if (matches.length === 1) return reply(packageText(matches[0]), packageKeyboard(matches[0]));
  return reply(`${matches.length} packages match "${escapeHtml(search)}". Tap one:`, {
    inline_keyboard: matches.map((pkg) => [
      { text: `${pkg.tracking} · ${pkg.receiver}`, callback_data: `v:${pkg.tracking}` },
    ]),
  });
}

// Typing a number or word as a reply to a package post still works too.
async function handleReply(message) {
  const original = message.reply_to_message;
  const db = await getDb();
  const pkg = await db
    .collection("packages")
    .findOne({ "telegram.chatId": String(message.chat.id), "telegram.messageId": original.message_id }, NO_PHOTOS);
  if (!pkg) return;

  const reply = (text) => sendMessage(text, { chatId: message.chat.id, replyTo: message.message_id }).catch(() => {});
  const step = stepFromReply(message.text);
  if (!step) return void (await reply(`Didn't understand "${escapeHtml(message.text)}". Reply with:\n${replyHelp()}`));

  const by = personName(message.from);
  const { moved, skipped, unpaid } = await moveToStep(db, [pkg.tracking], step.key, `${by} (Telegram)`);
  if (moved.length) {
    await refreshPost(await db.collection("packages").findOne({ tracking: pkg.tracking }, NO_PHOTOS));
    await reply(`✅ <b>${escapeHtml(pkg.tracking)}</b> → ${step.label} (by ${escapeHtml(by)})`);
  } else if (unpaid.length) await reply(`⚠️ ${escapeHtml(pkg.tracking)} still has a balance to pay, so it can't be marked Delivered yet.`);
  else if (skipped.length) await reply(`ℹ️ ${escapeHtml(pkg.tracking)} is already at or past "${step.label}".`);
}

// POST /api/telegram/webhook: Telegram calls this for every update in the group.
export async function POST(request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("Forbidden", { status: 403 });
  }
  const update = await request.json().catch(() => null);

  try {
    if (update?.callback_query) {
      await handleButton(update.callback_query);
    } else {
      const message = update?.message;
      if (message?.text && String(message.chat.id) === process.env.TELEGRAM_CHAT_ID) {
        const find = message.text.match(/^\/find(?:@\w+)?(?:\s+([\s\S]*))?$/i);
        if (find) await handleFind(message, find[1] ?? "");
        else if (message.reply_to_message) await handleReply(message);
      }
    }
  } catch (error) {
    console.error("Telegram update failed", error);
    // 500 makes Telegram retry, which is what we want for a temporary database problem.
    return new Response("Error", { status: 500 });
  }
  return Response.json({ ok: true });
}
