"use client";

import { COUNTRIES } from "@/components/admin/countries";
import { applyConfig, json, useConfig } from "@/components/admin/config-store";
import {
  routeAirports,
  routeCities,
  stepsBetween,
  trackingSteps,
} from "@/components/admin/package-tracking";
import { accountRequest } from "@/components/admin/profile-store";
import { DIRECTIONS } from "@/components/admin/shipping-routes";

// Routes are stored on the server and shared by everyone (see /api/routes).
// Saved shape: { custom: { [code]: route }, edits: { [builtInCode]: { branches, defaultBranch } } }

export function routeCode(from, to) {
  return `${from}${to}`;
}

// Built-in routes already have packages, so only their branches can change.
const BUILT_IN = Object.entries(DIRECTIONS).map(([code, direction]) => ({
  code,
  from: direction.from,
  to: direction.to,
  currency: direction.currency,
  ...routeAirports(code),
  ...routeCities(code),
  steps: trackingSteps(code),
  branches: direction.branches,
  defaultBranch: direction.defaultBranch,
  builtIn: true,
}));

let cachedSaved;
let cachedRoutes = BUILT_IN;

function hydrate(saved) {
  if (saved === cachedSaved) return cachedRoutes;
  const { custom = {}, edits = {} } = saved ?? {};
  const builtIn = BUILT_IN.map((route) => ({ ...route, ...edits[route.code] }));
  const added = Object.values(custom)
    .filter((route) => COUNTRIES[route.from] && COUNTRIES[route.to])
    .map((route) => ({
      ...route,
      from: COUNTRIES[route.from],
      to: COUNTRIES[route.to],
      // Steps are the same everywhere; only the two cities come from the route.
      steps: stepsBetween(
        route.hub || COUNTRIES[route.from].name,
        route.city || COUNTRIES[route.to].name,
      ),
      builtIn: false,
    }));
  cachedSaved = saved;
  cachedRoutes = [...builtIn, ...added];
  return cachedRoutes;
}

export function useRoutes() {
  return hydrate(useConfig().routes);
}

// Saves a route and its prices per kg together. `route` uses country codes for from/to.
// `rates`: { normal, express }, or null to clear them. `previousCode` is set when an added
// route's countries changed; `isNew` when it's being added. Rejects with the server's message.
export async function saveRoute(route, { rates, previousCode, isNew = false } = {}) {
  const body = await accountRequest(
    `/api/routes/${route.code}`,
    json("PUT", { route, rates, ...(previousCode && { previousCode }), isNew }),
  );
  applyConfig(body);
}

export async function deleteRoute(code) {
  applyConfig(await accountRequest(`/api/routes/${code}`, { method: "DELETE" }));
}
