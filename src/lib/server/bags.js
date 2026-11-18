import { ObjectId } from "mongodb";
import { COUNTRIES } from "@/components/admin/countries";
import { DIRECTIONS } from "@/components/admin/shipping-routes";
import { BAG_STATUS, BAG_TRANSITIONS, DELAY_DAYS, RESOLUTIONS, bagWeight } from "@/lib/bags";
import { can } from "@/lib/permissions";
import { getConfig } from "@/lib/server/config";
import { nextSequence } from "@/lib/server/mongodb";
import { syncPackagePosts } from "@/lib/server/telegram";

// Bags carry packages between branches. Rules (also see lib/bags):
// - A package is "in" a bag while its `bag` field is set. Claiming that field is a single
//   conditional update, so two desks can never put the same package in two bags.
// - Every change to a bag and its packages runs in one MongoDB transaction: either the bag and
//   every package move together, or nothing changes.
// - Nothing is ever rewritten: bags keep an `events` list, packages a `history` list, and both
//   are only appended to. Package tracking steps go into the existing `events` list.

export class BagError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const MAX_PER_REQUEST = 200;

function text(value, max) {
  return typeof value === "string" ? value.trim().replace(/[\r\t]+/g, " ").slice(0, max) : "";
}

function actor(user) {
  return { id: String(user._id), name: user.name };
}

// ---------------------------------------------------------------------------------------------
// Branches and access

// Every branch on every route (built-in and added), with the country it sits in.
export async function allBranches(db) {
  const { routes } = await getConfig(db);
  const branches = new Map();
  const add = (list, country) => {
    if (!country) return;
    for (const [code, branch] of Object.entries(list ?? {})) {
      if (!branches.has(code)) {
        branches.set(code, { code, name: branch.name, country: country.name, countryCode: country.code });
      }
    }
  };
  for (const [code, direction] of Object.entries(DIRECTIONS)) {
    add(routes.edits[code]?.branches ?? direction.branches, direction.from);
  }
  for (const route of Object.values(routes.custom)) add(route.branches, COUNTRIES[route.from]);
  return [...branches.values()];
}

function ownBranch(user) {
  return user.branch?.code || null;
}

// Owners and managers see bags across branches; other staff see bags leaving or arriving at theirs.
export function bagScope(user) {
  const code = ownBranch(user);
  if (!code || can(user, "bags.reports")) return {};
  return { $or: [{ "origin.code": code }, { "destination.code": code }] };
}

function atOrigin(user, bag) {
  const code = ownBranch(user);
  return !code || code === bag.origin.code;
}

// The destination branch receives; owners and managers may step in for it.
function atDestination(user, bag) {
  const code = ownBranch(user);
  return !code || code === bag.destination.code || can(user, "bags.resolve");
}

function visible(user, bag) {
  const code = ownBranch(user);
  return !code || can(user, "bags.reports") || code === bag.origin.code || code === bag.destination.code;
}

// ---------------------------------------------------------------------------------------------
// Helpers

