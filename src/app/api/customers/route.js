import { requireAccess } from "@/lib/server/auth";
import { listCustomers } from "@/lib/server/customers";

// GET /api/customers: everyone who has sent or received a package the user's branch can see.
export async function GET() {
  const access = await requireAccess("customers.view");
  if (access.denied) return access.denied;
  try {
    return Response.json({ success: true, customers: await listCustomers(access.scope) });
  } catch (error) {
    console.error("Loading customers failed", error);
    return Response.json({ success: false, error: "Couldn't load customers" }, { status: 500 });
  }
}
