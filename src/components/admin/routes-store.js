"use client";

import { useSyncExternalStore } from "react";
import { COUNTRIES } from "@/components/admin/countries";
import {
  routeAirports,
  routeCities,
  stepsBetween,
  trackingSteps,
} from "@/components/admin/package-tracking";
import { DIRECTIONS } from "@/components/admin/shipping-routes";

// Routes live in this browser until the portal has a backend to store them.
// Saved shape: { custom: { [code]: route }, edits: { [builtInCode]: { branches, defaultBranch } } }
const STORAGE_KEY = "h2h-routes";
const CHANGE_EVENT = "h2h-routes-change";
const EMPTY = { custom: {}, edits: {} };

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

let cachedRaw;
let cachedRoutes = BUILT_IN;

function readRaw() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parseSaved(raw) {
  try {
    const saved = raw ? JSON.parse(raw) : EMPTY;
    return { custom: saved.custom ?? {}, edits: saved.edits ?? {} };
  } catch {
    return EMPTY;
  }
}

function hydrate(raw) {
  if (raw === cachedRaw) return cachedRoutes;
  const { custom, edits } = parseSaved(raw);
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
  cachedRaw = raw;
  cachedRoutes = [...builtIn, ...added];
  return cachedRoutes;
}

function subscribe(onChange) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useRoutes() {
  return hydrate(useSyncExternalStore(subscribe, readRaw, () => null));
}

function write(change) {
  const saved = parseSaved(readRaw());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(change(saved)));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// `route` uses country codes for from/to. `previousCode` is set when an added route is edited.
export function saveRoute(route, previousCode) {
  write(({ custom, edits }) => {
    if (BUILT_IN.some((builtIn) => builtIn.code === route.code)) {
      const { branches, defaultBranch } = route;
      return { custom, edits: { ...edits, [route.code]: { branches, defaultBranch } } };
    }
    const next = { ...custom };
    if (previousCode) delete next[previousCode];
    next[route.code] = route;
    return { custom: next, edits };
  });
}

export function deleteRoute(code) {
  write(({ custom, edits }) => {
    const next = { ...custom };
    delete next[code];
    return { custom: next, edits };
  });
}

export function resetRoutes() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
