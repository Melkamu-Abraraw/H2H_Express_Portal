import {
  conversationAccess,
  listMessages,
  MESSAGE_MAX,
  parsePhotos,
  PHOTOS_MAX,
  searchMessages,
  sendMessage,
  toId,
} from "@/lib/server/chat";

// GET /api/chat/:id/messages?after=<id>|before=<id>|q=<text>: up to 50 messages, oldest first.
// With q, the newest 50 that contain it.
export async function GET(request, { params }) {
  try {
    const access = await conversationAccess(params);
    if (access.denied) return access.denied;
    const search = new URL(request.url).searchParams;
    const query = (search.get("q") ?? "").trim().slice(0, 100);
    if (query) {
      return Response.json({ success: true, messages: await searchMessages(access.db, access.conversation._id, query), hasMore: false });
    }
    const result = await listMessages(access.db, access.conversation._id, {
      after: toId(search.get("after")),
      before: toId(search.get("before")),
    });
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("Loading messages failed", error);
    return Response.json({ success: false, error: "Couldn't load messages" }, { status: 500 });
  }
}

// POST /api/chat/:id/messages: { text, photos? } sends a message as the signed-in user.
// Photos must already be uploaded to the chat folder (see /api/uploads/sign).
export async function POST(request, { params }) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const photos = parsePhotos(body?.photos);
  if (photos === null) {
    return Response.json({ success: false, error: `Attach up to ${PHOTOS_MAX} photos uploaded here` }, { status: 400 });
  }
  if (!text && !photos.length) return Response.json({ success: false, error: "Write a message first" }, { status: 400 });
  if (text.length > MESSAGE_MAX) {
    return Response.json({ success: false, error: `Keep messages under ${MESSAGE_MAX} characters` }, { status: 400 });
  }
  try {
    const access = await conversationAccess(params);
    if (access.denied) return access.denied;
    const message = await sendMessage(access.db, access.user, access.conversation, text, photos);
    return Response.json({ success: true, message }, { status: 201 });
  } catch (error) {
    console.error("Sending message failed", error);
    return Response.json({ success: false, error: "Couldn't send the message" }, { status: 500 });
  }
}
