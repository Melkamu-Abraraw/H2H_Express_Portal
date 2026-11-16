import { requireAccess } from "@/lib/server/auth";
import { realtimeTokenFor } from "@/lib/server/chat";
import { getDb } from "@/lib/server/mongodb";
import { realtimeEnabled } from "@/lib/server/realtime";

// GET /api/chat/realtime: an Ably token request for the signed-in person, or
// { enabled: false } when real-time isn't set up (chat then polls).
export async function GET() {
  const access = await requireAccess("chat.use");
  if (access.denied) return access.denied;
  if (!realtimeEnabled()) return Response.json({ success: true, enabled: false });
  try {
    const tokenRequest = await realtimeTokenFor(await getDb(), access.user);
    return Response.json({ success: true, enabled: true, tokenRequest });
  } catch (error) {
    console.error("Creating real-time token failed", error);
    return Response.json({ success: false, error: "Real-time chat isn't available" }, { status: 500 });
  }
}
