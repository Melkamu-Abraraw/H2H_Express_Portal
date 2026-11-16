import { conversationAccess, markRead } from "@/lib/server/chat";

// POST /api/chat/:id/read: everything in this conversation up to now has been seen.
export async function POST(request, { params }) {
  try {
    const access = await conversationAccess(params);
    if (access.denied) return access.denied;
    await markRead(access.db, access.user, access.conversation._id);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Marking conversation read failed", error);
    return Response.json({ success: false, error: "Couldn't update the conversation" }, { status: 500 });
  }
}
