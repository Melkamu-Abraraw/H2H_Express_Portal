import { requireAccess } from "@/lib/server/auth";
import { getDb } from "@/lib/server/mongodb";

const MAX_DONE = 300;

// Each person's notification list: what they've already dealt with, and when they started
// (older packages and staff never flood the list). Kept on their account, so it follows them
// from device to device.

// GET /api/notifications: { baseline, done }
export async function GET() {
  const access = await requireAccess();
  if (access.denied) return access.denied;
  try {
    const users = (await getDb()).collection("users");
    let state = access.user.notifications;
    if (!state?.baseline) {
      state = { baseline: new Date(), done: [] };
      await users.updateOne({ _id: access.user._id, "notifications.baseline": { $exists: false } }, { $set: { notifications: state } });
    }
    return Response.json({ success: true, baseline: state.baseline, done: state.done ?? [] });
  } catch (error) {
    console.error("Loading notifications failed", error);
    return Response.json({ success: false, error: "Couldn't load notifications" }, { status: 500 });
  }
}

// POST /api/notifications: { done: [ids] } marks those as dealt with.
export async function POST(request) {
  const access = await requireAccess();
  if (access.denied) return access.denied;
  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.done)
    ? [...new Set(body.done.filter((id) => typeof id === "string" && id.length <= 80))].slice(0, MAX_DONE)
    : [];
  if (!ids.length) return Response.json({ success: false, error: "Nothing to mark" }, { status: 400 });
  try {
    const users = (await getDb()).collection("users");
    const done = (access.user.notifications?.done ?? []).filter((id) => !ids.includes(id));
    const next = [...done, ...ids].slice(-MAX_DONE);
    await users.updateOne(
      { _id: access.user._id },
      { $set: { "notifications.done": next, ...(!access.user.notifications?.baseline && { "notifications.baseline": new Date() }) } },
    );
    return Response.json({ success: true, done: next });
  } catch (error) {
    console.error("Saving notifications failed", error);
    return Response.json({ success: false, error: "Couldn't save notifications" }, { status: 500 });
  }
}
