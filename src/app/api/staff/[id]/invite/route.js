import { requireAccess } from "@/lib/server/auth";
import { getDb } from "@/lib/server/mongodb";
import { issueInvite, staffId, staffOut } from "@/lib/server/staff";

// POST /api/staff/:id/invite: sends a fresh invitation; the previous link stops working.
export async function POST(request, { params }) {
  const access = await requireAccess("staff.manage");
  if (access.denied) return access.denied;
  const id = staffId((await params).id);
  if (!id) return Response.json({ success: false, error: "Staff member not found" }, { status: 404 });

  try {
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: id });
    if (!user) return Response.json({ success: false, error: "Staff member not found" }, { status: 404 });
    if (user.passwordHash) {
      return Response.json({ success: false, error: "They've already activated their account." }, { status: 409 });
    }
    if (user.disabled) {
      return Response.json({ success: false, error: "Reactivate them before sending an invitation." }, { status: 409 });
    }
    const invite = await issueInvite(db, user, access.user, request);
    const saved = await db.collection("users").findOne({ _id: id });
    return Response.json({ success: true, member: staffOut(saved), invite });
  } catch (error) {
    console.error("Resending invitation failed", error);
    return Response.json({ success: false, error: "Couldn't send the invitation" }, { status: 500 });
  }
}
