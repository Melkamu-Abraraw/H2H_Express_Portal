import { COUNTRIES } from "@/components/admin/countries";
import { DIRECTIONS } from "@/components/admin/shipping-routes";
import { withDefaults } from "@/lib/portal-settings";

// Portal configuration shared by every staff member, kept in the "settings" collection
// (next to the exchange rate):
//   { _id: "portal", business, pickupReminderDays }
//   { _id: "rates",  rates:  { [routeCode]: { normal, express } } }      price per kg
//   { _id: "routes", custom: { [routeCode]: route }, edits: { [builtInCode]: { branches, defaultBranch } } }

export class InvalidRoute extends Error {
  constructor(message, field) {
    super(message);
    this.field = field;
  }
}

export async function getConfig(db) {
  const docs = await db
    .collection("settings")
    .find({ _id: { $in: ["portal", "rates", "routes"] } })
    .toArray();
  const byId = Object.fromEntries(docs.map((doc) => [doc._id, doc]));
  return {
    settings: withDefaults(byId.portal),
    rates: byId.rates?.rates ?? {},
    routes: { custom: byId.routes?.custom ?? {}, edits: byId.routes?.edits ?? {} },
    // Which parts have never been saved, so a browser holding older local data can bring it over.
    empty: { settings: !byId.portal, rates: !byId.rates, routes: !byId.routes },
  };
}

export async function getBusiness(db) {
  const doc = await db.collection("settings").findOne({ _id: "portal" }, { projection: { business: 1 } });
  return withDefaults(doc ?? {}).business;
}

const CODE = /^[A-Z]{2}[A-Z]{2}$/;
const BRANCH_KEY = /^[A-Z0-9_-]{1,20}$/i;
const AIRPORT = /^[A-Z]{3}$/;

export function isRouteCode(code) {
  return typeof code === "string" && CODE.test(code);
}

export function isBuiltIn(code) {
  return Object.hasOwn(DIRECTIONS, code);
}

function text(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseBranches(value, defaultBranch) {
  const entries = value && typeof value === "object" ? Object.entries(value).slice(0, 30) : [];
  if (!entries.length) throw new InvalidRoute("Add at least one branch.", "branches");
  const branches = {};
  for (const [key, branch] of entries) {
    if (!BRANCH_KEY.test(key)) throw new InvalidRoute("A branch code is invalid.", "branches");
    const name = text(branch?.name, 200);
    const address = text(branch?.address, 300);
    if (!name || !address) throw new InvalidRoute("Every branch needs a name and address.", "branches");
    branches[key] = { name, address };
  }
  const chosen = Object.hasOwn(branches, defaultBranch) ? defaultBranch : Object.keys(branches)[0];
  return { branches, defaultBranch: chosen };
}

// Validates a route from the Routes page. Built-in routes only change their branches.
export function parseRoute(code, body) {
  const { branches, defaultBranch } = parseBranches(body?.branches, body?.defaultBranch);
  if (isBuiltIn(code)) return { builtIn: true, edit: { branches, defaultBranch } };

  const from = text(body?.from, 2);
  const to = text(body?.to, 2);
  if (!COUNTRIES[from] || !COUNTRIES[to]) throw new InvalidRoute("Choose both countries.", "to");
  if (from === to) throw new InvalidRoute("Choose a different country from the origin.", "to");
  if (`${from}${to}` !== code) throw new InvalidRoute("The route doesn't match its countries.", "to");
  const currency = text(body?.currency, 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new InvalidRoute("Choose a currency.", "currency");
  const route = {
    code,
    from,
    to,
    currency,
    depart: text(body?.depart, 3).toUpperCase(),
    arrive: text(body?.arrive, 3).toUpperCase(),
    hub: text(body?.hub, 80),
    city: text(body?.city, 80),
    branches,
    defaultBranch,
  };
  for (const field of ["depart", "arrive"]) {
    if (route[field] && !AIRPORT.test(route[field])) throw new InvalidRoute("Use a 3-letter airport code.", field);
  }
  if (!route.hub) throw new InvalidRoute("Enter the city where we receive packages.", "hub");
  if (!route.city) throw new InvalidRoute("Enter the city packages arrive in.", "city");
  return { builtIn: false, route };
}

// { normal, express } prices per kg; either may be left empty. null clears the route's prices.
export function parseRates(value) {
  if (value === null) return null;
  const out = {};
  for (const speed of ["normal", "express"]) {
    const raw = value?.[speed];
    if (raw === "" || raw === undefined || raw === null) {
      out[speed] = "";
      continue;
    }
    const rate = Math.round(Number(raw) * 100) / 100;
    if (!(rate > 0) || rate > 100000) throw new InvalidRoute("Enter a price above 0, or leave it empty.", speed);
    out[speed] = rate;
  }
  return out.normal === "" && out.express === "" ? null : out;
}
