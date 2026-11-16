import { endSession } from "@/lib/server/auth";

// POST /api/auth/logout: ends this browser's session.
export async function POST() {
  try {
    await endSession();
  } catch (error) {
    // The cookie is already gone at this point; a leftover session row just expires.
    console.error("Ending session failed", error);
  }
  return Response.json({ success: true });
}
