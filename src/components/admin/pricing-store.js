"use client";

import { useConfig } from "@/components/admin/config-store";

// Prices per kg for each route, stored on the server. They're edited with their route on the
// Routes page (see saveRoute in routes-store).
export function useShippingRates() {
  return useConfig().rates;
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
