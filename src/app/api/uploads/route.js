import { requireAccess } from "@/lib/server/auth";
import { PHOTO_TYPES, r2Configured, uploadPhoto } from "@/lib/server/r2";

// The browser shrinks photos to 1600px JPEGs first, so a real one is far below this.
const MAX_BYTES = 5 * 1024 * 1024;

// What each kind of upload needs: the permission the user must have.
const PURPOSES = {
  package: { permission: "packages.create", kind: "package" },
  chat: { permission: "chat.use", kind: "chat" },
};

function dimension(value) {
  const number = Number.parseInt(value, 10);
  return number > 0 && number < 20000 ? number : null;
}

// POST /api/uploads (multipart: file, purpose = "package" | "chat", width?, height?)
// → { photo: { url, key, width, height } }. Stores one photo in Cloudflare R2; the package or
// chat message is saved afterwards with it.
export async function POST(request) {
  const form = await request.formData().catch(() => null);
  const purpose = PURPOSES[form?.get("purpose")] ?? PURPOSES.package;
  const access = await requireAccess(purpose.permission);
  if (access.denied) return access.denied;
  if (!r2Configured()) {
    return Response.json({ success: false, error: "Photo uploads aren't configured" }, { status: 500 });
  }

  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return Response.json({ success: false, error: "Choose a photo to upload" }, { status: 400 });
  }
  if (!PHOTO_TYPES.includes(file.type)) {
    return Response.json({ success: false, error: "Photos must be JPEG, PNG or WebP" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ success: false, error: "That photo is too large (5 MB max)" }, { status: 413 });
  }

  try {
    const photo = await uploadPhoto(purpose.kind, Buffer.from(await file.arrayBuffer()), file.type, {
      width: dimension(form.get("width")),
      height: dimension(form.get("height")),
    });
    return Response.json({ success: true, photo });
  } catch (error) {
    console.error("Photo upload to R2 failed", error);
    return Response.json({ success: false, error: "Couldn't store the photo. Try again." }, { status: 502 });
  }
}
