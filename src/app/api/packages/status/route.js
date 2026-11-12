import { getDb } from "@/lib/server/mongodb";
import { moveToStep } from "@/lib/server/package-status";

// POST /api/packages/status: moves packages forward to a tracking step.
// Body: { trackings: [...], step: "departed" | "arrived" | ... }
// A package is only marked delivered once it is paid in full.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Request body isn't valid JSON" }, { status: 400 });
  }
  const trackings = Array.isArray(body.trackings)
    ? [...new Set(body.trackings.filter((value) => typeof value === "string"))].slice(0, 500)
    : [];
  const step = typeof body.step === "string" ? body.step : "";
  if (!trackings.length || !step) {
    return Response.json({ success: false, error: "Packages and a step are required" }, { status: 400 });
  }

  try {
    const db = await getDb();
    const { moved, skipped, unpaid, missing } = await moveToStep(db, trackings, step);
    return Response.json({ success: true, moved, skipped, unpaid, missing });
  } catch (error) {
    console.error("Updating package status failed", error);
    return Response.json({ success: false, error: "Couldn't update the status" }, { status: 500 });
  }
}
