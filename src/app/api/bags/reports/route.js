import { requireAccess } from "@/lib/server/auth";
import { bagErrorResponse, openExceptions } from "@/lib/server/bags";
import { getDb } from "@/lib/server/mongodb";

// GET /api/bags/reports: missing and damaged packages from received bags that are still open.
// They're resolved through POST /api/bags/exceptions/:id.
export async function GET() {
  const access = await requireAccess("bags.reports");
  if (access.denied) return access.denied;
  try {
    const exceptions = await openExceptions(await getDb(), access.user);
    return Response.json({ success: true, exceptions });
  } catch (error) {
    return bagErrorResponse(error, "Couldn't load the exceptions");
  }
}
