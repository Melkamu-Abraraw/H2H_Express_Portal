import { statusFromEvents, trackingSteps } from "@/components/admin/package-tracking";

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
  date: 1,
};

// Moves packages forward to a tracking step. A package is only marked delivered once it is
// paid in full. Shared by the admin page and the Telegram replies so both follow the same rules.
export async function moveToStep(db, trackings, step, by) {
  const packages = db.collection("packages");
  const found = await packages.find({ tracking: { $in: trackings } }, { projection: FIELDS }).toArray();
  const now = new Date();
  const moved = [];
  const skipped = [];
  const unpaid = [];

  for (const pkg of found) {
    const keys = trackingSteps(pkg.route).map((item) => item.key);
    const from = keys.indexOf(pkg.events.at(-1)?.step) + 1;
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
    await packages.updateOne(
      { tracking: pkg.tracking },
      { $push: { events: { $each: added } }, $set: { status, date: now } },
    );
    moved.push({ ...pkg, events, status, date: now });
  }

  const missing = trackings.filter((tracking) => !found.some((pkg) => pkg.tracking === tracking));
  return { moved, skipped, unpaid, missing };
}
