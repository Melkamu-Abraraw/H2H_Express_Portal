// Browser-only: shrinks photos and uploads them straight to Cloudinary with a server signature.

function compressImage(file, maxDim = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process a photo"))),
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read a photo"));
    };
    img.src = url;
  });
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error(`Server returned HTTP ${response.status}`);
  }
}

export async function uploadPackagePhotos(files) {
  if (!files.length) return [];
  const sign = await readJson(await fetch("/api/uploads/sign", { method: "POST" }));
  if (!sign.success) throw new Error(sign.error || "Couldn't start the photo upload");

  return Promise.all(
    files.map(async (file) => {
      const body = new FormData();
      body.append("file", await compressImage(file));
      body.append("api_key", sign.apiKey);
      body.append("timestamp", sign.timestamp);
      body.append("signature", sign.signature);
      body.append("folder", sign.folder);
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`,
        { method: "POST", body },
      );
      const result = await readJson(response);
      if (!response.ok) throw new Error(result.error?.message || "Photo upload failed");
      return {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
      };
    }),
  );
}
