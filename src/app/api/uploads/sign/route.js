import { cloudinaryConfig, PACKAGE_PHOTO_FOLDER, signUpload } from "@/lib/server/cloudinary";

// POST /api/uploads/sign: signature for uploading package photos directly to Cloudinary.
export async function POST() {
  try {
    const { cloud_name: cloudName, api_key: apiKey } = cloudinaryConfig();
    const timestamp = Math.round(Date.now() / 1000);
    const params = { folder: PACKAGE_PHOTO_FOLDER, timestamp };
    return Response.json({
      success: true,
      cloudName,
      apiKey,
      folder: PACKAGE_PHOTO_FOLDER,
      timestamp,
      signature: signUpload(params),
    });
  } catch (error) {
    console.error("Upload signing failed", error);
    return Response.json({ success: false, error: "Photo uploads aren't configured" }, { status: 500 });
  }
}
