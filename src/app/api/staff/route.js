import { requireAccess } from "@/lib/server/auth";
import { getDb } from "@/lib/server/mongodb";
import { InvalidStaff, issueInvite, parseStaff, staffOut } from "@/lib/server/staff";

// GET /api/staff: everyone with portal access, including people who haven't activated yet.
export async function GET() {
  const access = await requireAccess("staff.manage");
  if (access.denied) return access.denied;
  try {
    const db = await getDb();
    const users = await db.collection("users").find({}).sort({ name: 1 }).toArray();
    return Response.json({ success: true, staff: users.map(staffOut) });
  } catch (error) {
    console.error("Loading staff failed", error);
    return Response.json({ success: false, error: "Couldn't load staff" }, { status: 500 });
  }
}

// POST /api/staff: { name, email, phone?, role, branch } → creates the account and emails an
// invitation to set a password.
export async function POST(request) {
  const access = await requireAccess("staff.manage");
  if (access.denied) return access.denied;

  let input;
  try {
    input = parseStaff(await request.json().catch(() => null));
  } catch (error) {
    if (error instanceof InvalidStaff) {
      return Response.json({ success: false, field: error.field, error: error.message }, { status: 400 });
    }
    throw error;
  }

  try {
    const db = await getDb();
    const now = new Date();
    const user = { ...input, createdAt: now, updatedAt: now, createdBy: access.user._id };
    try {
      const { insertedId } = await db.collection("users").insertOne(user);
      user._id = insertedId;
    } catch (error) {
      if (error?.code === 11000) {
        return Response.json(
          { success: false, field: "email", error: "Someone on the team already uses this email." },
          { status: 409 },
        );
      }
      throw error;
    }
    const invite = await issueInvite(db, user, access.user, request);
    const saved = await db.collection("users").findOne({ _id: user._id });
    return Response.json({ success: true, member: staffOut(saved), invite }, { status: 201 });
  } catch (error) {
    console.error("Adding staff failed", error);
    return Response.json({ success: false, error: "Couldn't add the staff member" }, { status: 500 });
  }
}
