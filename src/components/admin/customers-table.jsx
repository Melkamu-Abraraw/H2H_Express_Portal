"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { LoaderCircle, Plane, Search } from "lucide-react";
import { CustomerCardButton } from "@/components/admin/customer-card";
import { useToday } from "@/components/admin/date-range-picker";
import { routeAirports } from "@/components/admin/package-tracking";
import { formatMoney } from "@/components/admin/pricing-store";
import { ALL, Filter, relativeDay } from "@/components/admin/table-filters";
import { COUNTRY_LIST } from "@/components/admin/countries";
import { Country } from "@/components/admin/shipping-routes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const NO_FLAG = () => null;

function countryNamed(name) {
  return COUNTRY_LIST.find((country) => country.name === name) ?? { name: name || "—", Flag: NO_FLAG };
}

// Customers come from the API with dates as text.
function fromApi(person) {
  return {
    ...person,
    customerSince: new Date(person.customerSince),
    lastActive: new Date(person.lastActive),
  };
}

const TYPES = [
  { value: ALL, label: "All" },
  { value: "Customer", label: "Customers" },
  { value: "Traveler", label: "Travelers" },
];


const balanceOptions = [
  { value: ALL, label: "Any balance" },
  { value: "due", label: "Has balance due" },
  { value: "clear", label: "Fully paid" },
];

const travelerOptions = [
  { value: ALL, label: "Any trip status" },
  { value: "upcoming", label: "Trip scheduled" },
  { value: "none", label: "No trip scheduled" },
  { value: "unverified", label: "ID not verified" },
];

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function matchesExtra(person, type, balance, trip) {
  if (type === "Customer" && balance !== ALL) {
    return balance === "due" ? person.dues.length > 0 : person.dues.length === 0;
  }
  if (type === "Traveler" && trip !== ALL) {
    if (trip === "unverified") return !person.verified;
    return trip === "upcoming" ? Boolean(person.nextTrip) : !person.nextTrip;
  }
  return true;
}

