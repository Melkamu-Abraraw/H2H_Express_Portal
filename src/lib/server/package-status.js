import { WRITTEN_OFF_STEPS, lastStep, statusFromEvents, trackingSteps } from "@/components/admin/package-tracking";
import { notifyStatus } from "@/lib/server/package-notify";

// What the admin list needs back after a status change.
const FIELDS = {
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
  notes: 1,
  handling: 1,
  date: 1,
  bag: 1,
  history: 1,
  exception: 1,
  "items.description": 1,
  "items.qty": 1,
  "photos.url": 1,
  notifications: 1,
  refund: 1,
};

// Moves packages forward to a tracking step. A package is only marked delivered once it is
// paid in full. Shared by the admin page and the Telegram replies so both follow the same rules.
// A package inside an active bag moves with its bag (see lib/server/bags), never on its own.
export async function moveToStep(db, trackings, step, by) {
  const packages = db.collection("packages");
  const found = await packages.find({ tracking: { $in: trackings } }, { projection: FIELDS }).toArray();
  const now = new Date();
  const moved = [];
  const skipped = [];
  const unpaid = [];
  const inBag = [];

  for (const pkg of found) {
    if (pkg.bag?.code) {
      inBag.push(pkg.tracking);
      continue;
    }
    // Lost and damaged packages are closed for good, like delivered ones.
    if (WRITTEN_OFF_STEPS.includes(lastStep(pkg))) {
      skipped.push(pkg.tracking);
      continue;
    }
    const keys = trackingSteps(pkg.route).map((item) => item.key);
    const from = keys.indexOf(lastStep(pkg)) + 1;
    const to = keys.indexOf(step);
    if (to === -1 || to < from) {
      skipped.push(pkg.tracking);
      continue;
    }
    if (step === "delivered" && pkg.amountPaid < pkg.charge) {
      unpaid.push(pkg.tracking);
      continue;
    }
    // Steps that were skipped are filled in at the same moment, as on the admin page.
    const added = keys.slice(from, to + 1).map((key) => ({ step: key, date: now, ...(by && { by }) }));
    const events = [...pkg.events, ...added];
    const status = statusFromEvents(events);
    const { modifiedCount } = await packages.updateOne(
      // Re-checked here so a bag claiming it in the meantime wins.
      { tracking: pkg.tracking, bag: { $exists: false } },
      { $push: { events: { $each: added } }, $set: { status, date: now } },
    );
    if (!modifiedCount) {
      inBag.push(pkg.tracking);
      continue;
    }
    moved.push({ ...pkg, events, status, date: now });
  }

  const missing = trackings.filter((tracking) => !found.some((pkg) => pkg.tracking === tracking));
  // Customers are emailed for the step reached (In transit, Ready for pickup or Delivered).
  notifyStatus(db, moved.map((pkg) => pkg.tracking), step);
  return { moved, skipped, unpaid, missing, inBag };
}