async function inTransaction(db, work) {
  const session = db.client.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

function lastStepIs(step) {
  return { $expr: { $eq: [{ $arrayElemAt: ["$events.step", -1] }, step] } };
}

function bagEvent(type, bag, user, extra = {}) {
  return {
    type,
    from: bag.status,
    to: extra.to ?? bag.status,
    origin: bag.origin.code,
    destination: bag.destination.code,
    by: actor(user),
    at: extra.at ?? new Date(),
    ...(extra.notes && { notes: extra.notes }),
  };
}

function historyEntry(type, bag, user, at, extra = {}) {
  return { type, bag: bag.code, by: user.name, at, ...extra };
}

async function loadBag(db, code, session) {
  const bag = await db.collection("bags").findOne({ code }, { session });
  if (!bag) throw new BagError("Bag not found", 404);
  return bag;
}

function requireStatus(bag, action) {
  if (!BAG_TRANSITIONS[action].from.includes(bag.status)) {
    const messages = {
      close: "Only an open bag can be closed.",
      reopen: "Only a bag that is ready for dispatch can be reopened.",
      cancel: "Only a bag that hasn't left yet can be cancelled.",
      dispatch: bag.status === BAG_STATUS.IN_TRANSIT || bag.status === BAG_STATUS.RECEIVED
        ? "This bag has already been dispatched."
        : "Close the bag before dispatching it.",
      receive: bag.status === BAG_STATUS.RECEIVED || bag.status === BAG_STATUS.EXCEPTION
        ? "This bag has already been received."
        : "This bag hasn't been dispatched yet.",
    };
    throw new BagError(messages[action] ?? "That isn't allowed for this bag now.", 409);
  }
}

// Throws unless the bag is still in the status we read inside the transaction.
async function moveBag(db, session, bag, action, to, set, event) {
  const { matchedCount } = await db.collection("bags").updateOne(
    { _id: bag._id, status: bag.status },
    { $set: { status: to, updatedAt: event.at, ...set }, $push: { events: event } },
    { session },
  );
  if (!matchedCount) throw new BagError("Someone else changed this bag. Reload and try again.", 409);
}

// ---------------------------------------------------------------------------------------------
// Create, fill, close, reopen, cancel

export async function createBag(db, user, body) {
  const branches = await allBranches(db);
  const originCode = ownBranch(user) ?? text(body?.origin, 20);
  const origin = branches.find((branch) => branch.code === originCode);
  if (!origin) throw new BagError(ownBranch(user) ? "Your branch isn't on any route yet." : "Choose the origin branch.", 400);
  const destination = branches.find((branch) => branch.code === text(body?.destination, 20));
  if (!destination) throw new BagError("Choose the destination branch.", 400);
  if (destination.code === origin.code) throw new BagError("The destination must be another branch.", 400);
  if (destination.countryCode === origin.countryCode) {
    throw new BagError("Bags travel between countries. Choose a branch in another country.", 400);
  }

  const now = new Date();
  const seq = await nextSequence(db, "bag");
  const bag = {
    code: `H2H-BAG-${String(seq).padStart(5, "0")}`,
    origin: { code: origin.code, name: origin.name, country: origin.country },
    destination: { code: destination.code, name: destination.name, country: destination.country },
    status: BAG_STATUS.OPEN,
    notes: text(body?.notes, 1000),
    items: [],
    totalPackages: 0,
    totalWeight: 0,
    createdBy: actor(user),
    createdAt: now,
    updatedAt: now,
    events: [],
  };
  bag.events.push({ ...bagEvent("created", bag, user, { at: now }), from: null });
  await db.collection("bags").insertOne(bag);
  return bag;
}

// Packages a bag can take: received at its origin branch, heading to its destination country,
// and not already in a bag.
function eligibleFilter(bag) {
  return {
    "branch.code": bag.origin.code,
    to: bag.destination.country,
    bag: { $exists: false },
    ...lastStepIs("received"),
  };
}

export async function eligiblePackages(db, user, code, search) {
  const bag = await loadBag(db, code);
  if (!visible(user, bag)) throw new BagError("Bag not found", 404);
  const term = text(search, 60);
  const filter = eligibleFilter(bag);
  if (term) {
    const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ tracking: pattern }, { sender: pattern }, { receiver: pattern }];
  }
  return db
    .collection("packages")
    .find(filter, { projection: { _id: 0, tracking: 1, sender: 1, receiver: 1, to: 1, weight: 1, status: 1, createdAt: 1 } })
    .sort({ createdAt: 1 })
    .limit(300)
    .toArray();
}

// Why a package can't go into this bag, in words for the desk.
function rejection(bag, pkg) {
  if (!pkg) return "Not found";
  if (bag.items.some((item) => item.tracking === pkg.tracking)) return "Already in this bag";
  if (pkg.bag?.code) return `Already in bag ${pkg.bag.code}`;
  if (pkg.branch?.code !== bag.origin.code) return `Registered at another branch (${pkg.branch?.name ?? "unknown"})`;
  if (pkg.to !== bag.destination.country) return `Going to ${pkg.to}, not ${bag.destination.country}`;
  if (pkg.events?.at(-1)?.step !== "received") return `Already ${String(pkg.status).toLowerCase()}`;
  return "Not eligible";
}

