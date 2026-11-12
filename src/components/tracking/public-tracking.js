// Turns an internal package record into what a customer may see on the public tracking page.
// Deliberately leaves out phone numbers, full names and amounts: anyone with the number can open it.

import { balanceDue } from "@/components/admin/package-payments";
import { routeCities, trackingTimeline } from "@/components/admin/package-tracking";
import { packages } from "@/components/admin/packages-data";
import { COUNTRY_LIST } from "@/components/admin/countries";
import { DIRECTIONS, pickupBranchFor } from "@/components/admin/shipping-routes";

// Timeline wording follows the admin's six steps; `short` labels the progress line.
const STAGES = {
  received: {
    short: "Received",
    title: "Received",
    message: (c) => `We have your package at our ${c.origin} office and are preparing it to ship.`,
  },
  departed: {
    short: "Transit",
    title: "In transit",
    message: (c) => `Your package is on its way to ${c.city}.`,
  },
  arrived: {
    short: "Arrived",
    title: (c) => `Arrived in ${c.city}`,
    message: (c) =>
      `Your package has landed in ${c.city} and is going through customs. This usually takes 1–2 days.`,
  },
  customs: {
    short: "Customs",
    title: "Cleared customs",
    message: () => "Customs is done. We're getting your package ready for pickup.",
  },
  pickup: {
    short: "Ready",
    title: "Ready for pickup",
    message: (c) => `${c.receiver} can collect it now. Please bring photo ID.`,
  },
  delivered: {
    short: "Delivered",
    title: "Delivered",
    message: (c) => `${c.receiver} has collected this package. Thanks for shipping with us.`,
  },
};

function shortName(name) {
  const [first, ...rest] = name.split(" ");
  return rest.length ? `${first} ${rest.at(-1)[0]}.` : first;
}

// The pickup office for the package's destination (Addis Ababa or the Toronto head office).
function pickupOffice(pkg) {
  const branch = pickupBranchFor(pkg);
  if (!branch) return null;
  return branch.name.replace("Hand to Hand Express", "H2H").replace(/\s+/g, " ").trim();
}

export function trackingNumbers() {
  return packages.map((pkg) => pkg.tracking);
}

// Built-in routes know their countries; packages on routes added later carry the names.
function routeCountries(pkg) {
  if (DIRECTIONS[pkg.route]) return DIRECTIONS[pkg.route];
  const byName = (name) =>
    COUNTRY_LIST.find((country) => country.name === name) ?? {
      code: "",
      name: name || "Destination",
      Flag: () => null,
    };
  return { from: byName(pkg.from), to: byName(pkg.to) };
}

// Sample packages only; real ones are looked up on the server (see lib/server/tracking).
export function publicTracking(number) {
  const pkg = packages.find((item) => item.tracking === number);
  return pkg ? toPublicTracking(pkg) : null;
}

export function toPublicTracking(pkg) {
  const { from, to } = routeCountries(pkg);
  const { hub, city: routeCity } = routeCities(pkg.route);
  const city = routeCity ?? to.name;
  const context = { origin: hub ?? from.name, city, receiver: shortName(pkg.receiver) };
  const steps = trackingTimeline(pkg).map((step) => {
    const stage = STAGES[step.key];
    return {
      key: step.key,
      short: stage?.short ?? step.label,
      event: step.label,
      date: step.date,
      state: step.state,
    };
  });
  const current = steps.findIndex((step) => step.state === "current");
  const stage = STAGES[steps[current].key];
  const delivered = steps[current].key === "delivered";

  return {
    tracking: pkg.tracking,
    title: typeof stage?.title === "function" ? stage.title(context) : (stage?.title ?? steps[current].event),
    message: stage?.message(context) ?? "",
    receiver: context.receiver,
    city: context.city,
    country: to,
    origin: { city: context.origin, country: from },
    shipped: steps[0].date,
    weight: pkg.weight,
    steps,
    current,
    delivered,
    eta: steps.at(-1).date,
    updated: steps[current].date,
    pickup: pickupOffice(pkg) ?? `Pickup point in ${context.city}`,
    balanceDue: balanceDue(pkg) > 0,
  };
}
