import { requireAccess } from "@/lib/server/auth";
import { addPackages, bagErrorResponse, removePackage } from "@/lib/server/bags";
import { getDb } from "@/lib/server/mongodb";

// POST /api/bags/:code/packages: puts packages in an open bag. Body: { trackings: [...] }
// Returns { added, rejected: [{ tracking, reason }] }; ineligible ones are reported, not fatal.
export async function POST(request, { params }) {
  const access = await requireAccess("bags.create");
  if (access.denied) return access.denied;
  const body = await request.json().catch(() => null);
  const { code } = await params;
  try {
    const result = await addPackages(await getDb(), access.user, decodeURIComponent(code).toUpperCase(), body?.trackings);
    return Response.json({ success: true, ...result });
  } catch (error) {
    return bagErrorResponse(error, "Couldn't add the packages");
  }
}

// DELETE /api/bags/:code/packages?tracking=H2H-...: takes a package out of an open bag.
export async function DELETE(request, { params }) {
  const access = await requireAccess("bags.create");
  if (access.denied) return access.denied;
  const { code } = await params;
  const tracking = new URL(request.url).searchParams.get("tracking") ?? "";
  try {
    const result = await removePackage(await getDb(), access.user, decodeURIComponent(code).toUpperCase(), tracking);
    return Response.json({ success: true, ...result });
  } catch (error) {
    return bagErrorResponse(error, "Couldn't remove the package");
  }
}
