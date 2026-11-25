import { requireAccess } from "@/lib/server/auth";
import { bagErrorResponse, incomingBags } from "@/lib/server/bags";
import { getDb } from "@/lib/server/mongodb";

// GET /api/bags/incoming: bags in transit to the user's branch (every branch for staff on all).
export async function GET() {
  const access = await requireAccess("bags.view");
  if (access.denied) return access.denied;
  try {
    const bags = await incomingBags(await getDb(), access.user);
    return Response.json({ success: true, bags, branch: access.user.branch ?? null });
  } catch (error) {
    return bagErrorResponse(error, "Couldn't load incoming boxes");
  }
}
