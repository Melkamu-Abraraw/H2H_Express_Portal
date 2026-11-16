import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { can, roleLabel } from "@/lib/permissions";
import { getDb } from "@/lib/server/mongodb";

// Sign-in sessions. The browser holds a random token in an httpOnly cookie; the database keeps
// only its SHA-256, so a leaked sessions collection can't be replayed as cookies.
export const SESSION_COOKIE = "h2h_session";
const SESSION_DAYS = 14;

export function digest(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function randomToken() {
  return randomBytes(32).toString("base64url");
}

export function cookieOptions(maxAge = SESSION_DAYS * 24 * 60 * 60) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

// What the browser is allowed to see about a user: never the password hash or invite token.
export function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    title: roleLabel(user.role),
    branch: user.branch ?? null,
    photo: user.photo?.url ?? "",
  };
}

export async function createSession(db, userId) {
  const token = randomToken();
  const now = new Date();
  await db.collection("sessions").insertOne({
    _id: digest(token),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000),
  });
  return token;
}

// Starts a session and sets its cookie, for route handlers.
export async function signIn(db, user) {
  const token = await createSession(db, user._id);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions());
  await db
    .collection("users")
    .updateOne({ _id: user._id }, { $set: { failedLogins: 0, lastLoginAt: new Date() }, $unset: { lockedUntil: "" } });
}

// The user a session token belongs to, or null when it's missing, unknown or expired, or the
// user has been deactivated. The TTL index removes expired sessions eventually; the date check
// covers the gap.
export async function userFromToken(token) {
  if (!token || typeof token !== "string") return null;
  const db = await getDb();
  const session = await db
    .collection("sessions")
    .findOne({ _id: digest(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await db.collection("users").findOne({ _id: session.userId, disabled: { $ne: true } });
  return user ? { user, sessionId: session._id } : null;
}

// For route handlers: the signed-in user, or null.
export async function currentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userFromToken(token);
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  store.delete(SESSION_COOKIE);
  if (token) {
    const db = await getDb();
    await db.collection("sessions").deleteOne({ _id: digest(token) });
  }
}

// Signs the user out everywhere except the session they're using now.
export async function endOtherSessions(db, userId, keepSessionId) {
  await db.collection("sessions").deleteMany({ userId, _id: { $ne: keepSessionId } });
}

export function unauthorized() {
  return Response.json({ success: false, error: "Sign in to continue" }, { status: 401 });
}

export function forbidden() {
  return Response.json({ success: false, error: "Your role doesn't allow this" }, { status: 403 });
}

// For route handlers: the signed-in user if they hold `permission`, otherwise a ready 401/403.
//   const access = await requireAccess("payments.view");
//   if (access.denied) return access.denied;
export async function requireAccess(permission) {
  const session = await currentSession();
  if (!session) return { denied: unauthorized() };
  if (permission && !can(session.user, permission)) return { denied: forbidden() };
  return { ...session, scope: packageScope(session.user) };
}

// Staff tied to one branch see packages registered there, plus packages heading to that
// branch's country (which they receive and hand over). Staff on all branches see everything.
export function packageScope(user) {
  const branch = user.branch;
  if (!branch?.code) return {};
  return { $or: [{ "branch.code": branch.code }, ...(branch.country ? [{ to: branch.country }] : [])] };
}

// Public requests are made out to one drop-off branch.
export function requestScope(user) {
  return user.branch?.code ? { "branch.code": user.branch.code } : {};
}
