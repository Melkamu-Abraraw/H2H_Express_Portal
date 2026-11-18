// Every route uses the same four steps: received at a branch, in transit, ready for pickup,
// delivered. A package's status is derived from its latest event.

const LEGS = {
  CAET: { hub: "Toronto", city: "Addis Ababa", depart: "YYZ", arrive: "ADD" },
  CAUG: { hub: "Toronto", city: "Kampala", depart: "YYZ", arrive: "EBB" },
  ETCA: { hub: "Addis Ababa", city: "Toronto", depart: "ADD", arrive: "YYZ" },
};

const STEP_STATUS = {
  received: "Received",
  departed: "In transit",
  pickup: "Ready for pickup",
  delivered: "Delivered",
  // Packages from the earlier six-step flow may still end on one of these; both were in transit.
  arrived: "In transit",
  customs: "In transit",
};

// Earlier steps and the step they now count as. Stored events are never rewritten.
const LEGACY_STEPS = { arrived: "departed", customs: "departed" };

export function stepKey(key) {
  return LEGACY_STEPS[key] ?? key;
}

// The package's latest step, in today's four steps.
export function lastStep(pkg) {
  return stepKey(pkg.events?.at(-1)?.step);
}

// Typical days from one step to the next, used for estimates.
const STEP_GAP_DAYS = 2;

export function stepsBetween(hub) {
  return [
    { key: "received", label: `Package received at ${hub || "our"} office` },
    { key: "departed", label: "In transit" },
    { key: "pickup", label: "Ready for pickup" },
    { key: "delivered", label: "Delivered" },
  ];
}

// Routes added in the admin have no fixed cities, so their steps use generic wording.
export function trackingSteps(route) {
  const { hub } = LEGS[route] ?? {};
  return stepsBetween(hub);
}

// The steps as one package shows them everywhere (portal and Telegram): received at its branch.
export function stepsFor(pkg) {
  return trackingSteps(pkg.route).map((step) =>
    step.key === "received" && pkg.branch?.name ? { ...step, label: `Received at ${pkg.branch.name}` } : step,
  );
}

export function routeCities(route) {
  const { hub, city } = LEGS[route] ?? {};
  return { hub, city };
}

export function statusFromEvents(events) {
  return STEP_STATUS[events.at(-1).step];
}

// The package's step in a few words, for tables.
export function currentStepLabel(pkg) {
  return STEP_STATUS[pkg.events?.at(-1)?.step] ?? pkg.status;
}

// Every step with its event date, or an estimate for steps not reached yet.
export function trackingTimeline(pkg) {
  const { events } = pkg;
  const reached = new Map();
  // An older package can have several events that now count as one step; keep the first.
  for (const event of events) if (!reached.has(stepKey(event.step))) reached.set(stepKey(event.step), event.date);
  const last = events.at(-1);
  const current = stepKey(last.step);
  let pending = 0;

  return stepsFor(pkg).map((step) => {
    const date = reached.get(step.key);
    if (date) return { ...step, date, state: step.key === current ? "current" : "done" };
    pending += 1;
    const estimate = new Date(last.date);
    estimate.setDate(estimate.getDate() + pending * STEP_GAP_DAYS);
    return { ...step, date: estimate, state: "upcoming" };
  });
}

// Records a new step, filling in any skipped steps at the same moment.
export function withStep(pkg, key, date = new Date()) {
  const keys = trackingSteps(pkg.route).map((step) => step.key);
  const from = keys.indexOf(lastStep(pkg)) + 1;
  const to = keys.indexOf(key);
  const added = keys.slice(from, to + 1).map((step) => ({ step, date }));
  const events = [...pkg.events, ...added];
  return { ...pkg, events, status: statusFromEvents(events), date };
}

// A package can only move forward to a step it has not reached yet.
export function canMoveTo(pkg, key) {
  const keys = trackingSteps(pkg.route).map((step) => step.key);
  return keys.indexOf(key) > keys.indexOf(lastStep(pkg));
}

export function routeAirports(route) {
  const { depart, arrive } = LEGS[route];
  return { depart, arrive };
}
