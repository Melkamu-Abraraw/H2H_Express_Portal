import { getDb } from "@/lib/server/mongodb";
import { moveToStep } from "@/lib/server/package-status";
import { escapeHtml, replyHelp, sendMessage, stepFromReply } from "@/lib/server/telegram";

// POST /api/telegram/webhook: Telegram calls this for every message in the group.
// Staff reply to a package post with a number or word and the package moves to that step.
export async function POST(request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("Forbidden", { status: 403 });
  }

  const update = await request.json().catch(() => null);
  const message = update?.message;
  const original = message?.reply_to_message;
  // Only replies in our group to a post the bot made; everything else is chatter.
  if (!message?.text || !original || String(message.chat.id) !== process.env.TELEGRAM_CHAT_ID) {
    return Response.json({ ok: true });
  }

  const reply = (text) => sendMessage(text, { chatId: message.chat.id, replyTo: message.message_id }).catch(() => {});

  try {
    const db = await getDb();
    const pkg = await db
      .collection("packages")
      .findOne(
        { "telegram.chatId": String(message.chat.id), "telegram.messageId": original.message_id },
        { projection: { tracking: 1 } },
      );
    if (!pkg) return Response.json({ ok: true });

    const step = stepFromReply(message.text);
    if (!step) {
      await reply(`Didn't understand "${escapeHtml(message.text)}". Reply with:\n${replyHelp()}`);
      return Response.json({ ok: true });
    }

    const by = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") || message.from?.username || "Telegram";
    const { moved, skipped, unpaid } = await moveToStep(db, [pkg.tracking], step.key, `${by} (Telegram)`);
    if (moved.length) await reply(`✅ <b>${escapeHtml(pkg.tracking)}</b> → ${step.label} (by ${escapeHtml(by)})`);
    else if (unpaid.length) await reply(`⚠️ ${escapeHtml(pkg.tracking)} still has a balance to pay, so it can't be marked Delivered yet.`);
    else if (skipped.length) await reply(`ℹ️ ${escapeHtml(pkg.tracking)} is already at or past "${step.label}".`);
  } catch (error) {
    console.error("Telegram reply failed", error);
    // 500 makes Telegram retry, which is what we want for a temporary database problem.
    return new Response("Error", { status: 500 });
  }
  return Response.json({ ok: true });
}
