// The owner sets how much local money 1 CAD buys: { ETB, UGX }. Packages are charged in the
// sender's currency but collected at pickup in the destination's: Birr in Ethiopia, Canadian
// dollars in Canada, Uganda shillings in Uganda.
const format = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatWhole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

// A bare number is the Birr rate (older callers).
function normalize(rates) {
  if (typeof rates === "number") return { ETB: rates };
  return rates ?? {};
}

// The currency the receiver pays in, from where the package is going.
export function pickupCurrencyOf(pkg) {
  if (pkg.route === "CAET" || pkg.to === "Ethiopia") return "ETB";
  if (pkg.route === "ETCA" || pkg.to === "Canada") return "CAD";
  if (pkg.route === "CAUG" || pkg.to === "Uganda") return "UGX";
  return null;
}

// The amount in the pickup currency, or null when it's already in that currency or the
// rate needed hasn't been set.
export function pickupAmount(pkg, amount, rates) {
  const to = pickupCurrencyOf(pkg);
  const from = pkg.currency ?? "CAD";
  const table = { CAD: 1, ...normalize(rates) };
  if (!to || to === from || !(amount > 0) || !(table[from] > 0) || !(table[to] > 0)) return null;
  const value = (amount / table[from]) * table[to];
  return { currency: to, value, text: `${to} ${(to === "UGX" ? formatWhole : format).format(value)}` };
}

// The amount in the pickup currency as text (e.g. "ETB 5,400.00"), or null if it doesn't apply.
export function otherCurrency(pkg, amount, rates) {
  return pickupAmount(pkg, amount, rates)?.text ?? null;
}
