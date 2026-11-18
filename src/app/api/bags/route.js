import { requireAccess } from "@/lib/server/auth";
import { bagErrorResponse, createBag, listBags } from "@/lib/server/bags";
import { getDb } from "@/lib/server/mongodb";

// GET /api/bags: bags the user's branch can see, filtered, sorted and paged, with status counts
// and the list of branches (for filters and the create form).
//   ?q=&status=&origin=&destination=&createdFrom=&createdTo=&dispatchedFrom=&dispatchedTo=
//    &receivedFrom=&receivedTo=&sort=created&dir=desc&page=1&pageSize=20
export async function GET(request) {
  const access = await requireAccess("bags.view");
  if (access.denied) return access.denied;
  try {
    const db = await getDb();
    const result = await listBags(db, access.user, new URL(request.url).searchParams);
    return Response.json({ success: true, ...result });
  } catch (error) {
    return bagErrorResponse(error, "Couldn't load bags");
  }
}

// POST /api/bags: opens a new, empty bag. Body: { destination, origin?, notes? }
// Staff tied to a branch always open bags at their own branch.
export async function POST(request) {
  const access = await requireAccess("bags.create");
  if (access.denied) return access.denied;
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ success: false, error: "Request body isn't valid JSON" }, { status: 400 });
  try {
    const bag = await createBag(await getDb(), access.user, body);
    return Response.json({ success: true, bag }, { status: 201 });
  } catch (error) {
    return bagErrorResponse(error, "Couldn't create the bag");
  }
}
