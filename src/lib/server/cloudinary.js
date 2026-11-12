import { v2 as cloudinary } from "cloudinary";

export const PACKAGE_PHOTO_FOLDER = "h2h-express/packages";

export function cloudinaryConfig() {
  const config = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  };
  if (!config.cloud_name || !config.api_key || !config.api_secret) {
    throw new Error("Cloudinary environment variables are not set");
  }
  return config;
}

// Signs a browser upload so the file goes straight to Cloudinary without exposing the secret.
export function signUpload(params) {
  const { api_secret: secret } = cloudinaryConfig();
  return cloudinary.utils.api_sign_request(params, secret);
}

// Only accept photos that were uploaded to our own account and folder.
export function isOwnPhoto(photo) {
  const { cloud_name: cloud } = cloudinaryConfig();
  return (
    typeof photo?.url === "string" &&
    photo.url.startsWith(`https://res.cloudinary.com/${cloud}/image/upload/`) &&
    typeof photo.publicId === "string" &&
    photo.publicId.startsWith(`${PACKAGE_PHOTO_FOLDER}/`)
  );
}