export async function addPackages(db, user, code, trackings) {
  const wanted = [...new Set((Array.isArray(trackings) ? trackings : []).map((value) => text(value, 40).toUpperCase()).filter(Boolean))].slice(0, MAX_PER_REQUEST);
  if (!wanted.length) throw new BagError("Choose at least one package.");

  const result = await inTransaction(db, async (session) => {
    const bag = await loadBag(db, code, session);
    if (!visible(user, bag) || !atOrigin(user, bag)) throw new BagError("Only the origin branch can fill this bag.", 403);
    if (bag.status !== BAG_STATUS.OPEN) throw new BagError("This bag is closed. Reopen it to change its packages.", 409);

    const packages = db.collection("packages");
    const found = await packages
      .find({ tracking: { $in: wanted } }, { session, projection: { _id: 0, tracking: 1, sender: 1, receiver: 1, to: 1, weight: 1, branch: 1, bag: 1, status: 1, events: 1 } })
      .toArray();
    const byTracking = new Map(found.map((pkg) => [pkg.tracking, pkg]));
    const now = new Date();
    const added = [];
    const rejected = [];

    for (const tracking of wanted) {
      const pkg = byTracking.get(tracking);
      const reason = rejection(bag, pkg);
      if (reason !== "Not eligible") {
        rejected.push({ tracking, reason });
        continue;
      }
      // The claim: only succeeds if no other bag took the package in the meantime.
      const { modifiedCount } = await packages.updateOne(
        { tracking, ...eligibleFilter(bag) },
        {
          $set: { bag: { code: bag.code, at: now } },
          $push: { history: historyEntry("added_to_bag", bag, user, now, { branch: bag.origin.code }) },
        },
        { session },
      );
      if (!modifiedCount) {
        rejected.push({ tracking, reason: "Taken by another bag just now" });
        continue;
      }
      added.push({
        tracking,
        sender: pkg.sender,
        receiver: pkg.receiver,
        to: pkg.to,
        weight: Number(pkg.weight) || 0,
        addedAt: now,
        addedBy: actor(user),
        verification: null,
      });
    }

    if (added.length) {
      const items = [...bag.items, ...added];
      const { matchedCount } = await db.collection("bags").updateOne(
        { _id: bag._id, status: BAG_STATUS.OPEN },
        {
          $push: { items: { $each: added }, events: { ...bagEvent("packages_added", bag, user, { at: now }), count: added.length, trackings: added.map((item) => item.tracking) } },
          $set: { totalPackages: items.length, totalWeight: bagWeight(items), updatedAt: now },
        },
        { session },
      );
      if (!matchedCount) throw new BagError("This bag was closed while you were adding packages.", 409);
    }
    return { added, rejected };
  });
  return result;
}

export async function removePackage(db, user, code, tracking) {
  const value = text(tracking, 40).toUpperCase();
  return inTransaction(db, async (session) => {
    const bag = await loadBag(db, code, session);
    if (!visible(user, bag) || !atOrigin(user, bag)) throw new BagError("Only the origin branch can change this bag.", 403);
    if (bag.status !== BAG_STATUS.OPEN) throw new BagError("This bag is closed. Reopen it to change its packages.", 409);
    if (!bag.items.some((item) => item.tracking === value)) throw new BagError("That package isn't in this bag.", 404);

    const now = new Date();
    const items = bag.items.filter((item) => item.tracking !== value);
    await db.collection("bags").updateOne(
      { _id: bag._id, status: BAG_STATUS.OPEN },
      {
        $pull: { items: { tracking: value } },
        $set: { totalPackages: items.length, totalWeight: bagWeight(items), updatedAt: now },
        $push: { events: { ...bagEvent("package_removed", bag, user, { at: now }), trackings: [value] } },
      },
      { session },
    );
    await db.collection("packages").updateOne(
      { tracking: value, "bag.code": bag.code },
      { $unset: { bag: "" }, $push: { history: historyEntry("removed_from_bag", bag, user, now, { branch: bag.origin.code }) } },
      { session },
    );
    return { removed: value };
  });
}