function ActivityCell({ person }) {
  if (person.type === "Customer") {
    return (
      <div className="flex flex-col leading-tight">
        <span>
          <span className="font-mono">{person.sent}</span> sent ·{" "}
          <span className="font-mono">{person.received}</span> received
        </span>
        <span className="text-xs text-muted-foreground">Packages</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col leading-tight">
      <span>
        <span className="font-mono">{person.carried}</span> carried
      </span>
      <span className="text-xs text-muted-foreground">
        <span className="font-mono">{person.trips}</span> {person.trips === 1 ? "trip" : "trips"}
      </span>
    </div>
  );
}

function StatusCell({ person }) {
  if (person.type === "Customer") {
    if (person.dues.length === 0) return <span className="text-muted-foreground">Fully paid</span>;
    return (
      <div className="flex flex-col leading-tight">
        <span className="inline-flex items-center gap-1.5 font-medium text-status-warn">
          <span className="size-2 rounded-full bg-status-warn" aria-hidden="true" />
          Balance due
        </span>
        <span className="text-xs text-status-warn">
          {person.dues.map(([currency, amount]) => formatMoney(amount, currency)).join(" + ")}
        </span>
      </div>
    );
  }

  const { depart, arrive } = routeAirports(person.route);
  return (
    <div className="flex flex-col leading-tight">
      {person.nextTrip ? (
        <span className="inline-flex items-center gap-1.5">
          <Plane className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {depart} → {arrive} · {format(person.nextTrip.date, "MMM d")}
        </span>
      ) : (
        <span className="text-muted-foreground">No trip scheduled</span>
      )}
      <span className={`text-xs ${person.verified ? "text-status-good" : "text-status-warn"}`}>
        {person.verified ? "ID verified" : "ID not verified"}
        {person.nextTrip && (
          <span className="text-muted-foreground"> · {person.nextTrip.flight}</span>
        )}
      </span>
    </div>
  );
}

export function CustomersTable() {
  const [people, setPeople] = useState([]);
  const [load, setLoad] = useState({ state: "loading" });
  const [search, setSearch] = useState("");
  const [type, setType] = useState(ALL);
  const [country, setCountry] = useState(ALL);
  const [balance, setBalance] = useState(ALL);
  const [trip, setTrip] = useState(ALL);
  const today = useToday();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/customers", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!result.success) throw new Error(result.error || `Server returned HTTP ${response.status}`);
        return result;
      })
      .then((result) => {
        if (cancelled) return;
        setPeople(result.customers.map(fromApi));
        setLoad({ state: "ready" });
      })
      .catch((error) => !cancelled && setLoad({ state: "error", message: error.message }));
    return () => {
      cancelled = true;
    };
  }, []);

  // Countries people actually live in, from their packages.
  const countryOptions = [
    { value: ALL, label: "All countries" },
    ...[...new Set(people.map((person) => person.country).filter(Boolean))]
      .sort()
      .map((name) => ({ value: name, label: name })),
  ];

  const term = search.trim().toLowerCase();
  const visible = people.filter(
    (person) =>
      (type === ALL || person.type === type) &&
      (country === ALL || person.country === country) &&
      matchesExtra(person, type, balance, trip) &&
      (!term ||
        [person.name, person.id, person.phone].some((text) =>
          String(text ?? "").toLowerCase().includes(term),
        )),
  );
  const counts = Object.fromEntries(
    TYPES.map(({ value }) => [
      value,
      value === ALL ? people.length : people.filter((person) => person.type === value).length,
    ]),
  );
  const filtered = term || type !== ALL || country !== ALL || balance !== ALL || trip !== ALL;

  function changeType(value) {
    if (!value) return;
    setType(value);
    setBalance(ALL);
    setTrip(ALL);
  }

  function clearFilters() {
    setSearch("");
    changeType(ALL);
    setCountry(ALL);
  }

  return (
    <Card className="min-w-0 pb-0">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <ToggleGroup
          type="single"
          value={type}
          onValueChange={changeType}
          aria-label="Customer type"
          className="rounded-lg bg-muted p-1"
        >
          {TYPES.map(({ value, label }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className="h-7 gap-1.5 rounded-md px-3 text-muted-foreground hover:bg-transparent data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              {label}
              <span className="font-mono text-xs text-muted-foreground">{counts[value]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="relative w-full sm:w-auto sm:min-w-48 sm:max-w-xs sm:flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search by name, ID or phone"
            placeholder="Search name, ID or phone..."
            className="pl-8"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Filter
          label="Filter by country"
          value={country}
          onChange={setCountry}
          options={countryOptions}
        />
        {type === "Customer" && (
          <Filter
            label="Filter by balance"
            value={balance}
            onChange={setBalance}
            options={balanceOptions}
          />
        )}
        {type === "Traveler" && (
          <Filter
            label="Filter by trip status"
            value={trip}
            onChange={setTrip}
            options={travelerOptions}
          />
        )}
        {filtered && (
          <Button variant="ghost" onClick={clearFilters}>
            Clear
          </Button>
        )}
        <p role="status" className="text-sm text-muted-foreground sm:ml-auto">
          <span className="font-mono">{visible.length}</span> of{" "}
          <span className="font-mono">{people.length}</span>
        </p>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4 text-muted-foreground">Name</TableHead>
              <TableHead className="text-muted-foreground">Type</TableHead>
              <TableHead className="text-muted-foreground">Phone</TableHead>
              <TableHead className="text-muted-foreground">Country</TableHead>
              <TableHead className="text-muted-foreground">Activity</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Last active</TableHead>
              <TableHead className="pr-4">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((person) => (
              <TableRow key={person.id} className="h-14">
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium"
                      aria-hidden="true"
                    >
                      {initials(person.name)}
                    </span>
                    <div className="flex flex-col leading-tight">
                      <span className="font-medium">{person.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{person.id}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{person.type}</TableCell>
                <TableCell className="font-mono text-[13px]">{person.phone}</TableCell>
                <TableCell>
                  <Country country={countryNamed(person.country)} />
                </TableCell>
                <TableCell>
                  <ActivityCell person={person} />
                </TableCell>
                <TableCell>
                  <StatusCell person={person} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col leading-tight">
                    <span>{format(person.lastActive, "MMM d")}</span>
                    {today && (
                      <span className="text-xs text-muted-foreground">
                        {relativeDay(person.lastActive, today)}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="pr-4 text-right">
                  {person.type === "Customer" && <CustomerCardButton customer={person} />}
                </TableCell>
              </TableRow>
            ))}
            {visible.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className={`h-32 text-center ${load.state === "error" ? "text-status-bad" : "text-muted-foreground"}`}
                >
                  {load.state === "loading" ? (
                    <span className="inline-flex items-center gap-2">
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      Loading customers…
                    </span>
                  ) : load.state === "error" ? (
                    `Couldn't load customers: ${load.message}`
                  ) : people.length === 0 ? (
                    "No customers yet. They appear here once a package is registered."
                  ) : (
                    "No customers match your search."
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
