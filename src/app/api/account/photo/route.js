import { currentSession, publicUser, unauthorized } from "@/lib/server/auth";
import { getDb } from "@/lib/server/mongodb";
import { deleteObject, isPhotoKey, PHOTO_TYPES, uploadPhoto } from "@/lib/server/r2";

// The browser shrinks the photo to 512px before sending, so real uploads are far below this.
const MAX_BYTES = 3 * 1024 * 1024;

function failed(error, status = 400) {
  return Response.json({ success: false, error }, { status });
}

// The previous picture isn't referenced any more once the account points elsewhere, so a
// leftover file is harmless; failing to delete it shouldn't fail the request.
async function deleteOldPhoto(photo) {
  if (!isPhotoKey(photo?.key, "avatar")) return;
  await deleteObject(photo.key).catch((error) => console.error("Deleting old profile photo failed", error));
}

// POST /api/account/photo: multipart form with a "photo" file. Replaces the signed-in user's picture.
export async function POST(request) {
  try {
    const session = await currentSession();
    if (!session) return unauthorized();

    const form = await request.formData().catch(() => null);
    const file = form?.get("photo");
    if (!file || typeof file === "string") return failed("Choose an image file.");
    if (!PHOTO_TYPES.includes(file.type)) return failed("Use a JPEG, PNG or WebP image.");
    if (file.size > MAX_BYTES) return failed("That image is too large.");

    // Each picture gets a new key, so browsers never show a cached old one.
    const { url, key } = await uploadPhoto("avatar", Buffer.from(await file.arrayBuffer()), file.type);

    const db = await getDb();
    const user = await db.collection("users").findOneAndUpdate(
      { _id: session.user._id },
      { $set: { photo: { url, key }, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    await deleteOldPhoto(session.user.photo);
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

    const db = await getDb();
    const user = await db
      .collection("users")
      .findOneAndUpdate(
        { _id: session.user._id },
        { $unset: { photo: "" }, $set: { updatedAt: new Date() } },
        { returnDocument: "after" },
      );
    await deleteOldPhoto(session.user.photo);
    return Response.json({ success: true, user: publicUser(user) });
  } catch (error) {
    console.error("Removing profile photo failed", error);
    return failed("Couldn't remove your photo", 500);
  }
}
