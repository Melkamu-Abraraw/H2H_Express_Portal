import { homePage } from "@/lib/permissions";
import { publicUser, signIn } from "@/lib/server/auth";
import { getDb } from "@/lib/server/mongodb";
import { hashPassword, verifyPassword } from "@/lib/server/password.mjs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
let decoyHash;

function rejected() {
  return Response.json({ success: false, error: "That email and password don't match" }, { status: 401 });
}

// POST /api/auth/login: { email, password } → sets the session cookie.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!EMAIL.test(email) || !password || password.length > 200) return rejected();

  try {
    const db = await getDb();
    const users = db.collection("users");
    const user = await users.findOne({ email });

    // Invited people have no password until they open their invitation. They get the same answer
    // as an unknown email, so the form can't be used to find out who has been invited.
    if (!user || user.disabled || !user.passwordHash) {
      decoyHash ??= await hashPassword("decoy-password");
      await verifyPassword(password, decoyHash);
      return rejected();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return Response.json(
        { success: false, error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
        { status: 429 },
      );
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      const failures = (user.failedLogins ?? 0) + 1;
      await users.updateOne(
        { _id: user._id },
        failures >= MAX_FAILURES
          ? { $set: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000) } }
          : { $set: { failedLogins: failures } },
      );
      return rejected();
    }

    await signIn(db, user);
    return Response.json({ success: true, user: publicUser(user), home: homePage(user) });
  } catch (error) {
    console.error("Sign-in failed", error);
    return Response.json({ success: false, error: "Couldn't sign you in. Try again." }, { status: 500 });
  }
}
