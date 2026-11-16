import { requireAccess } from "@/lib/server/auth";
import { CHAT_PHOTO_FOLDER, cloudinaryConfig, PACKAGE_PHOTO_FOLDER, signUpload } from "@/lib/server/cloudinary";

// What each kind of upload needs, and where it goes.
const PURPOSES = {
  package: { permission: "packages.create", folder: PACKAGE_PHOTO_FOLDER },
  chat: { permission: "chat.use", folder: CHAT_PHOTO_FOLDER },
};

// POST /api/uploads/sign: { purpose?: "package" | "chat" } → signature for uploading photos
// directly to Cloudinary, into that purpose's folder.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const purpose = PURPOSES[body?.purpose] ?? PURPOSES.package;
  const access = await requireAccess(purpose.permission);
  if (access.denied) return access.denied;
  try {
    const { cloud_name: cloudName, api_key: apiKey } = cloudinaryConfig();
    const timestamp = Math.round(Date.now() / 1000);
    const params = { folder: purpose.folder, timestamp };
    return Response.json({
      success: true,
      cloudName,
      apiKey,
      folder: purpose.folder,
      timestamp,
      signature: signUpload(params),
    });
  } catch (error) {
    console.error("Upload signing failed", error);
    return Response.json({ success: false, error: "Photo uploads aren't configured" }, { status: 500 });
  }
}
