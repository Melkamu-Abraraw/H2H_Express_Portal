import { conversationAccess, setMuted } from "@/lib/server/chat";

// POST /api/chat/:id/mute: { muted } turns this conversation's unread badge off or on for the
// signed-in person. Messages still arrive; they just don't count on the sidebar.
export async function POST(request, { params }) {
  const body = await request.json().catch(() => null);
  if (typeof body?.muted !== "boolean") {
    return Response.json({ success: false, error: "Say whether to mute" }, { status: 400 });
  }
  try {
    const access = await conversationAccess(params);
    if (access.denied) return access.denied;
    await setMuted(access.db, access.user, access.conversation._id, body.muted);
    return Response.json({ success: true, muted: body.muted });
  } catch (error) {
    console.error("Muting conversation failed", error);
    return Response.json({ success: false, error: "Couldn't change notifications" }, { status: 500 });
  }
}
