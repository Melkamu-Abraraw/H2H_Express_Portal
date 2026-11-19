import { headers } from "next/headers";
import { after } from "next/server";
import { pickupBranchFor } from "@/components/admin/shipping-routes";
import { emailConfigured, publicSiteUrl, sendStatusEmail, STATUS_EMAIL_STEPS } from "@/lib/server/email";
import { getConfig } from "@/lib/server/config";

// Emails customers when their package moves: In transit (departed), Ready for pickup (pickup)
// and Delivered (delivered). Called after the change is saved, from the bags and from
// moveToStep, so every way a package moves (bag dispatch/receipt, hand-over, Telegram) is covered.
//
// Each step is emailed once per package: `notifications.<step>` is claimed with a conditional
// update before sending, so retries and double clicks never send twice. The result is kept on
// the package: { status: "sent" | "failed" | "no-address", to, at }.

const AT_ONCE = 3;

// The portal's address from the request that caused the change (Telegram calls our public
// address too). PUBLIC_SITE_URL wins when it's set.
async function requestOrigin() {
  if (process.env.PUBLIC_SITE_URL) return publicSiteUrl();
  try {
    const list = await headers();
    const host = list.get("x-forwarded-host") ?? list.get("host");
    if (!host) return "";
    const proto = list.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    return "";
  }
}

// The sender and the receiver, once each, skipping missing addresses.
function recipientsOf(pkg) {
  const seen = new Set();
  const people = [
    { email: pkg.senderContact?.email, name: pkg.senderContact?.name ?? pkg.sender },
    { email: pkg.receiverContact?.email, name: pkg.receiverContact?.name ?? pkg.receiver },
  ];
  return people.filter((person) => {
    const key = String(person.email ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Where a package waits for pickup: the branch that received its bag, or the fixed pickup
// branch for its destination country.
async function pickupBranch(db, pkg) {
  const event = [...(pkg.events ?? [])].reverse().find((item) => item.step === "pickup");
  if (event?.bag) {
    const bag = await db.collection("bags").findOne({ code: event.bag }, { projection: { destination: 1 } });
    if (bag?.destination?.name) return bag.destination;
  }
  return pickupBranchFor(pkg);
}

async function notifyOne(db, tracking, step, origin) {
  const packages = db.collection("packages");
  const field = `notifications.${step}`;
  const pkg = await packages.findOneAndUpdate(
    { tracking, [field]: { $exists: false } },
    { $set: { [field]: { status: "sending", at: new Date() } } },
    { returnDocument: "after", includeResultMetadata: false, projection: { photos: 0 } },
  );
  if (!pkg) return; // Already emailed for this step.

  const recipients = recipientsOf(pkg);
  if (!recipients.length) {
    await packages.updateOne({ tracking }, { $set: { [field]: { status: "no-address", at: new Date() } } });
    return;
  }

  const event = [...pkg.events].reverse().find((item) => item.step === step);
  const options = {
    trackUrl: `${origin}/track/${encodeURIComponent(tracking)}`,
    at: event?.date ? new Date(event.date) : new Date(),
    pickupBranch: step === "pickup" ? await pickupBranch(db, pkg) : null,
  };
  const sent = [];
  const failed = [];
  for (const recipient of recipients) {
    try {
      await sendStatusEmail(pkg, step, { ...options, recipient });
      sent.push(recipient.email);
    } catch (error) {
      console.error(`Status email (${step}) for ${tracking} failed`, error);
      failed.push(recipient.email);
    }
  }
  await packages.updateOne(
    { tracking },
    { $set: { [field]: { status: failed.length ? "failed" : "sent", to: sent, ...(failed.length && { failed }), at: new Date() } } },
  );
}

async function notifyAll(db, trackings, step) {
  const { settings } = await getConfig(db);
  if (settings.customerEmails?.[step] === false) return;
  const origin = await requestOrigin();
  const queue = [...new Set(trackings)];
  // A few at a time, so a full bag doesn't flood the mail server.
  const worker = async () => {
    while (queue.length) {
      const tracking = queue.shift();
      await notifyOne(db, tracking, step, origin).catch((error) => console.error(`Status email for ${tracking} failed`, error));
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, worker));
}

// Schedules the emails to go out after the response, so moving a bag stays fast and an email
// problem never undoes or delays the change itself.
export function notifyStatus(db, trackings, step) {
  if (!trackings?.length || !STATUS_EMAIL_STEPS.includes(step) || !emailConfigured()) return;
  const run = () => notifyAll(db, trackings, step).catch((error) => console.error("Status emails failed", error));
  try {
    after(run);
  } catch {
    // Outside a request (e.g. a script): send right away.
    run();
  }
}
