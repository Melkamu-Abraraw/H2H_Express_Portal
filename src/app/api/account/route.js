import { currentSession, publicUser, unauthorized } from "@/lib/server/auth";
import { getDb } from "@/lib/server/mongodb";

const NAME_MAX = 80;

// GET /api/account: the signed-in user.
export async function GET() {
  try {
    const session = await currentSession();
    if (!session) return unauthorized();
    return Response.json({ success: true, user: publicUser(session.user) });
  } catch (error) {
    console.error("Loading account failed", error);
    return Response.json({ success: false, error: "Couldn't load your account" }, { status: 500 });
  }
}

// PATCH /api/account: { name }. Only the signed-in user's own name; email and role are set by an owner.
export async function PATCH(request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (!name) return Response.json({ success: false, error: "Enter your name." }, { status: 400 });
  if (name.length > NAME_MAX) {
    return Response.json({ success: false, error: `Use at most ${NAME_MAX} characters.` }, { status: 400 });
  }

  try {
    const session = await currentSession();
    if (!session) return unauthorized();
    const db = await getDb();
    const user = await db
      .collection("users")
      .findOneAndUpdate(
        { _id: session.user._id },
        { $set: { name, updatedAt: new Date() } },
        { returnDocument: "after" },
      );
    return Response.json({ success: true, user: publicUser(user) });
  } catch (error) {
    console.error("Saving account failed", error);
    return Response.json({ success: false, error: "Couldn't save your name" }, { status: 500 });
  }
}
