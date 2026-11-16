import { currentSession, endOtherSessions, unauthorized } from "@/lib/server/auth";
import { getDb } from "@/lib/server/mongodb";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/server/password.mjs";

// POST /api/account/password: { currentPassword, newPassword }. Signs out the user's other devices.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  const problem = passwordProblem(newPassword);
  if (problem) return Response.json({ success: false, field: "newPassword", error: problem }, { status: 400 });

  try {
    const session = await currentSession();
    if (!session) return unauthorized();
    const { user, sessionId } = session;

    if (!currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
      return Response.json(
        { success: false, field: "currentPassword", error: "That isn't your current password." },
        { status: 400 },
      );
    }
    if (currentPassword === newPassword) {
      return Response.json(
        { success: false, field: "newPassword", error: "Choose a password you aren't using now." },
        { status: 400 },
      );
    }

    const db = await getDb();
    const now = new Date();
    await db
      .collection("users")
      .updateOne({ _id: user._id }, { $set: { passwordHash: await hashPassword(newPassword), passwordChangedAt: now, updatedAt: now } });
    await endOtherSessions(db, user._id, sessionId);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Changing password failed", error);
    return Response.json({ success: false, error: "Couldn't change your password" }, { status: 500 });
  }
}
