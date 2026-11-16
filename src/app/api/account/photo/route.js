import { v2 as cloudinary } from "cloudinary";
import { currentSession, publicUser, unauthorized } from "@/lib/server/auth";
import { AVATAR_FOLDER, cloudinaryConfig } from "@/lib/server/cloudinary";
import { getDb } from "@/lib/server/mongodb";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// The browser shrinks the photo to 512px before sending, so real uploads are far below this.
const MAX_BYTES = 3 * 1024 * 1024;

function failed(error, status = 400) {
  return Response.json({ success: false, error }, { status });
}

// POST /api/account/photo: multipart form with a "photo" file. Replaces the signed-in user's picture.
export async function POST(request) {
  try {
    const session = await currentSession();
    if (!session) return unauthorized();

    const form = await request.formData().catch(() => null);
    const file = form?.get("photo");
    if (!file || typeof file === "string") return failed("Choose an image file.");
    if (!TYPES.has(file.type)) return failed("Use a JPEG, PNG or WebP image.");
    if (file.size > MAX_BYTES) return failed("That image is too large.");

    cloudinary.config(cloudinaryConfig());
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    // One picture per user, overwritten in place; the versioned URL changes so browsers refetch it.
    const result = await cloudinary.uploader.upload(`data:${file.type};base64,${base64}`, {
      public_id: `${AVATAR_FOLDER}/${session.user._id}`,
      overwrite: true,
      invalidate: true,
      resource_type: "image",
      transformation: [{ width: 512, height: 512, crop: "limit" }],
    });

    const db = await getDb();
    const user = await db.collection("users").findOneAndUpdate(
      { _id: session.user._id },
      { $set: { photo: { url: result.secure_url, publicId: result.public_id }, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    return Response.json({ success: true, user: publicUser(user) });
  } catch (error) {
    console.error("Uploading profile photo failed", error);
    return failed("Couldn't upload your photo", 500);
  }
}

// DELETE /api/account/photo: removes the signed-in user's picture.
export async function DELETE() {
  try {
    const session = await currentSession();
    if (!session) return unauthorized();

    const publicId = session.user.photo?.publicId;
    if (publicId) {
      cloudinary.config(cloudinaryConfig());
      await cloudinary.uploader.destroy(publicId, { invalidate: true }).catch((error) => {
        // The account no longer points at it, so a leftover file is harmless.
        console.error("Deleting old profile photo failed", error);
      });
    }

    const db = await getDb();
    const user = await db
      .collection("users")
      .findOneAndUpdate(
        { _id: session.user._id },
        { $unset: { photo: "" }, $set: { updatedAt: new Date() } },
        { returnDocument: "after" },
      );
    return Response.json({ success: true, user: publicUser(user) });
  } catch (error) {
    console.error("Removing profile photo failed", error);
    return failed("Couldn't remove your photo", 500);
  }
}
