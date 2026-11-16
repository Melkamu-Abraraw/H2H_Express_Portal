import { requireAccess } from "@/lib/server/auth";
import { getConfig } from "@/lib/server/config";
import { getDb } from "@/lib/server/mongodb";

// GET /api/config: settings, prices per kg and routes, shared by every signed-in staff member.
export async function GET() {
  const access = await requireAccess();
  if (access.denied) return access.denied;
  try {
    return Response.json({ success: true, ...(await getConfig(await getDb())) });
  } catch (error) {
    console.error("Loading portal config failed", error);
    return Response.json({ success: false, error: "Couldn't load settings" }, { status: 500 });
  }
}
