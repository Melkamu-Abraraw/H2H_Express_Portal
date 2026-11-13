import { isOwnPhoto } from "@/lib/server/cloudinary";
import { emailConfigured, sendPackageConfirmation } from "@/lib/server/email";
import { getDb, nextSequence } from "@/lib/server/mongodb";
import { announcePackage } from "@/lib/server/telegram";

const FIRST_RECEIPT = 1000;
const PICKUP = "Pay at pickup";
const PAYMENT_METHODS = { cash: "Cash", transfer: "Transfer", pickup: PICKUP };

class InvalidRequest extends Error {}

function text(value, label, { required = true, max = 300 } = {}) {
  const result = typeof value === "string" ? value.trim().slice(0, max) : "";
  if (required && !result) throw new InvalidRequest(`${label} is required`);
  return result;
}

function amount(value, label) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new InvalidRequest(`${label} is invalid`);
  return Math.round(result * 100) / 100;
}

function contact(value = {}, who) {
  const email = text(value.email, `${who} email`, { required: false, max: 200 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new InvalidRequest(`${who} email doesn't look right`);
  }
  return {
    name: text(value.name, `${who} name`),
    email,
    phone: text(value.phone, `${who} phone`),
    address: text(value.address, `${who} address`),
  };
}

function parsePackage(body) {
  const route = text(body.route, "Route", { max: 12 });
  if (!/^[A-Z0-9]{2,12}$/.test(route)) throw new InvalidRequest("Route is invalid");

  const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  if (!items.length) throw new InvalidRequest("Add at least one item");
  const parsedItems = items.map((item, index) => {
    const qty = Number.parseInt(item?.qty, 10);
    const kg = Number.parseFloat(item?.kg);
    if (!(qty >= 1) || !(kg > 0)) throw new InvalidRequest(`Item ${index + 1} needs a quantity and weight`);
    return { description: text(item.description, `Item ${index + 1} description`), qty, kg };
  });

  const photos = Array.isArray(body.photos) ? body.photos.slice(0, 20) : [];
  if (!photos.every(isOwnPhoto)) throw new InvalidRequest("A photo wasn't uploaded correctly");

  const charge = amount(body.payment?.charge, "Amount to pay");
  // Never record more than was charged.
  const method = PAYMENT_METHODS[body.payment?.method];
  if (!method) throw new InvalidRequest("Payment method is invalid");
  // Paying at pickup means nothing is taken at drop-off.
  const paid =
    method === PICKUP ? 0 : Math.min(charge, amount(body.payment?.paid ?? 0, "Amount paid"));

  return {
    route,
    from: text(body.from, "From country", { max: 80 }),
    to: text(body.to, "To country", { max: 80 }),
    shipping: body.shipping === "express" ? "express" : "normal",
    branch: {
      code: text(body.branch?.code, "Branch", { max: 20 }),
      name: text(body.branch?.name, "Branch name"),
      address: text(body.branch?.address, "Branch address"),
    },
    senderContact: contact(body.sender, "Sender"),
    receiverContact: contact(body.receiver, "Receiver"),
    items: parsedItems,
    weight: Math.round(parsedItems.reduce((sum, item) => sum + item.kg, 0) * 100) / 100,
    notes: text(body.notes, "Notes", { required: false, max: 2000 }),
    photos: photos.map(({ url, publicId, width, height }) => ({
      url,
      publicId,
      width: Number(width) || null,
      height: Number(height) || null,
    })),
    currency: text(body.currency, "Currency", { max: 3 }).toUpperCase(),
    charge,
    amountPaid: paid,
    method,
    cashier: text(body.payment?.cashier, "Cashier", { max: 120 }),
  };
}

// Public address for links in emails; falls back to whatever host served this request.
function siteUrl(request) {
  return (process.env.PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
}

async function emailSender(pkg, trackUrl) {
  if (!pkg.senderContact.email) return { status: "no-address" };
  if (!emailConfigured()) return { status: "not-configured" };
  try {
    await sendPackageConfirmation(pkg, trackUrl);
    return { status: "sent", to: pkg.senderContact.email, at: new Date() };
  } catch (error) {
    console.error("Confirmation email failed", error);
    return { status: "failed", to: pkg.senderContact.email };
  }
}

// List fields for the admin Packages page; contact details and photos stay out of the list.
const LIST_FIELDS = {
  _id: 0,
  tracking: 1,
  receiptNo: 1,
  sender: 1,
  receiver: 1,
  route: 1,
  from: 1,
  to: 1,
  currency: 1,
  branch: 1,
  status: 1,
  events: 1,
  payment: 1,
  paymentMethod: 1,
  charge: 1,
  amountPaid: 1,
  weight: 1,
  shipping: 1,
  cashier: 1,
  date: 1,
};

// GET /api/packages: every registered package, newest first.
export async function GET(request) {
  try {
    const db = await getDb();
    // ?recent=1: the latest registrations only, for the notifications menu.
    if (new URL(request.url).searchParams.has("recent")) {
      const packages = await db
        .collection("packages")
        .find({}, { projection: { _id: 0, tracking: 1, sender: 1, receiver: 1, route: 1, cashier: 1, createdAt: 1 } })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray();
      return Response.json({ success: true, packages });
    }
    const packages = await db
      .collection("packages")
      .find({}, { projection: LIST_FIELDS })
      .sort({ createdAt: -1 })
      .toArray();
    return Response.json({ success: true, packages });
  } catch (error) {
    console.error("Loading packages failed", error);
    return Response.json({ success: false, error: "Couldn't load packages" }, { status: 500 });
  }
}

// POST /api/packages: registers a package at the branch and records its payment.
export async function POST(request) {
  let input;
  let body;
  try {
    body = await request.json();
    input = parsePackage(body);
  } catch (error) {
    const message = error instanceof InvalidRequest ? error.message : "Request body isn't valid JSON";
    return Response.json({ success: false, error: message }, { status: 400 });
  }

  const requestCode = typeof body?.requestCode === "string" ? body.requestCode : "";
  let claimed = false;
  try {
    const db = await getDb();
    // Registering a public request: claim it first so two staff can't register it twice.
    if (requestCode) {
      const claim = await db
        .collection("requests")
        .updateOne({ code: requestCode, status: "pending" }, { $set: { status: "registering" } });
      if (!claim.matchedCount) {
        return Response.json({ success: false, error: "That request was already handled" }, { status: 409 });
      }
      claimed = true;
    }
    const now = new Date();
    const [packageSeq, receiptSeq] = await Promise.all([
      nextSequence(db, "package"),
      nextSequence(db, "receipt"),
    ]);
    const tracking = `H2H-${input.route}-${String(packageSeq).padStart(6, "0")}`;
    const receiptNo = `RCP-${String(FIRST_RECEIPT + receiptSeq).padStart(5, "0")}`;
    const { method, cashier, ...details } = input;

    const pkg = {
      ...details,
      tracking,
      receiptNo,
      // List fields use the names; full contact details are kept alongside.
      sender: input.senderContact.name,
      receiver: input.receiverContact.name,
      // Registered at the branch, so the package is already received there.
      events: [{ step: "received", date: now }],
      status: "In transit",
      payment: input.amountPaid >= input.charge ? "Paid" : "Pending",
      // How the customer chose to pay at drop-off, and who registered the package.
      paymentMethod: method,
      cashier,
      date: now,
      createdAt: now,
    };
    await db.collection("packages").insertOne(pkg);
    if (claimed) {
      await db
        .collection("requests")
        .updateOne({ code: requestCode }, { $set: { status: "approved", tracking, reviewedAt: now } });
    }

    // The receipt is always issued; the payments ledger only lists money actually taken.
    if (input.amountPaid > 0) await db.collection("payments").insertOne({
      receiptNo,
      tracking,
      payer: pkg.sender,
      route: input.route,
      currency: input.currency,
      charge: input.charge,
      amount: input.amountPaid,
      method,
      // Money taken while registering the package, as opposed to later at pickup.
      stage: "drop-off",
      branch: { code: input.branch.code, name: input.branch.name },
      receivedBy: cashier,
      date: now,
    });

    // The package is saved either way; email trouble is reported, not fatal.
    const trackUrl = `${siteUrl(request)}/track/${encodeURIComponent(tracking)}`;
    const [email, telegram] = await Promise.all([emailSender(pkg, trackUrl), announcePackage(pkg)]);
    await db
      .collection("packages")
      .updateOne(
        { tracking },
        { $set: { confirmationEmail: email, ...(telegram.status === "sent" && { telegram }) } },
      );

    return Response.json(
      { success: true, tracking, receiptNo, date: now.toISOString(), trackUrl, email, telegram: telegram.status },
      { status: 201 },
    );
  } catch (error) {
    console.error("Saving package failed", error);
    if (claimed) {
      await (await getDb()).collection("requests").updateOne({ code: requestCode, status: "registering" }, { $set: { status: "pending" } }).catch(() => {});
    }
    return Response.json(
      { success: false, error: "Couldn't save the package. Please try again." },
      { status: 500 },
    );
  }
}