export async function closeBag(db, user, code) {
  return inTransaction(db, async (session) => {
    const bag = await loadBag(db, code, session);
    if (!visible(user, bag) || !atOrigin(user, bag)) throw new BagError("Only the origin branch can close this bag.", 403);
    requireStatus(bag, "close");
    if (!bag.items.length) throw new BagError("Add at least one package before closing the bag.");
    const now = new Date();
    const to = BAG_TRANSITIONS.close.to;
    await moveBag(db, session, bag, "close", to, { closedBy: actor(user), closedAt: now }, bagEvent("closed", bag, user, { to, at: now }));
    return { status: to };
  });
}

export async function reopenBag(db, user, code, reason) {
  const notes = text(reason, 500);
  if (!notes) throw new BagError("Say why the bag is being reopened.");
  return inTransaction(db, async (session) => {
    const bag = await loadBag(db, code, session);
    if (!visible(user, bag)) throw new BagError("Bag not found", 404);
    requireStatus(bag, "reopen");
    const now = new Date();
    const to = BAG_TRANSITIONS.reopen.to;
    await moveBag(db, session, bag, "reopen", to, { closedBy: null, closedAt: null }, bagEvent("reopened", bag, user, { to, at: now, notes }));
    return { status: to };
  });
}

export async function cancelBag(db, user, code, reason) {
  const notes = text(reason, 500);
  if (!notes) throw new BagError("Say why the bag is being cancelled.");
  return inTransaction(db, async (session) => {
    const bag = await loadBag(db, code, session);
    if (!visible(user, bag) || !atOrigin(user, bag)) throw new BagError("Only the origin branch can cancel this bag.", 403);
    requireStatus(bag, "cancel");
    const now = new Date();
    const to = BAG_TRANSITIONS.cancel.to;
    await moveBag(db, session, bag, "cancel", to, { cancelledBy: actor(user), cancelledAt: now, cancelReason: notes }, bagEvent("cancelled", bag, user, { to, at: now, notes }));
    await db.collection("packages").updateMany(
      { "bag.code": bag.code },
      { $unset: { bag: "" }, $push: { history: historyEntry("bag_cancelled", bag, user, now, { branch: bag.origin.code }) } },
      { session },
    );
    return { status: to };
  });
}

// ---------------------------------------------------------------------------------------------
// Dispatch and receive

export async function dispatchBag(db, user, code, body) {
  const dispatch = {
    transportRef: text(body?.transportRef, 120),
    carrier: text(body?.carrier, 120),
    notes: text(body?.notes, 1000),
  };
  const result = await inTransaction(db, async (session) => {
    const bag = await loadBag(db, code, session);
    if (!visible(user, bag) || !atOrigin(user, bag)) throw new BagError("Only the origin branch can dispatch this bag.", 403);
    requireStatus(bag, "dispatch");
    const now = new Date();
    const to = BAG_TRANSITIONS.dispatch.to;
    const trackings = bag.items.map((item) => item.tracking);

    await moveBag(
      db,
      session,
      bag,
      "dispatch",
      to,
      { dispatchedBy: actor(user), dispatchedAt: now, dispatch },
      bagEvent("dispatched", bag, user, { to, at: now, notes: dispatch.notes }),
    );
    // Every package in the bag goes In transit with the same moment and bag reference.
    const { modifiedCount } = await db.collection("packages").updateMany(
      { tracking: { $in: trackings }, "bag.code": bag.code, ...lastStepIs("received") },
      {
        $push: {
          events: { step: "departed", date: now, by: user.name, bag: bag.code, branch: bag.origin.code },
          history: historyEntry("bag_dispatched", bag, user, now, { branch: bag.origin.code, from: "Received", to: "In transit" }),
        },
        $set: { status: "In transit", date: now },
      },
      { session },
    );
    if (modifiedCount !== trackings.length) {
      throw new BagError(
        "Some packages in this bag changed since it was closed. Reopen the bag and check its packages.",
        409,
      );
    }
    return { status: to, trackings };
  });
  // Mirror the change in the Telegram group; failures are logged, not fatal.
  await syncPackagePosts(db, result.trackings).catch((error) => console.error("Telegram sync failed", error));
  return { status: result.status, moved: result.trackings.length };
}

