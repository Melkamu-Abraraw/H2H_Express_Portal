import { getBusiness } from "@/lib/server/config";
import { getDb } from "@/lib/server/mongodb";

// GET /api/business: public contact details (name, support phone, email, website), e.g. for the
// WhatsApp button on the tracking page. Nothing here is private.
export async function GET() {
  try {
    return Response.json({ success: true, business: await getBusiness(await getDb()) });
  } catch (error) {
    console.error("Loading business details failed", error);
    return Response.json({ success: false, error: "Couldn't load business details" }, { status: 500 });
  }
}
