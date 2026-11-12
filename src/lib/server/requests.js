import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { DIRECTIONS } from "@/components/admin/shipping-routes";
import { cloudinaryConfig, PACKAGE_PHOTO_FOLDER } from "@/lib/server/cloudinary";
import { nextSequence } from "@/lib/server/mongodb";

// Requests from the public /ship page wait here until staff have inspected the package,
// corrected anything (usually the weight) and registered it. Nothing reaches the business flow
// (tracking number, Telegram, customer email) before that.

export class Rejected extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const GENERIC = "We couldn't accept this submission. Please check your details and try again.";
const MAX_PER_IP_PER_HOUR = 5;
const MIN_FILL_MS = 3000;
const MAX_PHOTO_CHARS = 3_000_000;

function text(value, label, { required = true, max = 300 } = {}) {
  const result = typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
  if (required && !result) throw new Rejected(`${label} is required`);
  return result;
}

// "PtrnZpZpUmbhxLCR": several lower-to-UPPER switches inside one word is how bots mash keys.
function looksRandom(name) {
  return name.split(/[\s'.-]+/).some((word) => (word.match(/\p{Ll}\p{Lu}/gu) ?? []).length >= 2);
}

function personName(value, label) {
  const name = text(value, label, { max: 80 });
  if (name.length < 2 || !/^[\p{L}][\p{L}\s'.-]*$/u.test(name) || looksRandom(name)) {
    throw new Rejected(`${label} doesn't look right`);
  }
  return name;
}

function phone(value, label) {
  const result = text(value, label, { max: 30 });
  if (!/^[+\d][\d\s().-]{5,}$/.test(result)) throw new Rejected(`${label} doesn't look right`);
  return result;
}

// Gmail ignores dots and "+tags", so spammers mint endless "different" addresses from one inbox.
export function canonicalEmail(email) {
  const [local = "", domain = ""] = email.toLowerCase().split("@");
  if (domain !== "gmail.com" && domain !== "googlemail.com") return email.toLowerCase();
  return `${local.split("+")[0].replace(/\./g, "")}@gmail.com`;
}

function email(value, label, { required = false } = {}) {
  const result = text(value, label, { required, max: 200 });
  if (!result) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Rejected(`${label} doesn't look right`);
  const [local, domain] = result.toLowerCase().split("@");
  if (/^(gmail|googlemail)\.com$/.test(domain) && (local.match(/\./g) ?? []).length >= 4) {
    throw new Rejected(`${label} doesn't look right`);
  }
  return result;
}

export function parseRequest(body) {
  const route = DIRECTIONS[body.direction];
  if (!route) throw new Rejected("Choose a direction");
  const branches = route.branches;
  const branchCode = branches[body.branchCode] ? body.branchCode : route.defaultBranch;

  const items = (Array.isArray(body.items) ? body.items.slice(0, 20) : []).map((item, index) => {
    const qty = Number.parseInt(item?.qty, 10);
    const kg = Number.parseFloat(item?.kg);
    if (!(qty >= 1 && qty <= 1000) || !(kg > 0 && kg <= 1000)) {
      throw new Rejected(`Item ${index + 1} needs a quantity and weight`);
    }
    return { description: text(item.desc, `Item ${index + 1} description`, { max: 200 }), qty, kg };
  });
  if (!items.length) throw new Rejected("Add at least one item");

  return {
    route: body.direction,
    from: route.from.name,
    to: route.to.name,
    shipping: body.shippingMethod === "express" ? "express" : "normal",
    submissionMethod: body.submissionMethod === "office" ? "office" : "remote",
    branch: { code: branchCode, name: branches[branchCode].name, address: branches[branchCode].address },
    sender: {
      name: personName(body.senderName, "Sender name"),
      email: email(body.senderEmail, "Sender email", { required: true }),
      phone: phone(body.senderPhone, "Sender phone"),
      address: text(body.senderAddress, "Sender address"),
    },
    receiver: {
      name: personName(body.receiverName, "Receiver name"),
      email: email(body.receiverEmail, "Receiver email"),
      phone: phone(body.receiverPhone, "Receiver phone"),
      address: text(body.receiverAddress, "Receiver address"),
    },
    items,
    notes: text(body.notes, "Notes", { required: false, max: 2000 }),
  };
}

const PASS_MINUTES = 30;

// Google's tick token only lives two minutes, less than it takes to fill in the form. So the
// token is checked once, when the box is ticked, and swapped for our own 30-minute pass.
function sign(expires) {
  return createHmac("sha256", process.env.RECAPTCHA_SECRET_KEY).update(String(expires)).digest("hex");
}

export async function issuePass(token) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return "dev";
  if (typeof token !== "string" || !token) throw new Rejected(GENERIC);
  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json().catch(() => null);
  if (!result?.success) throw new Rejected(GENERIC);
  const expires = Date.now() + PASS_MINUTES * 60 * 1000;
  return `${expires}.${sign(expires)}`;
}

function checkPass(pass) {
  if (!process.env.RECAPTCHA_SECRET_KEY) return; // Not configured (e.g. local development).
  const [expires, signature = ""] = String(pass ?? "").split(".");
  const expected = Buffer.from(sign(expires));
  const given = Buffer.from(signature.length ? `${signature}` : "");
  const valid =
    Number(expires) > Date.now() &&
    given.length === expected.length &&
    timingSafeEqual(given, expected);
  if (!valid) throw new Rejected("Security check expired. Please tick the box again.", 403);
}

async function uploadPhoto(base64) {
  if (typeof base64 !== "string" || !base64 || base64.length > MAX_PHOTO_CHARS) return [];
  try {
    cloudinary.config(cloudinaryConfig());
    const result = await cloudinary.uploader.upload(`data:image/jpeg;base64,${base64}`, {
      folder: PACKAGE_PHOTO_FOLDER,
      resource_type: "image",
    });
    return [{ url: result.secure_url, publicId: result.public_id, width: result.width, height: result.height }];
  } catch (error) {
    // A missing photo shouldn't lose the whole request.
    console.error("Request photo upload failed", error);
    return [];
  }
}

// Returns { fake: true } for obvious bots so they think it worked and don't adapt.
export async function createRequest(db, body, ip) {
  if (typeof body.website === "string" && body.website) return { fake: true };
  const started = Number(body.startedAt);
  if (!Number.isFinite(started) || Date.now() - started < MIN_FILL_MS) return { fake: true };

  checkPass(body.captchaToken);
  const input = parseRequest(body);

  const ipHash = createHash("sha256").update(String(ip)).digest("hex").slice(0, 24);
  const emailKey = canonicalEmail(input.sender.email);
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const requests = db.collection("requests");
  const [fromIp, fromEmail] = await Promise.all([
    requests.countDocuments({ ipHash, createdAt: { $gte: since } }),
    requests.countDocuments({ emailKey, createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
  ]);
  if (fromIp >= MAX_PER_IP_PER_HOUR || fromEmail >= 3) {
    throw new Rejected("Too many requests. Please try again later.", 429);
  }

  const photos = await uploadPhoto(body.photoBase64);
  const seq = await nextSequence(db, "request");
  const code = `REQ-${String(seq).padStart(6, "0")}`;
  await requests.insertOne({
    code,
    status: "pending",
    ...input,
    photos,
    ipHash,
    emailKey,
    createdAt: new Date(),
  });
  return { code, office: input.branch };
}

// What the register form needs to start from a request. Staff fix weights, then register it.
export async function requestPrefill(db, code) {
  if (!/^REQ-\d{6}$/.test(code ?? "")) return null;
  const request = await db
    .collection("requests")
    .findOne({ code, status: "pending" }, { projection: { _id: 0, ipHash: 0, emailKey: 0 } });
  if (!request) return null;
  return { ...request, createdAt: request.createdAt.toISOString() };
}
