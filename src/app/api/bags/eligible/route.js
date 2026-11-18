import { requireAccess } from "@/lib/server/auth";
import { bagErrorResponse, eligiblePackages } from "@/lib/server/bags";
import { getDb } from "@/lib/server/mongodb";

// GET /api/bags/eligible?bag=H2H-BAG-00001&q=: packages that can go into that bag (received at
// its origin branch, heading to its destination country, not in another bag).
export async function GET(request) {
  const access = await requireAccess("bags.create");
  if (access.denied) return access.denied;
  const params = new URL(request.url).searchParams;
  try {
    const packages = await eligiblePackages(await getDb(), access.user, (params.get("bag") ?? "").toUpperCase(), params.get("q"));
    return Response.json({ success: true, packages });
  } catch (error) {
    return bagErrorResponse(error, "Couldn't load packages");
  }
}
