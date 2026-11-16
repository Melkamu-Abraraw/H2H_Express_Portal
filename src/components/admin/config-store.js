"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS } from "@/lib/portal-settings";
import { accountRequest } from "@/components/admin/profile-store";

// Settings, prices per kg and routes, loaded once from /api/config and shared by every page.
// Saving goes through the API, which answers with the whole updated config.
const EMPTY_ROUTES = { custom: {}, edits: {} };
let state = { loaded: false, settings: DEFAULT_SETTINGS, rates: {}, routes: EMPTY_ROUTES };
let request;
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

export function applyConfig({ settings, rates, routes }) {
  state = {
    loaded: true,
    settings: settings ?? state.settings,
    rates: rates ?? state.rates,
    routes: routes ?? state.routes,
  };
  emit();
}

function load() {
  request ??= accountRequest("/api/config")
    .then(async (body) => {
      applyConfig(body);
      if (await importBrowserData(body.empty)) {
        applyConfig(await accountRequest("/api/config"));
      }
    })
    .catch(() => {
      // Let a later mount try again.
      request = undefined;
    });
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const SERVER = state;

export function useConfig() {
  useEffect(load, []);
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}

export function json(method, body) {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// --- One-time move of data the portal used to keep in the browser -------------------------
// Earlier versions saved routes, prices and settings in localStorage. The first time someone
// who can change them opens the portal, whatever their browser holds is sent to the server
// (only for parts the server has never had), then the browser copy is deleted.

const LEGACY = { settings: "h2h-settings", rates: "h2h-shipping-rates", routes: "h2h-routes" };
// Copies of things that now come from the server; nothing to bring over.
const STALE = ["h2h-profile", "h2h-staff", "h2h-notifications"];

function readLegacy(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function forget(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing was saved there either.
  }
}

// Sends each saved piece; drops the browser copy unless the server couldn't be reached.
async function send(requests) {
  let ok = true;
  for (const [url, init] of requests) {
    try {
      await accountRequest(url, init);
    } catch (error) {
      // Refused (no permission, or old data the server won't take) is final; a server or
      // network failure keeps the browser copy so it's tried again next time.
      if (!(error.status >= 400 && error.status < 500)) ok = false;
    }
  }
  return ok;
}

async function importBrowserData(empty) {
  STALE.forEach(forget);
  if (!empty) return false;
  const requests = { settings: [], rates: [], routes: [] };

  const settings = readLegacy(LEGACY.settings);
  if (settings && empty.settings) {
    requests.settings.push([
      "/api/settings",
      json("PUT", {
        ...(settings.business && { business: { ...DEFAULT_SETTINGS.business, ...settings.business } }),
        ...(settings.pickupReminderDays && { pickupReminderDays: settings.pickupReminderDays }),
      }),
    ]);
  }

  const routes = readLegacy(LEGACY.routes);
  if (routes && empty.routes) {
    for (const [code, route] of Object.entries(routes.custom ?? {})) {
      requests.routes.push([`/api/routes/${code}`, json("PUT", { route, isNew: true })]);
    }
    for (const [code, edit] of Object.entries(routes.edits ?? {})) {
      requests.routes.push([`/api/routes/${code}`, json("PUT", { route: edit })]);
    }
  }

  const rates = readLegacy(LEGACY.rates);
  if (rates && empty.rates) {
    for (const [code, routeRates] of Object.entries(rates)) {
      requests.rates.push([`/api/routes/${code}`, json("PUT", { rates: routeRates })]);
    }
  }

  let sent = false;
  // Routes first, so prices for added routes land on routes that exist.
  for (const part of ["settings", "routes", "rates"]) {
    if (!readLegacy(LEGACY[part])) continue;
    if (!empty[part]) {
      // The server already has its own copy, which wins.
      forget(LEGACY[part]);
      continue;
    }
    if (requests[part].length) sent = true;
    if (await send(requests[part])) forget(LEGACY[part]);
  }
  return sent;
}
