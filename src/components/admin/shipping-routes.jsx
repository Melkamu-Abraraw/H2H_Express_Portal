import { COUNTRIES } from "@/components/admin/countries";

const CANADA_BRANCHES = {
  HEAD: {
    name: "Hand to Hand Express Head Office (Toronto)",
    address: "2017 Danforth Ave, Toronto, ON M4C 1J7",
  },
  OSSI: { name: "Ossington Branch", address: "884 Bloor St W, Toronto, ON M6G 1M5" },
};

const CANADA = COUNTRIES.CA;
const ETHIOPIA = COUNTRIES.ET;
const UGANDA = COUNTRIES.UG;

// Routes that already have packages on them. Routes added in the admin live in routes-store.
// The currency follows the country the package is sent from.
export const DIRECTIONS = {
  CAET: {
    from: CANADA,
    to: ETHIOPIA,
    currency: "CAD",
    defaultBranch: "HEAD",
    branches: CANADA_BRANCHES,
  },
  CAUG: {
    from: CANADA,
    to: UGANDA,
    currency: "CAD",
    defaultBranch: "HEAD",
    branches: CANADA_BRANCHES,
  },
  ETCA: {
    from: ETHIOPIA,
    to: CANADA,
    currency: "ETB",
    defaultBranch: "ADD",
    branches: {
      ADD: {
        name: "Hand to Hand Express Addis Ababa",
        address: "Bole, Alemenesh Plaza, 7th Floor, Addis Ababa, Ethiopia",
      },
    },
  },
};

export function Country({ country: { name, Flag } }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Flag className="h-3 w-4 shrink-0 rounded-[2px]" aria-hidden="true" />
      {name}
    </span>
  );
}

export function RouteLabel({ from, to }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Country country={from} />
      <span className="text-xs text-muted-foreground">to</span>
      <Country country={to} />
    </span>
  );
}

// Where the receiver collects, by destination country: Canada → Ethiopia packages are picked
// up in Addis Ababa, Ethiopia → Canada packages at the Toronto head office.
const PICKUP_BRANCHES = {
  ET: { code: "ADD", ...DIRECTIONS.ETCA.branches.ADD },
  CA: { code: "HEAD", ...CANADA_BRANCHES.HEAD },
};

const NO_FLAG = () => null;

// A package's countries: built-in routes know theirs; saved packages carry the names.
export function packageCountries(pkg) {
  if (DIRECTIONS[pkg.route]) return DIRECTIONS[pkg.route];
  const byName = (name) =>
    Object.values(COUNTRIES).find((country) => country.name === name) ?? {
      name: name ?? "?",
      Flag: NO_FLAG,
    };
  return { from: byName(pkg.from), to: byName(pkg.to) };
}

// The branch where this package's receiver collects it, or null if we have none there.
export function pickupBranchFor(pkg) {
  const { to } = packageCountries(pkg);
  return PICKUP_BRANCHES[to.code] ?? null;
}

export function PackageRouteLabel({ pkg }) {
  const { from, to } = packageCountries(pkg);
  return <RouteLabel from={from} to={to} />;
}
