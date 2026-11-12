import { CURRENT_USER } from "@/components/admin/current-user";
import { getDb, nextSequence } from "@/lib/server/mongodb";

const FIRST_RECEIPT = 1000;
const METHODS = ["Cash", "Transfer"];

const PACKAGE_FIELDS = {
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
  cashier: 1,
  paymentMethod: 1,
  status: 1,
  events: 1,
  payment: 1,
  charge: 1,
  amountPaid: 1,
  weight: 1,
  date: 1,
};

function receiptOut({ _id, receiptNo, ...payment }) {
  return { id: receiptNo, ...payment };
}

// GET /api/payments: every package with its balance, and every payment received.
export async function GET() {
  try {
    const db = await getDb();
    const [packages, payments] = await Promise.all([
      db.collection("packages").find({}, { projection: PACKAGE_FIELDS }).sort({ createdAt: -1 }).toArray(),
      db.collection("payments").find({}).sort({ date: -1 }).toArray(),
    ]);
    // Older payments have no stage: the one sharing the package's receipt number was taken at
    // drop-off, anything after that at pickup.
    const registrationReceipt = new Map(packages.map((pkg) => [pkg.tracking, pkg.receiptNo]));
    const withStage = payments.map((payment) => ({
      ...payment,
      stage:
        payment.stage ??
        (payment.receiptNo === registrationReceipt.get(payment.tracking) ? "drop-off" : "pickup"),
    }));
    return Response.json({ success: true, packages, payments: withStage.map(receiptOut) });
  } catch (error) {
    console.error("Loading payments failed", error);
    return Response.json({ success: false, error: "Couldn't load payments" }, { status: 500 });
  }
}

// POST /api/payments: records money taken against a package's balance.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Request body isn't valid JSON" }, { status: 400 });
  }
  const tracking = typeof body.tracking === "string" ? body.tracking.trim() : "";
  const amount = Math.round(Number(body.amount) * 100) / 100;
  const method = METHODS.find((option) => option === body.method);
  // The branch taking the money, e.g. the pickup branch when the receiver pays on collection.
  const takenAt =
    typeof body.branch?.code === "string" && typeof body.branch?.name === "string"
      ? { code: body.branch.code.trim().slice(0, 20), name: body.branch.name.trim().slice(0, 200) }
      : null;
  if (!tracking || !(amount > 0) || !method) {
    return Response.json(
      { success: false, error: "Tracking number, amount and method are required" },
      { status: 400 },
    );
  }

  try {
    const db = await getDb();
    const packages = db.collection("packages");
    // Only applies if it doesn't take the package past what was charged, so two desks
    // collecting at the same moment can't overpay it.
    const updated = await packages.findOneAndUpdate(
      { tracking, $expr: { $lte: [{ $add: ["$amountPaid", amount] }, { $add: ["$charge", 0.001] }] } },
      [
        { $set: { amountPaid: { $round: [{ $add: ["$amountPaid", amount] }, 2] } } },
        { $set: { payment: { $cond: [{ $gte: ["$amountPaid", "$charge"] }, "Paid", "Pending"] } } },
      ],
      { returnDocument: "after", projection: PACKAGE_FIELDS },
    );
    if (!updated) {
      const exists = await packages.countDocuments({ tracking }, { limit: 1 });
      return Response.json(
        {
          success: false,
          error: exists ? "That's more than the balance due" : "Package not found",
        },
        { status: exists ? 409 : 404 },
      );
    }

    const receiptNo = `RCP-${String(FIRST_RECEIPT + (await nextSequence(db, "receipt"))).padStart(5, "0")}`;
    const payment = {
      receiptNo,
      tracking,
      payer: updated.sender,
      route: updated.route,
      currency: updated.currency,
      charge: updated.charge,
      amount,
      method,
      stage: "pickup",
      branch:
        takenAt?.code && takenAt.name
          ? takenAt
          : updated.branch
            ? { code: updated.branch.code, name: updated.branch.name }
            : null,
      receivedBy: CURRENT_USER.name,
      date: new Date(),
    };
    await db.collection("payments").insertOne(payment);

    return Response.json({ success: true, package: updated, payment: receiptOut(payment) }, { status: 201 });
  } catch (error) {
    console.error("Recording payment failed", error);
    return Response.json({ success: false, error: "Couldn't record the payment" }, { status: 500 });
  }
}
