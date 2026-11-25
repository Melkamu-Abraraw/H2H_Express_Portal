// Browser-only: shrinks photos, then uploads them through our server to Cloudflare R2.

// Resolves to { blob, width, height }: a JPEG no larger than maxDim on its longest side.
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
        (blob) =>
          blob ? resolve({ blob, width: canvas.width, height: canvas.height }) : reject(new Error("Couldn't process a photo")),
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

// Uploads through our server into the private R2 bucket. `purpose` is "package" or "chat" (the
// server checks the matching permission). Each photo comes back as { url, key, width, height }.
export function uploadPhotos(files, purpose = "package") {
  return Promise.all(
    files.map(async (file) => {
      const { blob, width, height } = await compressImage(file);
      const body = new FormData();
      body.append("purpose", purpose);
      body.append("file", blob, "photo.jpg");
      body.append("width", String(width));
      body.append("height", String(height));
      const response = await fetch("/api/uploads", { method: "POST", body });
      const result = await readJson(response);
      if (!result.success) throw new Error(result.error || "Photo upload failed");
      return result.photo;
    }),
  );
}

export function uploadPackagePhotos(files) {
  return uploadPhotos(files, "package");
}
