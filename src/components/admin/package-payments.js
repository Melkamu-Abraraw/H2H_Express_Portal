// Payment helpers. A package is "Paid" only when nothing is left to collect.

import { DIRECTIONS } from "@/components/admin/shipping-routes";

// Saved packages carry their currency; sample ones take it from their built-in route.
export function currencyOf(pkg) {
  return pkg.currency ?? DIRECTIONS[pkg.route]?.currency ?? "CAD";
}

// The same two methods the registration form offers.
export const PAYMENT_METHODS = ["Cash", "Transfer"];

export function balanceDue(pkg) {
  return Math.max(0, Math.round((pkg.charge - pkg.amountPaid) * 100) / 100);
}

export function paymentStatus(amountPaid, charge) {
  return amountPaid >= charge ? "Paid" : "Pending";
}

// Records a payment, never collecting more than is owed.
export function withPayment(pkg, amount) {
  const amountPaid = Math.min(pkg.charge, pkg.amountPaid + amount);
  return { ...pkg, amountPaid, payment: paymentStatus(amountPaid, pkg.charge) };
}

// Packages are released to the receiver only once the balance is settled
// (unless that rule is switched off in Settings).
export function blockedByPayment(pkg, stepKey, required = true) {
  return required && stepKey === "delivered" && balanceDue(pkg) > 0;
}

// Totals per currency, since routes are charged in different currencies.
export function totalsByCurrency(packages, amountOf) {
  const totals = new Map();
  for (const item of packages) {
    const currency = currencyOf(item);
    totals.set(currency, (totals.get(currency) ?? 0) + amountOf(item));
  }
  return [...totals].filter(([, amount]) => amount > 0);
}
