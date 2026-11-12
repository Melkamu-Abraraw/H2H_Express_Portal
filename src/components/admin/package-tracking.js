// Every route uses the same six steps; only the office city and arrival city change.
// A package's status is derived from its latest event.

const LEGS = {
  CAET: { hub: "Toronto", city: "Addis Ababa", depart: "YYZ", arrive: "ADD" },
  CAUG: { hub: "Toronto", city: "Kampala", depart: "YYZ", arrive: "EBB" },
  ETCA: { hub: "Addis Ababa", city: "Toronto", depart: "ADD", arrive: "YYZ" },
};

const STEP_STATUS = {
  received: "In transit",
  departed: "In transit",
  arrived: "In transit",
  customs: "In transit",
  pickup: "Ready for pickup",
  delivered: "Delivered",
};

// Typical days from one step to the next, used for estimates.
const STEP_GAP_DAYS = 2;

export function stepsBetween(hub, city) {
  return [
    { key: "received", label: `Package received at ${hub || "our"} office` },
    { key: "departed", label: "In transit" },
    { key: "arrived", label: `Arrived in ${city || "destination"}` },
    { key: "customs", label: "Cleared customs" },
    { key: "pickup", label: "Ready for pickup" },
    { key: "delivered", label: "Delivered" },
  ];
}

// Routes added in the admin have no fixed cities, so their steps use generic wording.
export function trackingSteps(route) {
  const { hub, city } = LEGS[route] ?? {};
  return stepsBetween(hub, city);
}

export function routeCities(route) {
  const { hub, city } = LEGS[route] ?? {};
  return { hub, city };
}

export function statusFromEvents(events) {
  return STEP_STATUS[events.at(-1).step];
}

// Every step with its event date, or an estimate for steps not reached yet.
export function trackingTimeline({ route, events }) {
  const reached = new Map(events.map((event) => [event.step, event.date]));
  const last = events.at(-1);
  let pending = 0;

  return trackingSteps(route).map((step) => {
    const date = reached.get(step.key);
    if (date) return { ...step, date, state: step.key === last.step ? "current" : "done" };
    pending += 1;
    const estimate = new Date(last.date);
    estimate.setDate(estimate.getDate() + pending * STEP_GAP_DAYS);
    return { ...step, date: estimate, state: "upcoming" };
  });
}

// Records a new step, filling in any skipped steps at the same moment.
export function withStep(pkg, stepKey, date = new Date()) {
  const keys = trackingSteps(pkg.route).map((step) => step.key);
  const from = keys.indexOf(pkg.events.at(-1).step) + 1;
  const to = keys.indexOf(stepKey);
  const added = keys.slice(from, to + 1).map((step) => ({ step, date }));
  const events = [...pkg.events, ...added];
  return { ...pkg, events, status: statusFromEvents(events), date };
}

// Route-neutral step names for updating several packages at once.
export const BULK_STEPS = [
  { key: "departed", label: "In transit" },
  { key: "arrived", label: "Arrived at destination" },
  { key: "customs", label: "Cleared customs" },
  { key: "pickup", label: "Ready for pickup" },
  { key: "delivered", label: "Delivered" },
];

// A package can only move forward to a step it has not reached yet.
export function canMoveTo(pkg, stepKey) {
  const keys = trackingSteps(pkg.route).map((step) => step.key);
  return keys.indexOf(stepKey) > keys.indexOf(pkg.events.at(-1).step);
}

export function routeAirports(route) {
  const { depart, arrive } = LEGS[route];
  return { depart, arrive };
}
