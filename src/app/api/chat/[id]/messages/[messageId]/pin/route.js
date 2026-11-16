import { conversationAccess, MessageRefused, setPinned, toId } from "@/lib/server/chat";

// POST /api/chat/:id/messages/:messageId/pin: { pinned } pins or unpins a message for
// everyone in the conversation.
export async function POST(request, { params }) {
  const body = await request.json().catch(() => null);
  if (typeof body?.pinned !== "boolean") return Response.json({ success: false, error: "Say whether to pin" }, { status: 400 });
  try {
    const access = await conversationAccess(params);
    if (access.denied) return access.denied;
    const message = await setPinned(access.db, access.user, access.conversation, toId((await params).messageId), body.pinned);
    return Response.json({ success: true, message });
  } catch (error) {
    if (error instanceof MessageRefused) return Response.json({ success: false, error: error.message }, { status: error.status });
    console.error("Pinning failed", error);
    return Response.json({ success: false, error: "Couldn't pin the message" }, { status: 500 });
  }
}