// verifications: { [tracking]: { status: "received" | "missing" | "damaged", notes } }
export async function receiveBag(db, user, code, body) {
  const notes = text(body?.notes, 2000);
  const input = body?.verifications && typeof body.verifications === "object" ? body.verifications : {};

  const result = await inTransaction(db, async (session) => {
    const bag = await loadBag(db, code, session);
    if (!visible(user, bag) || !atDestination(user, bag)) {
      throw new BagError(`Only ${bag.destination.name} can receive this bag.`, 403);
    }
    requireStatus(bag, "receive");

    // Reconciliation: every package must be checked; arriving bags never mean arriving packages.
    const unchecked = [];
    const items = bag.items.map((item) => {
      const entry = input[item.tracking];
      const status = ["received", "missing", "damaged"].includes(entry?.status) ? entry.status : null;
      if (!status) unchecked.push(item.tracking);
      return { ...item, verification: status, verificationNotes: text(entry?.notes, 500) };
    });
    if (unchecked.length) {
      throw new BagError(`Check every package first. ${unchecked.length} not checked yet.`, 400, { unchecked });
    }

    const now = new Date();
    const group = (status) => items.filter((item) => item.verification === status);
    const received = group("received");
    const missing = group("missing");
    const damaged = group("damaged");
    const discrepancies = missing.length + damaged.length;
    if (discrepancies && !notes) throw new BagError("Describe what was wrong before completing the receipt.");
    const to = discrepancies ? BAG_STATUS.EXCEPTION : BAG_STATUS.RECEIVED;
    const receipt = {
      expected: items.length,
      received: received.length,
      missing: missing.length,
      damaged: damaged.length,
      notes,
    };

    await moveBag(
      db,
      session,
      bag,
      "receive",
      to,
      { items, receivedBy: actor(user), receivedAt: now, receipt },
      { ...bagEvent("received", bag, user, { to, at: now, notes }), receipt: { ...receipt, notes: undefined } },
    );

    const packages = db.collection("packages");
    // Received at the destination branch means ready for the receiver to collect.
    const arrivedEvent = { step: "pickup", date: now, by: user.name, bag: bag.code, branch: bag.destination.code };
    const arrivedHistory = historyEntry("bag_received", bag, user, now, { branch: bag.destination.code, from: "In transit", to: "Ready for pickup" });
    const inThisBag = (list) => ({ tracking: { $in: list.map((item) => item.tracking) }, "bag.code": bag.code, ...lastStepIs("departed") });

    // Verified (and damaged, which did physically arrive) packages are ready for pickup.
    const arriving = [...received, ...damaged];
    if (received.length) {
      const { modifiedCount } = await packages.updateMany(
        inThisBag(received),
        { $push: { events: arrivedEvent, history: arrivedHistory }, $set: { status: "Ready for pickup", date: now }, $unset: { bag: "" } },
        { session },
      );
      if (modifiedCount !== received.length) throw new BagError("Some packages changed while receiving. Reload and try again.", 409);
    }
    for (const item of damaged) {
      const { modifiedCount } = await packages.updateOne(
        inThisBag([item]),
        {
          $push: {
            events: arrivedEvent,
            history: { $each: [arrivedHistory, historyEntry("damaged", bag, user, now, { branch: bag.destination.code, notes: item.verificationNotes || notes })] },
          },
          $set: { status: "Ready for pickup", date: now, exception: { type: "damaged", bag: bag.code, at: now } },
          $unset: { bag: "" },
        },
        { session },
      );
      if (!modifiedCount) throw new BagError("Some packages changed while receiving. Reload and try again.", 409);
    }
    // Missing packages are never marked as received; they stay In transit and are flagged.
    for (const item of missing) {
      await packages.updateOne(
        { tracking: item.tracking, "bag.code": bag.code },
        {
          $push: { history: historyEntry("missing", bag, user, now, { branch: bag.destination.code, notes: item.verificationNotes || notes }) },
          $set: { exception: { type: "missing", bag: bag.code, at: now } },
          $unset: { bag: "" },
        },
        { session },
      );
    }
    if (discrepancies) {
      await db.collection("bag_exceptions").insertMany(
        [...missing, ...damaged].map((item) => ({
          bagCode: bag.code,
          tracking: item.tracking,
          type: item.verification,
          description: item.verificationNotes || notes,
          origin: bag.origin,
          destination: bag.destination,
          dispatchedAt: bag.dispatchedAt,
          reportedBy: actor(user),
          createdAt: now,
          status: "open",
        })),
        { session },
      );
    }
    return { status: to, receipt, arrived: arriving.map((item) => item.tracking) };
  });
  await syncPackagePosts(db, result.arrived).catch((error) => console.error("Telegram sync failed", error));
  return { status: result.status, receipt: result.receipt };
}

