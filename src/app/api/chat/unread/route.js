import { requireAccess } from "@/lib/server/auth";
import { unreadTotal } from "@/lib/server/chat";
import { getDb } from "@/lib/server/mongodb";

// GET /api/chat/unread: { count } of unread messages, for the sidebar badge.
export async function GET() {
  const access = await requireAccess("chat.use");
  if (access.denied) return access.denied;
  try {
    return Response.json({ success: true, count: await unreadTotal(await getDb(), access.user) });
  } catch (error) {
    console.error("Counting unread messages failed", error);
    return Response.json({ success: false, error: "Couldn't count messages" }, { status: 500 });
  }
}
