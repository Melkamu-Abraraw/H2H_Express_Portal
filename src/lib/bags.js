// Bags: a physical bag carries several packages between two branches. The bag has its own
// status and history; each package inside keeps its own tracking. Shared by the API and the UI,
// so both agree on what each status means and which move comes next.

export const BAG_STATUS = {
  OPEN: "OPEN",
  READY_FOR_DISPATCH: "READY_FOR_DISPATCH",
  IN_TRANSIT: "IN_TRANSIT",
  RECEIVED: "RECEIVED",
  EXCEPTION: "EXCEPTION",
  CANCELLED: "CANCELLED",
};

export const BAG_STATUSES = [
  { value: BAG_STATUS.OPEN, label: "Open", dot: "bg-status-received", pill: "bg-status-received/15 text-status-received" },
  { value: BAG_STATUS.READY_FOR_DISPATCH, label: "Ready for dispatch", dot: "bg-status-pickup", pill: "bg-status-pickup/15 text-status-pickup" },
  { value: BAG_STATUS.IN_TRANSIT, label: "In transit", dot: "bg-status-transit", pill: "bg-status-transit/15 text-status-transit" },
  { value: BAG_STATUS.RECEIVED, label: "Received", dot: "bg-status-good", pill: "bg-status-good/15 text-status-good" },
  { value: BAG_STATUS.EXCEPTION, label: "Exception", dot: "bg-status-bad", pill: "bg-status-bad/15 text-status-bad" },
  { value: BAG_STATUS.CANCELLED, label: "Cancelled", dot: "bg-muted-foreground", pill: "bg-muted text-muted-foreground" },
];

export function bagStatusInfo(status) {
  return BAG_STATUSES.find((item) => item.value === status) ?? BAG_STATUSES[0];
}

// The only moves a bag can make. Anything else is refused by the API.
//   OPEN → READY_FOR_DISPATCH (close) → IN_TRANSIT (dispatch) → RECEIVED | EXCEPTION (receive)
//   READY_FOR_DISPATCH → OPEN (reopen, managers only)
//   OPEN | READY_FOR_DISPATCH → CANCELLED (packages are released)
//   EXCEPTION → RECEIVED once every exception is resolved
export const BAG_TRANSITIONS = {
  close: { from: [BAG_STATUS.OPEN], to: BAG_STATUS.READY_FOR_DISPATCH },
  reopen: { from: [BAG_STATUS.READY_FOR_DISPATCH], to: BAG_STATUS.OPEN },
  cancel: { from: [BAG_STATUS.OPEN, BAG_STATUS.READY_FOR_DISPATCH], to: BAG_STATUS.CANCELLED },
  dispatch: { from: [BAG_STATUS.READY_FOR_DISPATCH], to: BAG_STATUS.IN_TRANSIT },
  receive: { from: [BAG_STATUS.IN_TRANSIT], to: [BAG_STATUS.RECEIVED, BAG_STATUS.EXCEPTION] },
  settle: { from: [BAG_STATUS.EXCEPTION], to: BAG_STATUS.RECEIVED },
};

export function canTransition(bag, action) {
  return Boolean(BAG_TRANSITIONS[action]?.from.includes(bag?.status));
}

// What staff record for each package when the bag is opened at the destination.
export const VERIFICATION = [
  { value: "received", label: "Received", tone: "text-status-good" },
  { value: "missing", label: "Missing", tone: "text-status-bad" },
  { value: "damaged", label: "Damaged", tone: "text-status-warn" },
];

export const EXCEPTION_TYPES = {
  missing: "Missing package",
  damaged: "Damaged package",
};

// How an exception can be closed: a missing package can turn up later, or be written off.
export const RESOLUTIONS = {
  missing: [
    { value: "found", label: "Found: ready for pickup" },
    { value: "lost", label: "Lost: close the case" },
  ],
  damaged: [
    { value: "accepted", label: "Handled: close the case" },
  ],
};

// Lines on a package's own history, in plain words for staff.
export const HISTORY_LABELS = {
  added_to_bag: "Added to bag",
  removed_from_bag: "Removed from bag",
  bag_cancelled: "Bag cancelled, package released",
  bag_dispatched: "Bag dispatched · In transit",
  bag_received: "Bag received at destination branch · Ready for pickup",
  missing: "Missing when the bag was opened",
  damaged: "Arrived damaged",
  found: "Found after being reported missing",
  lost: "Written off as lost",
  exception_closed: "Damage case closed",
};

// A bag in transit longer than this is shown as delayed.
export const DELAY_DAYS = 7;

export const BAG_CODE = /^H2H-BAG-\d{5,}$/;

export function bagWeight(items) {
  return Math.round(items.reduce((sum, item) => sum + (Number(item.weight) || 0), 0) * 100) / 100;
}
