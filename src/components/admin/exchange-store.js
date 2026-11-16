"use client";

import { useSyncExternalStore } from "react";

// The owner's CAD -> Birr rate lives in the database; this keeps one shared copy per page.
let rates = { ETB: null, UGX: null };
let started = false;
const EMPTY = { ETB: null, UGX: null };
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

function load() {
  fetch("/api/exchange-rate")
    .then((response) => response.json())
    .then((result) => {
      if (result.success) {
        rates = result.rates;
        emit();
      }
    })
    .catch(() => {});
}

function subscribe(listener) {
  if (!started) {
    started = true;
    load();
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Local money per 1 CAD: { ETB, UGX }, each null until loaded or if the owner hasn't set it.
export function useExchangeRates() {
  return useSyncExternalStore(subscribe, () => rates, () => EMPTY);
}

// `values` is { etb?, ugx? }.
export async function saveExchangeRates(values) {
  const response = await fetch("/api/exchange-rate", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  const result = await response.json().catch(() => null);
  if (!result?.success) throw new Error(result?.error || "Couldn't save the exchange rate");
  rates = result.rates;
  emit();
}
