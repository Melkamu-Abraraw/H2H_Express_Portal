import { homePage, roleLabel } from "@/lib/permissions";
import { signIn } from "@/lib/server/auth";
import { getDb } from "@/lib/server/mongodb";
import { hashPassword, passwordProblem } from "@/lib/server/password.mjs";
import { userFromInvite } from "@/lib/server/staff";

function invalid() {
  return Response.json(
    { success: false, error: "This invitation link has expired or was already used. Ask your manager to send a new one." },
    { status: 410 },
  );
}

// GET /api/invite?token=…: checks an invitation and says who it's for.
export async function GET(request) {
  try {
    const user = await userFromInvite(await getDb(), new URL(request.url).searchParams.get("token"));
    if (!user) return invalid();
    return Response.json({
      success: true,
      invite: {
        name: user.name,
        email: user.email,
        role: roleLabel(user.role),
        branch: user.branch?.name ?? "All branches",
        company: "Hand to Hand Express",
      },
    });
  } catch (error) {
    console.error("Checking invitation failed", error);
    return Response.json({ success: false, error: "Couldn't check the invitation" }, { status: 500 });
  }
}

// POST /api/invite: { token, password } → activates the account and signs them in.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  const problem = passwordProblem(password);
  if (problem) return Response.json({ success: false, field: "password", error: problem }, { status: 400 });

  try {
    const db = await getDb();
    const user = await userFromInvite(db, body?.token);
    if (!user) return invalid();
    const now = new Date();
    // Matching on the token hash again makes the link single-use even if opened twice at once.
    const activated = await db.collection("users").findOneAndUpdate(
      { _id: user._id, "invite.tokenHash": user.invite.tokenHash, passwordHash: { $exists: false } },
      {
        $set: { passwordHash: await hashPassword(password), passwordChangedAt: now, activatedAt: now, updatedAt: now },
        $unset: { invite: "" },
      },
      { returnDocument: "after" },
    );
    if (!activated) return invalid();
    await signIn(db, activated);
    return Response.json({ success: true, home: homePage(activated) });
  } catch (error) {
    console.error("Activating account failed", error);
    return Response.json({ success: false, error: "Couldn't activate your account. Try again." }, { status: 500 });
  }
}
