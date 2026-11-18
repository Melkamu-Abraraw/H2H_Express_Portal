import { requireAccess } from "@/lib/server/auth";
import { bagErrorResponse, bagReport } from "@/lib/server/bags";
import { getDb } from "@/lib/server/mongodb";

// GET /api/bags/reports?from=yyyy-MM-dd&to=yyyy-MM-dd: bag movement and exception figures.
export async function GET(request) {
  const access = await requireAccess("bags.reports");
  if (access.denied) return access.denied;
  try {
    const report = await bagReport(await getDb(), access.user, new URL(request.url).searchParams);
    return Response.json({ success: true, ...report });
  } catch (error) {
    return bagErrorResponse(error, "Couldn't load the report");
  }
}
