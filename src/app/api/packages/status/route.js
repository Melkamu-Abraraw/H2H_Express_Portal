import { requireAccess } from "@/lib/server/auth";
import { getDb } from "@/lib/server/mongodb";
import { moveToStep } from "@/lib/server/package-status";
import { syncPackagePosts } from "@/lib/server/telegram";

// POST /api/packages/status: moves packages forward to a tracking step.
// Body: { trackings: [...], step: "departed" | "arrived" | ... }
// A package is only marked delivered once it is paid in full.
export async function POST(request) {
  const access = await requireAccess("packages.status");
  if (access.denied) return access.denied;
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
    // Packages outside the user's branch count as missing, just like ones that don't exist.
    const allowed = Object.keys(access.scope).length
      ? await db
          .collection("packages")
          .find({ tracking: { $in: trackings }, ...access.scope }, { projection: { _id: 0, tracking: 1 } })
          .toArray()
          .then((rows) => rows.map((row) => row.tracking))
      : trackings;
    const outside = trackings.filter((tracking) => !allowed.includes(tracking));
    const result = await moveToStep(db, allowed, step, access.user.name);
    const { moved, skipped, unpaid } = result;
    const missing = [...result.missing, ...outside];
    // Mirror the change in the Telegram group; failures are logged, not fatal.
    await syncPackagePosts(db, moved.map((pkg) => pkg.tracking));
    return Response.json({ success: true, moved, skipped, unpaid, missing });
  } catch (error) {
    console.error("Updating package status failed", error);
    return Response.json({ success: false, error: "Couldn't update the status" }, { status: 500 });
  }
}
