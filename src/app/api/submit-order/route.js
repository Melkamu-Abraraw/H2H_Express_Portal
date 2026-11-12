import { getDb } from "@/lib/server/mongodb";
import { createRequest, Rejected } from "@/lib/server/requests";

// POST /api/submit-order: the public /ship form. Saves a request for staff to review;
// it does not create a package.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ success: false, error: "Request body isn't valid JSON" }, { status: 400 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

  try {
    const result = await createRequest(await getDb(), body, ip);
    if (result.fake) {
      return Response.json({ success: true, trackingId: "REQ-000000", status: "Pending review" });
    }
    return Response.json(
      { success: true, trackingId: result.code, status: "Pending review", office: result.office },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Rejected) {
      return Response.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("Saving request failed", error);
    return Response.json({ success: false, error: "Couldn't save your request. Please try again." }, { status: 500 });
  }
}
