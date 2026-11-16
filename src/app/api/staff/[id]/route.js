import { requireAccess } from "@/lib/server/auth";
import { getDb } from "@/lib/server/mongodb";
import { activeOwnerFilter, InvalidStaff, parseStaff, staffId, staffOut } from "@/lib/server/staff";

function failed(error, status = 400, field) {
  return Response.json({ success: false, error, ...(field && { field }) }, { status });
}

// The portal must always keep one active owner who can manage staff.
async function wouldLeaveNoOwner(db, user) {
  if (user.role !== "owner" || user.disabled || !user.passwordHash) return false;
  return (await db.collection("users").countDocuments(activeOwnerFilter(user._id), { limit: 1 })) === 0;
}

// PATCH /api/staff/:id: { name?, phone?, role?, branch?, active? }. Email can't change: it's
// how the person signs in.
export async function PATCH(request, { params }) {
  const access = await requireAccess("staff.manage");
  if (access.denied) return access.denied;
  const id = staffId((await params).id);
  if (!id) return failed("Staff member not found", 404);

  const body = await request.json().catch(() => null);
  let changes;
  try {
    changes = parseStaff(body, { partial: true });
  } catch (error) {
    if (error instanceof InvalidStaff) return failed(error.message, 400, error.field);
    throw error;
  }
  const deactivate = body?.active === false;
  const reactivate = body?.active === true;

  try {
    const db = await getDb();
    const users = db.collection("users");
    const user = await users.findOne({ _id: id });
    if (!user) return failed("Staff member not found", 404);

    const demoted = changes.role !== undefined && changes.role !== "owner";
    if ((demoted || deactivate) && (await wouldLeaveNoOwner(db, user))) {
      return failed("This is the only active owner. Make someone else an owner first.", 409);
    }
    if (deactivate && user._id.equals(access.user._id)) {
      return failed("You can't deactivate yourself.", 409);
    }

    const update = { $set: { ...changes, updatedAt: new Date() } };
    if (deactivate) update.$set.disabled = true;
    if (reactivate) update.$unset = { disabled: "" };
    const saved = await users.findOneAndUpdate({ _id: id }, update, { returnDocument: "after" });
    // Deactivated staff are signed out at once, not when their session runs out.
    if (deactivate) await db.collection("sessions").deleteMany({ userId: id });
    return Response.json({ success: true, member: staffOut(saved) });
  } catch (error) {
    console.error("Saving staff member failed", error);
    return failed("Couldn't save the staff member", 500);
  }
}

// DELETE /api/staff/:id: removes the account. Payments and updates they recorded keep their name.
export async function DELETE(request, { params }) {
  const access = await requireAccess("staff.manage");
  if (access.denied) return access.denied;
  const id = staffId((await params).id);
  if (!id) return failed("Staff member not found", 404);

  try {
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: id });
    if (!user) return failed("Staff member not found", 404);
    if (user._id.equals(access.user._id)) return failed("You can't remove yourself.", 409);
    if (await wouldLeaveNoOwner(db, user)) {
      return failed("This is the only active owner. Make someone else an owner first.", 409);
    }
    await db.collection("users").deleteOne({ _id: id });
    await db.collection("sessions").deleteMany({ userId: id });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Removing staff member failed", error);
    return failed("Couldn't remove the staff member", 500);
  }
}
