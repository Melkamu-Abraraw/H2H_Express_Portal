import { listCustomers } from "@/lib/server/customers";

// GET /api/customers: everyone who has sent or received a package.
export async function GET() {
  try {
    return Response.json({ success: true, customers: await listCustomers() });
  } catch (error) {
    console.error("Loading customers failed", error);
    return Response.json({ success: false, error: "Couldn't load customers" }, { status: 500 });
  }
}
