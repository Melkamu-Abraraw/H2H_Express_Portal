import { ObjectId } from "mongodb";
import { isRole, roleLabel } from "@/lib/permissions";
import { digest, randomToken } from "@/lib/server/auth";
import { emailConfigured, sendStaffInvite } from "@/lib/server/email";

// Staff are the portal's users. An owner adds someone (name, email, role, branch); they get an
// invitation link, set their own password, and only then can sign in.
export const INVITE_DAYS = 7;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class InvalidStaff extends Error {
  constructor(message, field) {
    super(message);
    this.field = field;
  }
}

export function staffId(id) {
  return typeof id === "string" && ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function text(value, max) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

// Branches are kept on the Routes page in the browser, so the server stores the one chosen
// as given (trimmed and bounded). null means all branches.
function parseBranch(value) {
  if (!value || value === "ALL") return null;
  const code = text(value.code, 20);
  if (!/^[A-Z0-9_-]{1,20}$/i.test(code)) throw new InvalidStaff("Choose a branch.", "branch");
  return { code, name: text(value.name, 200) || code, country: text(value.country, 80) };
}

// Validates the fields an owner can set. `partial` allows leaving fields out (for edits).
export function parseStaff(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body?.name !== undefined) {
    out.name = text(body?.name, 80);
    if (!out.name) throw new InvalidStaff("Enter their full name.", "name");
  }
  if (!partial) {
    out.email = text(body?.email, 200).toLowerCase();
    if (!EMAIL.test(out.email)) throw new InvalidStaff("Enter a valid email address.", "email");
  }
  if (!partial || body?.phone !== undefined) out.phone = text(body?.phone, 40);
  if (!partial || body?.role !== undefined) {
    if (!isRole(body?.role)) throw new InvalidStaff("Choose a role.", "role");
    out.role = body.role;
  }
  if (!partial || body?.branch !== undefined) out.branch = parseBranch(body?.branch);
  return out;
}

export function staffStatus(user, now = new Date()) {
  if (user.disabled) return "deactivated";
  if (user.passwordHash) return "active";
  return user.invite?.expiresAt > now ? "invited" : "expired";
}

// What the Staff page sees about each person.
export function staffOut(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone ?? "",
    role: user.role,
    branch: user.branch ?? null,
    status: staffStatus(user),
    invitedAt: user.invite?.sentAt ?? null,
    inviteExpiresAt: user.invite?.expiresAt ?? null,
    lastActive: user.lastLoginAt ?? null,
    createdAt: user.createdAt ?? null,
  };
}

export function activeOwnerFilter(excludeId) {
  return {
    role: "owner",
    disabled: { $ne: true },
    passwordHash: { $exists: true },
    ...(excludeId && { _id: { $ne: excludeId } }),
  };
}

// Public address for links in emails; falls back to whatever host served this request.
export function siteUrl(request) {
  return (process.env.PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
}

// Makes a fresh invitation link (any earlier one stops working) and emails it.
// Returns { email: "sent" | "failed" | "not-configured", link? }. The link is handed back to the
// owner only when the email didn't go out, so they can pass it on themselves.
export async function issueInvite(db, user, inviter, request) {
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  await db.collection("users").updateOne(
    { _id: user._id },
    { $set: { invite: { tokenHash: digest(token), sentAt: now, expiresAt, sentBy: inviter._id } } },
  );

  const link = `${siteUrl(request)}/activate?token=${encodeURIComponent(token)}`;
  if (!emailConfigured()) return { email: "not-configured", link };
  try {
    await sendStaffInvite({
      to: user.email,
      name: user.name,
      role: roleLabel(user.role),
      branch: user.branch?.name ?? "All branches",
      inviter: inviter.name,
      link,
      expiresAt,
    });
    return { email: "sent" };
  } catch (error) {
    console.error("Invitation email failed", error);
    return { email: "failed", link };
  }
}

// The not-yet-activated user an invitation token belongs to, or null if it's unknown,
// already used, expired, or the person has been deactivated.
export async function userFromInvite(db, token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  return db.collection("users").findOne({
    "invite.tokenHash": digest(token),
    "invite.expiresAt": { $gt: new Date() },
    passwordHash: { $exists: false },
    disabled: { $ne: true },
  });
}
