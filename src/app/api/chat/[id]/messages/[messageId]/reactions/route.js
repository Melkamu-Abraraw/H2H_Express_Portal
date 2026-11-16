import { conversationAccess, MessageRefused, toggleReaction, toId } from "@/lib/server/chat";

// POST /api/chat/:id/messages/:messageId/reactions: { emoji } adds your reaction, or removes it
// if you'd already reacted with that emoji.
export async function POST(request, { params }) {
  const body = await request.json().catch(() => null);
  try {
    const access = await conversationAccess(params);
    if (access.denied) return access.denied;
    const message = await toggleReaction(access.db, access.user, access.conversation, toId((await params).messageId), body?.emoji);
    return Response.json({ success: true, message });
  } catch (error) {
    if (error instanceof MessageRefused) return Response.json({ success: false, error: error.message }, { status: error.status });
    console.error("Reacting failed", error);
    return Response.json({ success: false, error: "Couldn't add the reaction" }, { status: 500 });
  }
}
