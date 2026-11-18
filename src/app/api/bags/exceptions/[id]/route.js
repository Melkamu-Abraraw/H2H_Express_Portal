import { requireAccess } from "@/lib/server/auth";
import { bagErrorResponse, resolveException } from "@/lib/server/bags";
import { getDb } from "@/lib/server/mongodb";

// POST /api/bags/exceptions/:id: closes a missing/damaged case. Body: { resolution, notes }
//   missing: "found" (the package is marked arrived) or "lost"; damaged: "accepted"
export async function POST(request, { params }) {
  const access = await requireAccess("bags.resolve");
  if (access.denied) return access.denied;
  const body = await request.json().catch(() => null);
  const { id } = await params;
  try {
    const result = await resolveException(await getDb(), access.user, id, body);
    return Response.json({ success: true, ...result });
  } catch (error) {
    return bagErrorResponse(error, "Couldn't resolve the exception");
  }
}
