import { getDb } from "@/lib/server/mongodb";

// GET /api/requests: public-form requests waiting for review, oldest first.
export async function GET() {
  try {
    const db = await getDb();
    const requests = await db
      .collection("requests")
      .find({ status: "pending" }, { projection: { _id: 0, ipHash: 0, emailKey: 0 } })
      .sort({ createdAt: 1 })
      .toArray();
    return Response.json({ success: true, requests });
  } catch (error) {
    console.error("Loading requests failed", error);
    return Response.json({ success: false, error: "Couldn't load requests" }, { status: 500 });
  }
}

// POST /api/requests: { code, action: "reject" }.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!/^REQ-\d{6}$/.test(body?.code ?? "") || body.action !== "reject") {
    return Response.json({ success: false, error: "A request code and action are required" }, { status: 400 });
  }
  try {
    const db = await getDb();
    const result = await db
      .collection("requests")
      .updateOne({ code: body.code, status: "pending" }, { $set: { status: "rejected", reviewedAt: new Date() } });
    if (!result.matchedCount) {
      return Response.json({ success: false, error: "That request was already handled" }, { status: 409 });
    }
    return Response.json({ success: true });
  } catch (error) {
    console.error("Rejecting request failed", error);
    return Response.json({ success: false, error: "Couldn't reject the request" }, { status: 500 });
  }
}
