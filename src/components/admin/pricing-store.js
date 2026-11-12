"use client";

import { useSyncExternalStore } from "react";

// Rates live in this browser until the portal has a backend to store them.
const STORAGE_KEY = "h2h-shipping-rates";
const CHANGE_EVENT = "h2h-shipping-rates-change";
const NO_RATES = {};

let cachedRaw = null;
let cachedRates = NO_RATES;

function readRaw() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parseRates(raw) {
  if (raw === cachedRaw) return cachedRates;
  cachedRaw = raw;
  try {
    cachedRates = raw ? JSON.parse(raw) : NO_RATES;
  } catch {
    cachedRates = NO_RATES;
  }
  return cachedRates;
}

function subscribe(onChange) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useShippingRates() {
  return parseRates(useSyncExternalStore(subscribe, readRaw, () => null));
}

export function saveShippingRates(rates) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rates));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Sets one route's rates (or removes them with null), keeping every other route's.
export function saveRouteRates(code, routeRates, previousCode) {
  const next = { ...parseRates(readRaw()) };
  if (previousCode) delete next[previousCode];
  if (routeRates) next[code] = routeRates;
  else delete next[code];
  saveShippingRates(next);
}

// Returns the price per kg, or null while the admin hasn't set one.
export function getRate(rates, direction, shipping) {
  const rate = Number.parseFloat(rates[direction]?.[shipping]);
  return rate > 0 ? rate : null;
}

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(amount, currency) {
  return `${currency} ${money.format(amount)}`;
}

export function resetShippingRates() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
