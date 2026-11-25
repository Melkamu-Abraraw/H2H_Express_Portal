// Who can do what in the portal. Shared by the proxy, the API routes and the UI, so a menu item
// is hidden for exactly the people the server would refuse. Change access here, in one place.

export const ROLES = [
  {
    value: "owner",
    label: "Owner",
    description: "Everything, including the Payments page, staff, routes and the exchange rate.",
  },
  {
    value: "manager",
    label: "Manager",
    description: "Packages, customers, requests and routes, and takes payments. Can't see the Payments page or manage staff.",
  },
  {
    value: "front_desk",
    label: "Front desk",
    description: "Registers packages, records payments, hands over pickups and looks up customers.",
  },
  {
    value: "warehouse",
    label: "Warehouse",
    description: "Updates package tracking steps, and dispatches and receives boxes.",
  },
];

const ROLE_VALUES = new Set(ROLES.map((role) => role.value));

const ACCESS = {
  owner: ["*"],
  manager: [
    "dashboard",
    "packages.view",
    "packages.create",
    "packages.status",
    // Can take money on a package, but only the owner sees the Payments page.
    "payments.record",
    "customers.view",
    "requests.view",
    "routes.manage",
    "settings.view",
    "chat.use",
    // Bags: everything, including reopening sealed bags, settling exceptions and reports.
    "bags.view",
    "bags.create",
    "bags.dispatch",
    "bags.receive",
    "bags.resolve",
    "bags.reports",
  ],
  front_desk: [
    "dashboard",
    "packages.view",
    "packages.create",
    // Handing a package over at pickup marks it delivered.
    "packages.status",
    // Collects balances at pickup, but only the owner sees the Payments page.
    "payments.record",
    "customers.view",
    "requests.view",
    "chat.use",
    // Fills, closes and dispatches bags at their branch, and receives incoming ones.
    "bags.view",
    "bags.create",
    "bags.dispatch",
    "bags.receive",
  ],
  // Moves bags (dispatch and receive) but doesn't fill them.
  warehouse: ["packages.view", "packages.status", "chat.use", "bags.view", "bags.dispatch", "bags.receive"],
};

export function isRole(value) {
  return ROLE_VALUES.has(value);
}

export function roleLabel(value) {
  return ROLES.find((role) => role.value === value)?.label ?? "Staff";
}

export function can(user, permission) {
  const granted = ACCESS[user?.role];
  return Boolean(granted && (granted.includes("*") || granted.includes(permission)));
}

// Admin pages and the permission each needs, most specific first. Pages not listed (such as
// /admin/account) only need a signed-in user.
const PAGES = [
  ["/admin/packages/new", "packages.create"],
  ["/admin/packages", "packages.view"],
  ["/admin/payments", "payments.view"],
  ["/admin/customers", "customers.view"],
  ["/admin/requests", "requests.view"],
  ["/admin/routes", "routes.manage"],
  ["/admin/staff", "staff.manage"],
  ["/admin/settings", "settings.view"],
  ["/admin/chat", "chat.use"],
  ["/admin/bags/reports", "bags.reports"],
  ["/admin/bags", "bags.view"],
];

export function pagePermission(pathname) {
  if (pathname === "/admin") return "dashboard";
  return PAGES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? null;
}

// Where someone lands after signing in, or when they open a page they can't use.
export function homePage(user) {
  if (can(user, "dashboard")) return "/admin";
  if (can(user, "packages.view")) return "/admin/packages";
  return "/admin/account";
}
