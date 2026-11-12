"use client";

import { useSyncExternalStore } from "react";

// Settings live in this browser until the portal has a backend to store them.
const STORAGE_KEY = "h2h-settings";
const CHANGE_EVENT = "h2h-settings-change";

export const DEFAULT_SETTINGS = {
  business: {
    name: "H2H Express",
    phone: "",
    email: "",
    website: "",
  },
  // Packages waiting longer than this at pickup are flagged on the packages page.
  pickupReminderDays: 3,
  // When on, a package can't be marked delivered while it has a balance due.
  requirePaymentBeforeDelivery: true,
};

let cachedRaw;
let cachedSettings = DEFAULT_SETTINGS;

function readRaw() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parse(raw) {
  if (raw === cachedRaw) return cachedSettings;
  cachedRaw = raw;
  try {
    const saved = raw ? JSON.parse(raw) : {};
    cachedSettings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      business: { ...DEFAULT_SETTINGS.business, ...saved.business },
    };
  } catch {
    cachedSettings = DEFAULT_SETTINGS;
  }
  return cachedSettings;
}

function subscribe(onChange) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Payment before delivery is a fixed business rule (the server enforces it too).
export function useSettings() {
  const settings = parse(useSyncExternalStore(subscribe, readRaw, () => null));
  return settings.requirePaymentBeforeDelivery
    ? settings
    : { ...settings, requirePaymentBeforeDelivery: true };
}

export function saveSettings(changes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parse(readRaw()), ...changes }));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function resetSettings() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
