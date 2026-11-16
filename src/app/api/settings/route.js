import { InvalidSetting, parseSettings, withDefaults } from "@/lib/portal-settings";
import { requireAccess } from "@/lib/server/auth";
import { getDb } from "@/lib/server/mongodb";

// PUT /api/settings: { business?, pickupReminderDays? }. Only the keys sent change.
export async function PUT(request) {
  const access = await requireAccess("settings.view");
  if (access.denied) return access.denied;

  let changes;
  try {
    changes = parseSettings(await request.json().catch(() => null));
  } catch (error) {
    if (error instanceof InvalidSetting) {
      return Response.json({ success: false, field: error.field, error: error.message }, { status: 400 });
    }
    throw error;
  }
  if (!Object.keys(changes).length) {
    return Response.json({ success: false, error: "Nothing to save" }, { status: 400 });
  }

  try {
    const saved = await (await getDb())
      .collection("settings")
      .findOneAndUpdate(
        { _id: "portal" },
        { $set: { ...changes, updatedAt: new Date(), updatedBy: access.user.name } },
        { upsert: true, returnDocument: "after" },
      );
    return Response.json({ success: true, settings: withDefaults(saved) });
  } catch (error) {
    console.error("Saving settings failed", error);
    return Response.json({ success: false, error: "Couldn't save settings" }, { status: 500 });
  }
}
