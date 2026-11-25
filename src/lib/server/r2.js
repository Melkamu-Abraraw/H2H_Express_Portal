import { createHash, createHmac, randomUUID } from "node:crypto";

// Every photo this app keeps (package photos, chat photos, profile pictures) lives in a private
// Cloudflare R2 bucket, under this folder. The bucket is never public: staff see photos through
// /api/photos/<key>, which sends them on to a short-lived signed link, and Telegram gets its own
// signed link. Requests are signed with AWS Signature V4, which R2 speaks, so no SDK is needed.
export const R2_FOLDER = "H2H-Express-Delivery";

// What each kind of photo is stored under.
const KIND_FOLDERS = { package: "packages", chat: "chat", avatar: "avatars" };

// The only keys this app writes: <folder>/<kind>/<year>/<month>/<uuid>.<ext>.
const PHOTO_KEY = /^H2H-Express-Delivery\/(packages|chat|avatars)\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const PHOTO_TYPES = Object.keys(EXTENSIONS);

export function r2Configured() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
}

function config() {
  if (!r2Configured()) throw new Error("Cloudflare R2 environment variables are not set");
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  return {
    host: `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    accessKeyId: R2_ACCESS_KEY_ID,
    secret: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
  };
}

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
// RFC 3986 encoding, as Signature V4 expects.
const encode = (value) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const objectPath = (bucket, key) => `/${bucket}/${key.split("/").map(encode).join("/")}`;
const canonicalQuery = (query) =>
  Object.keys(query)
    .sort()
    .map((name) => `${encode(name)}=${encode(query[name])}`)
    .join("&");

function signature(secret, date, stringToSign) {
  const key = ["auto", "s3", "aws4_request"].reduce((k, part) => hmac(k, part), hmac(`AWS4${secret}`, date));
  return createHmac("sha256", key).update(stringToSign).digest("hex");
}

function timestamps() {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, date: amzDate.slice(0, 8) };
}

async function request(method, key, { body, contentType } = {}) {
  const { host, accessKeyId, secret, bucket } = config();
  const { amzDate, date } = timestamps();
  const path = objectPath(bucket, key);
  const payloadHash = sha256(body ?? "");
  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(contentType && { "content-type": contentType }),
  };
  const names = Object.keys(headers).sort();
  const canonical = [method, path, "", names.map((name) => `${name}:${headers[name]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${date}/auto/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const { host: _host, ...sent } = headers;
  const response = await fetch(`https://${host}${path}`, {
    method,
    body,
    headers: {
      ...sent,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature(secret, date, toSign)}`,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`R2 ${method} failed (${response.status}): ${text.match(/<Code>([^<]+)/)?.[1] ?? text.slice(0, 120)}`);
  }
  return response;
}

// A link anyone holding it can open until it expires; nothing about the bucket becomes public.
export function signedUrl(key, expiresIn = 3600) {
  const { host, accessKeyId, secret, bucket } = config();
  const { amzDate, date } = timestamps();
  const path = objectPath(bucket, key);
  const scope = `${date}/auto/s3/aws4_request`;
  const query = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": "host",
  };
  const canonical = ["GET", path, canonicalQuery(query), `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  return `https://${host}${path}?${canonicalQuery(query)}&X-Amz-Signature=${signature(secret, date, toSign)}`;
}

// Where the app shows a stored photo: through its own route, so only signed-in staff see it.
export function photoUrl(key) {
  return `/api/photos/${key}`;
}

// A key this app could have written; with `kind`, only for that kind of photo.
export function isPhotoKey(key, kind) {
  const match = typeof key === "string" && key.match(PHOTO_KEY);
  return Boolean(match) && (!kind || match[1] === KIND_FOLDERS[kind]);
}

// A photo stored by this app, in the shape `uploadPhoto` returns.
export function isStoredPhoto(photo, kind) {
  return isPhotoKey(photo?.key, kind) && photo.url === photoUrl(photo.key);
}

// Saves one photo of the given kind ("package", "chat" or "avatar") and returns how records keep it.
export async function uploadPhoto(kind, body, contentType, { width = null, height = null } = {}) {
  const folder = KIND_FOLDERS[kind];
  const extension = EXTENSIONS[contentType];
  if (!folder) throw new Error(`Unknown photo kind: ${kind}`);
  if (!extension) throw new Error(`Unsupported photo type: ${contentType}`);
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const key = `${R2_FOLDER}/${folder}/${now.getUTCFullYear()}/${month}/${randomUUID()}.${extension}`;
  await request("PUT", key, { body, contentType });
  return { url: photoUrl(key), key, width, height };
}

export async function deleteObject(key) {
  await request("DELETE", key);
}