// ---------------------------------------------------------------------------------------------
// Exceptions

export async function resolveException(db, user, id, body) {
  if (typeof id !== "string" || !ObjectId.isValid(id)) throw new BagError("Exception not found", 404);
  const notes = text(body?.notes, 1000);
  if (!notes) throw new BagError("Add a note on how this was resolved.");

  return inTransaction(db, async (session) => {
    const exceptions = db.collection("bag_exceptions");
    const exception = await exceptions.findOne({ _id: new ObjectId(id) }, { session });
    if (!exception) throw new BagError("Exception not found", 404);
    const bag = await loadBag(db, exception.bagCode, session);
    if (!visible(user, bag)) throw new BagError("Exception not found", 404);
    if (exception.status !== "open") throw new BagError("This exception is already resolved.", 409);
    const resolution = text(body?.resolution, 20);
    if (!RESOLUTIONS[exception.type]?.some((option) => option.value === resolution)) {
      throw new BagError("Choose how it was resolved.");
    }

    const now = new Date();
    const { matchedCount } = await exceptions.updateOne(
      { _id: exception._id, status: "open" },
      { $set: { status: "resolved", resolution, resolutionNotes: notes, resolvedBy: actor(user), resolvedAt: now } },
      { session },
    );
    if (!matchedCount) throw new BagError("This exception is already resolved.", 409);

    const packages = db.collection("packages");
    const historyType = resolution === "found" ? "found" : resolution === "lost" ? "lost" : "exception_closed";
    const update = {
      $push: { history: historyEntry(historyType, bag, user, now, { branch: bag.destination.code, notes }) },
      $unset: { exception: "" },
    };
    await packages.updateOne({ tracking: exception.tracking }, update, { session });
    // A missing package that turns up is ready for pickup at the destination branch now.
    if (resolution === "found") {
      await packages.updateOne(
        { tracking: exception.tracking, ...lastStepIs("departed") },
        {
          $push: { events: { step: "pickup", date: now, by: user.name, bag: bag.code, branch: bag.destination.code } },
          $set: { status: "Ready for pickup", date: now },
        },
        { session },
      );
    }

    // The bag is settled once none of its exceptions are open.
    const open = await exceptions.countDocuments({ bagCode: bag.code, status: "open" }, { session });
    if (!open && bag.status === BAG_STATUS.EXCEPTION) {
      const to = BAG_TRANSITIONS.settle.to;
      await moveBag(db, session, bag, "settle", to, { settledAt: now }, bagEvent("exceptions_resolved", bag, user, { to, at: now }));
    }
    return { resolved: id, tracking: exception.tracking, found: resolution === "found" };
  }).then(async (result) => {
    if (result.found) await syncPackagePosts(db, [result.tracking]).catch(() => {});
    return result;
  });
}

// ---------------------------------------------------------------------------------------------
// Reading

