import { requireAccess } from "@/lib/server/auth";
import { getDb } from "@/lib/server/mongodb";
import { moveToStep } from "@/lib/server/package-status";
import { syncPackagePosts } from "@/lib/server/telegram";

// POST /api/packages/status: hands packages over to their receiver (Ready for pickup → Delivered).
// Body: { trackings: [...], step: "delivered" }
// Packages reach In transit and Ready for pickup through their bag (see /api/bags), so the
// portal can't set those by hand. A package is only marked delivered once it is paid in full.
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
  if (step !== "delivered") {
    return Response.json(
      { success: false, error: "Packages move to In transit and Ready for pickup with their bag." },
      { status: 400 },
    );
  }

  try {
    const db = await getDb();
    // Packages outside the user's branch count as missing, just like ones that don't exist.
    const visible = await db
      .collection("packages")
      .find({ tracking: { $in: trackings }, ...access.scope }, { projection: { _id: 0, tracking: 1, events: 1 } })
      .toArray();
    // Only packages waiting at pickup can be handed over.
    const allowed = visible.filter((pkg) => pkg.events?.at(-1)?.step === "pickup").map((pkg) => pkg.tracking);
    const notReady = visible.filter((pkg) => !allowed.includes(pkg.tracking)).map((pkg) => pkg.tracking);
    const outside = trackings.filter((tracking) => !visible.some((pkg) => pkg.tracking === tracking));
    const result = await moveToStep(db, allowed, step, access.user.name);
    const { moved, unpaid, inBag } = result;
    const skipped = [...result.skipped, ...notReady];
    const missing = [...result.missing, ...outside];
    // Mirror the change in the Telegram group; failures are logged, not fatal.
    await syncPackagePosts(db, moved.map((pkg) => pkg.tracking));
    return Response.json({ success: true, moved, skipped, unpaid, missing, inBag });
  } catch (error) {
    console.error("Updating package status failed", error);
    return Response.json({ success: false, error: "Couldn't update the status" }, { status: 500 });
  }
}
