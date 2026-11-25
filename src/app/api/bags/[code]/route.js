import { can } from "@/lib/permissions";
import { requireAccess } from "@/lib/server/auth";
import {
  bagDetails,
  bagErrorResponse,
  cancelBag,
  closeBag,
  dispatchBag,
  receiveBag,
  reopenBag,
} from "@/lib/server/bags";
import { getDb } from "@/lib/server/mongodb";

// GET /api/bags/:code: the bag, its packages (with their current tracking) and its exceptions.
export async function GET(request, { params }) {
  const access = await requireAccess("bags.view");
  if (access.denied) return access.denied;
  const { code } = await params;
  try {
    const result = await bagDetails(await getDb(), access.user, decodeURIComponent(code).toUpperCase());
    return Response.json({ success: true, ...result });
  } catch (error) {
    return bagErrorResponse(error, "Couldn't load the box");
  }
}

// Each action and the permission it needs. Branch rules are checked in lib/server/bags.
const ACTIONS = {
  close: { permission: "bags.create", run: (db, user, code) => closeBag(db, user, code) },
  cancel: { permission: "bags.create", run: (db, user, code, body) => cancelBag(db, user, code, body.reason) },
  reopen: { permission: "bags.resolve", run: (db, user, code, body) => reopenBag(db, user, code, body.reason) },
  dispatch: { permission: "bags.dispatch", run: (db, user, code, body) => dispatchBag(db, user, code, body) },
  receive: { permission: "bags.receive", run: (db, user, code, body) => receiveBag(db, user, code, body) },
};

// POST /api/bags/:code: moves the bag along. Body: { action, ...details }
//   close                                   OPEN → READY_FOR_DISPATCH
//   reopen   { reason }                     READY_FOR_DISPATCH → OPEN (managers)
//   cancel   { reason }                     OPEN | READY_FOR_DISPATCH → CANCELLED
//   dispatch { transportRef, carrier, notes } READY_FOR_DISPATCH → IN_TRANSIT (packages go In transit)
//   receive  { verifications, notes }       IN_TRANSIT → RECEIVED | EXCEPTION
export async function POST(request, { params }) {
  const access = await requireAccess("bags.view");
  if (access.denied) return access.denied;
  const body = await request.json().catch(() => null);
  const action = ACTIONS[body?.action];
  if (!action) return Response.json({ success: false, error: "Unknown action" }, { status: 400 });
  if (!can(access.user, action.permission)) {
    return Response.json({ success: false, error: "Your role doesn't allow this" }, { status: 403 });
  }
  const { code } = await params;
  try {
    const result = await action.run(await getDb(), access.user, decodeURIComponent(code).toUpperCase(), body);
    return Response.json({ success: true, ...result });
  } catch (error) {
    return bagErrorResponse(error, "Couldn't update the box");
  }
}