const SORTS = {
  code: "code",
  origin: "origin.name",
  destination: "destination.name",
  packages: "totalPackages",
  weight: "totalWeight",
  status: "status",
  created: "createdAt",
  dispatched: "dispatchedAt",
  received: "receivedAt",
};

function dayRange(from, to) {
  const start = from ? new Date(`${from}T00:00:00`) : null;
  const end = to ? new Date(`${to}T23:59:59.999`) : null;
  const range = {};
  if (start && !Number.isNaN(start.getTime())) range.$gte = start;
  if (end && !Number.isNaN(end.getTime())) range.$lte = end;
  return Object.keys(range).length ? range : null;
}

// The bag list shows counts, not contents.
const LIST_FIELDS = { items: 0, events: 0 };

export async function listBags(db, user, params) {
  const scope = bagScope(user);
  const filter = { ...scope };
  const and = [];
  const q = text(params.get("q"), 40).toUpperCase();
  if (q) and.push({ code: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") } });
  const status = params.get("status");
  if (status && Object.values(BAG_STATUS).includes(status)) and.push({ status });
  const origin = text(params.get("origin"), 20);
  if (origin) and.push({ "origin.code": origin });
  const destination = text(params.get("destination"), 20);
  if (destination) and.push({ "destination.code": destination });
  for (const [key, field] of [["created", "createdAt"], ["dispatched", "dispatchedAt"], ["received", "receivedAt"]]) {
    const range = dayRange(params.get(`${key}From`), params.get(`${key}To`));
    if (range) and.push({ [field]: range });
  }
  if (and.length) filter.$and = and;

  const sortField = SORTS[params.get("sort")] ?? "createdAt";
  const direction = params.get("dir") === "asc" ? 1 : -1;
  const pageSize = Math.min(100, Math.max(5, Number.parseInt(params.get("pageSize"), 10) || 20));
  const page = Math.max(1, Number.parseInt(params.get("page"), 10) || 1);

  const bags = db.collection("bags");
  const [rows, total, counts, branches] = await Promise.all([
    bags.find(filter, { projection: LIST_FIELDS }).sort({ [sortField]: direction, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    bags.countDocuments(filter),
    bags.aggregate([{ $match: scope }, { $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
    allBranches(db),
  ]);
  const byStatus = Object.fromEntries(counts.map((row) => [row._id, row.count]));
  const stats = {
    total: counts.reduce((sum, row) => sum + row.count, 0),
    ...Object.fromEntries(Object.values(BAG_STATUS).map((value) => [value, byStatus[value] ?? 0])),
  };
  return { bags: rows, total, page, pageSize, stats, branches };
}

// Bags heading to the user's branch that haven't been received yet.
export async function incomingBags(db, user) {
  const code = ownBranch(user);
  const filter = { status: BAG_STATUS.IN_TRANSIT, ...(code && { "destination.code": code }) };
  const rows = await db.collection("bags").find(filter, { projection: LIST_FIELDS }).sort({ dispatchedAt: 1 }).toArray();
  return rows.map((bag) => ({
    ...bag,
    // Packages usually take two days between steps (see package-tracking), so expect the bag then.
    expectedAt: new Date(new Date(bag.dispatchedAt).getTime() + 2 * 86400000),
    delayed: Date.now() - new Date(bag.dispatchedAt).getTime() > DELAY_DAYS * 86400000,
  }));
}

export async function bagDetails(db, user, code) {
  const bag = await loadBag(db, code);
  if (!visible(user, bag)) throw new BagError("Bag not found", 404);
  const trackings = bag.items.map((item) => item.tracking);
  const [packages, exceptions] = await Promise.all([
    db
      .collection("packages")
      .find({ tracking: { $in: trackings } }, { projection: { _id: 0, tracking: 1, sender: 1, receiver: 1, to: 1, from: 1, route: 1, weight: 1, status: 1, events: 1, history: 1, exception: 1, bag: 1, branch: 1 } })
      .toArray(),
    db.collection("bag_exceptions").find({ bagCode: bag.code }).sort({ createdAt: 1 }).toArray(),
  ]);
  const byTracking = new Map(packages.map((pkg) => [pkg.tracking, pkg]));
  return {
    bag: {
      ...bag,
      items: bag.items.map((item) => ({ ...item, package: byTracking.get(item.tracking) ?? null })),
    },
    exceptions,
    access: {
      origin: atOrigin(user, bag),
      destination: atDestination(user, bag),
      own: ownBranch(user),
    },
  };
}

export async function bagReport(db, user, params) {
  const scope = bagScope(user);
  const range = dayRange(params.get("from"), params.get("to"));
  const bags = db.collection("bags");
  const now = Date.now();
  const delayedBefore = new Date(now - DELAY_DAYS * 86400000);

  const [dispatched, received, inTransit, delayed, durations, exceptionCounts, openExceptions] = await Promise.all([
    bags
      .aggregate([
        { $match: { ...scope, dispatchedAt: range ?? { $ne: null } } },
        { $group: { _id: "$origin.code", name: { $first: "$origin.name" }, bags: { $sum: 1 }, packages: { $sum: "$totalPackages" }, weight: { $sum: "$totalWeight" } } },
        { $sort: { bags: -1 } },
      ])
      .toArray(),
    bags
      .aggregate([
        { $match: { ...scope, receivedAt: range ?? { $ne: null } } },
        {
          $group: {
            _id: "$destination.code",
            name: { $first: "$destination.name" },
            bags: { $sum: 1 },
            packages: { $sum: "$receipt.received" },
            missing: { $sum: "$receipt.missing" },
            damaged: { $sum: "$receipt.damaged" },
          },
        },
        { $sort: { bags: -1 } },
      ])
      .toArray(),
    bags.countDocuments({ ...scope, status: BAG_STATUS.IN_TRANSIT }),
    bags
      .find({ ...scope, status: BAG_STATUS.IN_TRANSIT, dispatchedAt: { $lt: delayedBefore } }, { projection: { code: 1, origin: 1, destination: 1, dispatchedAt: 1, totalPackages: 1 } })
      .sort({ dispatchedAt: 1 })
      .limit(50)
      .toArray(),
    bags
      .aggregate([
        { $match: { ...scope, receivedAt: range ?? { $ne: null }, dispatchedAt: { $ne: null } } },
        {
          $group: {
            _id: null,
            hours: { $avg: { $divide: [{ $subtract: ["$receivedAt", "$dispatchedAt"] }, 3600000] } },
            packages: { $avg: "$totalPackages" },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
    db
      .collection("bag_exceptions")
      .aggregate([
        { $match: { ...exceptionScope(user), ...(range && { createdAt: range }) } },
        { $group: { _id: { type: "$type", status: "$status" }, count: { $sum: 1 } } },
      ])
      .toArray(),
    db.collection("bag_exceptions").find({ ...exceptionScope(user), status: "open" }).sort({ createdAt: 1 }).limit(100).toArray(),
  ]);

  const count = (type, status) =>
    exceptionCounts.filter((row) => row._id.type === type && (!status || row._id.status === status)).reduce((sum, row) => sum + row.count, 0);
  return {
    dispatched,
    received,
    inTransit,
    delayed,
    delayDays: DELAY_DAYS,
    averageHours: durations[0]?.hours ?? null,
    averagePackages: durations[0]?.packages ?? null,
    exceptions: {
      missing: count("missing"),
      damaged: count("damaged"),
      open: count("missing", "open") + count("damaged", "open"),
      list: openExceptions,
    },
  };
}

function exceptionScope(user) {
  const code = ownBranch(user);
  if (!code || can(user, "bags.reports")) return {};
  return { $or: [{ "origin.code": code }, { "destination.code": code }] };
}

// Turns a BagError (or anything else) into the API's JSON reply.
export function bagErrorResponse(error, fallback) {
  if (error instanceof BagError) {
    return Response.json({ success: false, error: error.message, ...error.extra }, { status: error.status });
  }
  console.error(fallback, error);
  return Response.json({ success: false, error: fallback }, { status: 500 });
}
