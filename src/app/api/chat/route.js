import { requireAccess } from "@/lib/server/auth";
import { directConversation, listConversations, toId } from "@/lib/server/chat";
import { getDb } from "@/lib/server/mongodb";

// GET /api/chat: the conversations this person can see (with unread counts) and the team.
export async function GET() {
  const access = await requireAccess("chat.use");
  if (access.denied) return access.denied;
  try {
    return Response.json({ success: true, ...(await listConversations(await getDb(), access.user)) });
  } catch (error) {
    console.error("Loading chat failed", error);
    return Response.json({ success: false, error: "Couldn't load chat" }, { status: 500 });
  }
}

// POST /api/chat: { userId } opens the direct conversation with that person.
export async function POST(request) {
  const access = await requireAccess("chat.use");
  if (access.denied) return access.denied;
  const body = await request.json().catch(() => null);
  const otherId = toId(body?.userId);
  if (!otherId || otherId.equals(access.user._id)) {
    return Response.json({ success: false, error: "Choose someone to message" }, { status: 400 });
  }
  try {
    const conversation = await directConversation(await getDb(), access.user, otherId);
    if (!conversation) return Response.json({ success: false, error: "That person can't use the portal" }, { status: 404 });
    return Response.json({ success: true, id: String(conversation._id) });
  } catch (error) {
    console.error("Opening direct message failed", error);
    return Response.json({ success: false, error: "Couldn't open the conversation" }, { status: 500 });
  }
}
