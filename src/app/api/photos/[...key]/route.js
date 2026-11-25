import { requireAccess } from "@/lib/server/auth";
import { isPhotoKey, r2Configured, signedUrl } from "@/lib/server/r2";

// How long the signed link works, and how long the browser may reuse this redirect (a bit less).
const LINK_SECONDS = 3600;
const CACHE_SECONDS = 3000;

// GET /api/photos/<key>: a package photo, chat photo or profile picture from the private R2
// bucket, for signed-in staff only.
// Sends the browser to a short-lived signed link, so the photo itself never passes through here.
export async function GET(request, { params }) {
  const access = await requireAccess();
  if (access.denied) return access.denied;
  const { key: parts } = await params;
  const key = parts.map((part) => decodeURIComponent(part)).join("/");
  if (!isPhotoKey(key) || !r2Configured()) return new Response("Not found", { status: 404 });

  return new Response(null, {
    status: 302,
    headers: { Location: signedUrl(key, LINK_SECONDS), "Cache-Control": `private, max-age=${CACHE_SECONDS}` },
  });
}
