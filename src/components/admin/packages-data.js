// Placeholder data: replace with real queries when the backend exists.

import { paymentStatus } from "@/components/admin/package-payments";
import { statusFromEvents, trackingSteps } from "@/components/admin/package-tracking";

const SENDERS = [
  "Alemu Tadesse",
  "Fitsum Gebresilassie",
  "Mary Johnson",
  "David Okello",
  "Selam Kassa",
  "Hana Bekele",
  "Samuel Mulu",
  "Grace Nakato",
];
const RECEIVERS = [
  "Tigist Alemu",
  "Yonas Haile",
  "Peter Ssemanda",
  "Sarah Thompson",
  "Bethel Tesfaye",
  "Ruth Namubiru",
  "Daniel Girma",
  "Liya Worku",
];
const ROUTES = ["CAET", "CAUG", "ETCA"];
// How many tracking steps each sample package has reached (2-4 in transit, 5 pickup, 6 delivered).
const STEPS_REACHED = [2, 5, 3, 6, 4, 5];
const HOUR = 60 * 60 * 1000;
// Sample per-kg rates in each route's currency.
const RATE_PER_KG = { CAET: 9.5, CAUG: 10.5, ETCA: 1100 };
// Share of the charge each sample package has paid so far.
const PAID_SHARE = [1, 0.5, 1, 1, 1, 0, 1, 1];

function sampleEvents(route, reached, lastDate, index) {
  return trackingSteps(route)
    .slice(0, reached)
    .map((step, position) => ({
      step: step.key,
      date: new Date(lastDate - (reached - 1 - position) * (40 + ((index * 5) % 20)) * HOUR),
    }));
}

export const packages = Array.from({ length: 24 }, (_, index) => {
  const route = ROUTES[index % ROUTES.length];
  const hour = String(8 + ((index * 7) % 10)).padStart(2, "0");
  const minute = String((index * 37) % 60).padStart(2, "0");
  const weight = 2 + ((index * 53) % 220) / 10;
  const date = new Date(2026, 10, 8 - Math.floor(index / 4) * 2, Number(hour), Number(minute));
  const reached = STEPS_REACHED[index % STEPS_REACHED.length];
  const events = sampleEvents(route, reached, date, index);
  const charge = Math.round(weight * RATE_PER_KG[route] * 2) / 2;
  // Delivered packages were released, so they are fully paid.
  const share = reached === 6 ? 1 : PAID_SHARE[index % PAID_SHARE.length];
  const amountPaid = Math.round(charge * share * 2) / 2;

  return {
    tracking: `H2H-${route}-${String(8421 - index).padStart(6, "0")}`,
    sender: SENDERS[index % SENDERS.length],
    // Offset each round so a sender ships to different receivers over time.
    receiver: RECEIVERS[(index * 3 + Math.floor(index / SENDERS.length)) % RECEIVERS.length],
    route,
    status: statusFromEvents(events),
    events,
    payment: paymentStatus(amountPaid, charge),
    weight,
    charge,
    amountPaid,
    date,
  };
});

// Placeholder comparison figures until historical data comes from the backend.
export const packageTrends = {
  inTransitLastWeek: 4,
  onTimeRate: 0.98,
  weightLastMonth: 280,
};
