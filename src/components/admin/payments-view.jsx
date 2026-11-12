"use client";

import { useEffect, useState } from "react";
import { endOfDay, format, startOfDay } from "date-fns";
import { CircleCheck, Download, LoaderCircle, Search } from "lucide-react";
import { DateRangePicker, useToday } from "@/components/admin/date-range-picker";
import { downloadCsv } from "@/components/admin/export-packages";
import {
  balanceDue,
  currencyOf,
  PAYMENT_METHODS,
  totalsByCurrency,
} from "@/components/admin/package-payments";
import { statusDots } from "@/components/admin/package-views";
import { formatMoney } from "@/components/admin/pricing-store";
import { useRoutes } from "@/components/admin/routes-store";
import { useSettings } from "@/components/admin/settings-store";
import { ALL, Filter, relativeDay } from "@/components/admin/table-filters";
import { COUNTRY_LIST } from "@/components/admin/countries";
import { DIRECTIONS, RouteLabel } from "@/components/admin/shipping-routes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const EVERYTHING = "all";
const OUTSTANDING = "outstanding";
const RECEIVED = "received";

const paymentOptions = [
  { value: ALL, label: "All payments" },
  { value: "Paid", label: "Paid" },
  { value: "Pending", label: "Partly paid" },
];

const routeOptions = [
  { value: ALL, label: "All routes" },
  ...Object.entries(DIRECTIONS).map(([code, { from, to }]) => ({
    value: code,
    label: <RouteLabel from={from} to={to} />,
  })),
];

// Where the money was taken: while registering (drop-off) or when the receiver collects (pickup).
const STAGE_LABELS = { "drop-off": "Drop-off", pickup: "Pickup" };
const stageOptions = [
  { value: ALL, label: "Drop-off & pickup" },
  { value: "drop-off", label: "At drop-off" },
  { value: "pickup", label: "At pickup" },
];

const methodOptions = [
  { value: ALL, label: "All methods" },
  ...PAYMENT_METHODS.map((method) => ({ value: method, label: method })),
];

// Built-in routes have flags; routes added later fall back to the saved country names.
function PackageRoute({ pkg }) {
  const route = DIRECTIONS[pkg.route];
  if (route) return <RouteLabel from={route.from} to={route.to} />;
  const country = (name) =>
    COUNTRY_LIST.find((option) => option.name === name) ?? { name: name ?? "?", Flag: () => null };
  return <RouteLabel from={country(pkg.from)} to={country(pkg.to)} />;
}

// "Hand to Hand Express Head Office (Toronto)" → "Head Office (Toronto)";
// "Hand to Hand Express Addis Ababa" → "Addis Ababa".
function branchLabel(branch) {
  if (!branch?.name) return "—";
  const short = branch.name
    .replace(/hand to hand express/i, "")
    .trim()
    .replace(/^\((.*)\)$/, "$1");
  return short || branch.name;
}

// The API sends dates as text; the tables work with Date objects.
function fromApiPackage(pkg) {
  return {
    ...pkg,
    date: new Date(pkg.date),
    events: pkg.events.map((event) => ({ ...event, date: new Date(event.date) })),
  };
}

function fromApiPayment(payment) {
  return { ...payment, date: new Date(payment.date) };
}

async function readResult(response) {
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Server returned HTTP ${response.status}`);
  }
  if (!result.success) throw new Error(result.error || "Something went wrong");
  return result;
}

const LEDGER_COLUMNS = [
  ["Receipt", (item) => item.id],
  ["Date", (item) => format(item.date, "yyyy-MM-dd HH:mm")],
  ["Paid at", (item) => STAGE_LABELS[item.stage] ?? ""],
  ["Tracking #", (item) => item.tracking],
  ["Payer", (item) => item.payer],
  ["Method", (item) => item.method],
  ["Branch", (item) => branchLabel(item.branch)],
  ["Cashier", (item) => item.receivedBy],
  ["Amount", (item) => item.amount.toFixed(2)],
  ["Currency", (item) => item.currency],
];

// Ready-for-pickup packages can't be released until paid, so they come first, oldest first.
function byUrgency(a, b) {
  const held = (item) => (item.status === "Ready for pickup" ? 0 : 1);
  return held(a) - held(b) || a.events[0].date - b.events[0].date;
}

function inDateRange(date, range) {
  if (!range?.from) return true;
  return date >= startOfDay(range.from) && date <= endOfDay(range.to ?? range.from);
}

// One headline line per currency (e.g. CAD and ETB), since routes charge in different currencies.
function currencyLines(totals) {
  return totals.length ? totals.map(([code, amount]) => formatMoney(amount, code)) : ["None"];
}

function plural(count, word) {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

function newestFirst(a, b) {
  return b.events[0].date - a.events[0].date;
}

function PaymentStats({ outstanding, received }) {
  const atDropOff = received.filter((item) => item.stage === "drop-off").length;
  const { requirePaymentBeforeDelivery: enforced } = useSettings();
  const collected = currencyLines(totalsByCurrency(received, (item) => item.amount));
  const owed = currencyLines(totalsByCurrency(outstanding, balanceDue));
  const cash = received.filter((item) => item.method === "Cash");
  const cashTotals = currencyLines(totalsByCurrency(cash, (item) => item.amount));
  const held = outstanding.filter((item) => item.status === "Ready for pickup");

  const stats = [
    {
      label: "Collected",
      dot: "bg-status-good",
      value: collected,
      detail: (
        <span className="text-muted-foreground">
          {atDropOff} at drop-off · {received.length - atDropOff} at pickup
        </span>
      ),
    },
    {
      label: "Due at pickup",
      dot: "bg-status-warn",
      value: owed,
      detail: (
        <span className={outstanding.length ? "text-status-warn" : "text-muted-foreground"}>
          {plural(outstanding.length, "package")}
        </span>
      ),
    },
    {
      label: enforced ? "Held at pickup" : "Unpaid at pickup",
      dot: "bg-status-bad",
      value: [held.length],
      detail: held.length ? (
        <span className="text-status-bad">
          {enforced ? "Can't be released until paid" : "Collect before handing over"}
        </span>
      ) : (
        <span className="text-muted-foreground">No one waiting on payment</span>
      ),
    },
    {
      label: "Cash taken",
      dot: "bg-muted-foreground",
      value: cashTotals,
      detail: (
        <span className="text-muted-foreground">{plural(cash.length, "cash payment")}</span>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map(({ label, dot, value, detail }) => (
        <div
          key={label}
          className="flex flex-col gap-1 rounded-xl border bg-card p-4 text-card-foreground shadow-xs"
        >
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <span className={`size-2 rounded-full ${dot}`} aria-hidden="true" />
            {label}
          </span>
          <span className="grid font-mono text-2xl font-semibold tracking-tight">
            {value.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
          <span className="mt-auto text-sm">{detail}</span>
        </div>
      ))}
    </div>
  );
}

function DateCell({ date, today, pattern = "MMM d, HH:mm" }) {
  return (
    <div className="flex flex-col leading-tight">
      <span>{format(date, pattern)}</span>
      {today && <span className="text-xs text-muted-foreground">{relativeDay(date, today)}</span>}
    </div>
  );
}

function EmptyRow({ colSpan, children }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-32 text-center text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

function BalanceCell({ pkg }) {
  const due = balanceDue(pkg);
  if (due === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-status-good">
        <CircleCheck className="size-3.5" aria-hidden="true" />
        Paid
      </span>
    );
  }
  return (
    <span className="font-mono text-[13px] font-semibold text-status-warn">
      {formatMoney(due, currencyOf(pkg))}
    </span>
  );
}

// How a package has been paid so far: the methods used, or "At pickup" if it's still to come.
function PaymentMethodCell({ pkg, methods }) {
  if (methods.length) return <span>{methods.join(" + ")}</span>;
  if (pkg.paymentMethod === "Pay at pickup") {
    return <span className="text-status-warn">At pickup</span>;
  }
  return <span className="text-muted-foreground">—</span>;
}

// Zero is shown in the package's currency (e.g. "CAD 0.00"), dimmed so payments stand out.
function AmountCell({ amount, currency }) {
  return (
    <span className={amount > 0 ? undefined : "text-muted-foreground"}>
      {formatMoney(amount, currency)}
    </span>
  );
}

function PackagePaymentsTable({ rows, today, empty, methodsOf, paidOf }) {
  const { requirePaymentBeforeDelivery: enforced } = useSettings();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4 text-muted-foreground">Tracking #</TableHead>
          <TableHead className="text-muted-foreground">Payer</TableHead>
          <TableHead className="text-muted-foreground">Route</TableHead>
          <TableHead className="text-muted-foreground">Status</TableHead>
          <TableHead className="text-right text-muted-foreground">Charged</TableHead>
          <TableHead className="text-right text-muted-foreground">At drop-off</TableHead>
          <TableHead className="text-right text-muted-foreground">At pickup</TableHead>
          <TableHead className="text-right text-muted-foreground">Balance due</TableHead>
          <TableHead className="text-muted-foreground">Payment</TableHead>
          <TableHead className="text-muted-foreground">Registered</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((item) => {
          const currency = currencyOf(item);
          const due = balanceDue(item);
          const held = due > 0 && item.status === "Ready for pickup";
          const paid = paidOf(item.tracking);
          return (
            <TableRow key={item.tracking} className="h-14">
              <TableCell className="pl-4 font-mono text-[13px]">{item.tracking}</TableCell>
              <TableCell>{item.sender}</TableCell>
              <TableCell>
                <PackageRoute pkg={item} />
              </TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-0.5">
                  <Badge variant="outline">
                    <span
                      className={`size-1.5 rounded-full ${statusDots[item.status]}`}
                      aria-hidden="true"
                    />
                    {item.status}
                  </Badge>
                  {held && (
                    <span className="text-xs text-status-bad">
                      {enforced ? "Held until paid" : "Balance due at pickup"}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right font-mono text-[13px]">
                {formatMoney(item.charge, currency)}
              </TableCell>
              <TableCell className="text-right font-mono text-[13px]">
                <AmountCell amount={paid["drop-off"]} currency={currency} />
              </TableCell>
              <TableCell className="text-right font-mono text-[13px]">
                <AmountCell amount={paid.pickup} currency={currency} />
              </TableCell>
              <TableCell className="text-right">
                <BalanceCell pkg={item} />
              </TableCell>
              <TableCell>
                <PaymentMethodCell pkg={item} methods={methodsOf(item.tracking)} />
              </TableCell>
              <TableCell>
                <div className="flex flex-col leading-tight">
                  <span>{format(item.events[0].date, "MMM d")}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.cashier ? `by ${item.cashier}` : relativeDay(item.events[0].date, today)}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
        {rows.length === 0 && <EmptyRow colSpan={10}>{empty}</EmptyRow>}
      </TableBody>
    </Table>
  );
}

function LedgerTable({ rows, today }) {
  const totals = totalsByCurrency(rows, (item) => item.amount);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4 text-muted-foreground">Receipt</TableHead>
          <TableHead className="text-muted-foreground">Date</TableHead>
          <TableHead className="text-muted-foreground">Paid at</TableHead>
          <TableHead className="text-muted-foreground">Tracking #</TableHead>
          <TableHead className="text-muted-foreground">Payer</TableHead>
          <TableHead className="text-muted-foreground">Method</TableHead>
          <TableHead className="text-muted-foreground">Cashier</TableHead>
          <TableHead className="pr-4 text-right text-muted-foreground">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((item) => (
          <TableRow key={item.id} className="h-12">
            <TableCell className="pl-4 font-mono text-[13px]">{item.id}</TableCell>
            <TableCell>
              <DateCell date={item.date} today={today} />
            </TableCell>
            <TableCell>
              <Badge variant="outline">
                <span
                  className={`size-1.5 rounded-full ${
                    item.stage === "pickup" ? "bg-status-good" : "bg-brand"
                  }`}
                  aria-hidden="true"
                />
                {STAGE_LABELS[item.stage] ?? "—"}
              </Badge>
            </TableCell>
            <TableCell className="font-mono text-[13px]">{item.tracking}</TableCell>
            <TableCell>{item.payer}</TableCell>
            <TableCell>{item.method}</TableCell>
            <TableCell className="text-muted-foreground">{item.receivedBy}</TableCell>
            <TableCell className="pr-4 text-right font-mono text-[13px] font-medium">
              {formatMoney(item.amount, item.currency)}
            </TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && <EmptyRow colSpan={8}>No payments match your filters.</EmptyRow>}
      </TableBody>
      {totals.length > 0 && (
        <TableFooter>
          <TableRow>
            <TableCell colSpan={7} className="pl-4 text-muted-foreground">
              Total of {plural(rows.length, "payment")} shown
            </TableCell>
            <TableCell className="pr-4 text-right font-mono text-[13px] font-semibold">
              {totals.map(([currency, amount]) => (
                <span key={currency} className="block whitespace-nowrap">
                  {formatMoney(amount, currency)}
                </span>
              ))}
            </TableCell>
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}

export function PaymentsView() {
  const [records, setRecords] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [load, setLoad] = useState({ state: "loading" });
  const [tab, setTab] = useState(EVERYTHING);
  const [search, setSearch] = useState("");
  const [route, setRoute] = useState(ALL);
  const [payment, setPayment] = useState(ALL);
  const [currency, setCurrency] = useState(ALL);
  const [method, setMethod] = useState(ALL);
  const [stage, setStage] = useState(ALL);
  const [branch, setBranch] = useState(ALL);
  const [notice, setNotice] = useState("");
  // null = all time, so no balance is hidden until the owner picks a day or range.
  const [dateRange, setDateRange] = useState(null);
  const today = useToday();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/payments", { cache: "no-store" })
      .then(readResult)
      .then((result) => {
        if (cancelled) return;
        const packages = result.packages.map(fromApiPackage);
        const branchOf = new Map(packages.map((pkg) => [pkg.tracking, pkg.branch]));
        setRecords(packages);
        setLedger(
          result.payments.map((payment) =>
            fromApiPayment({ ...payment, branch: payment.branch ?? branchOf.get(payment.tracking) }),
          ),
        );
        setLoad({ state: "ready" });
      })
      .catch((error) => !cancelled && setLoad({ state: "error", message: error.message }));
    return () => {
      cancelled = true;
    };
  }, []);

  // Label branches by their current name in Routes, so a renamed branch reads the same everywhere.
  const routes = useRoutes();
  const currentBranchNames = new Map(
    routes.flatMap((route) =>
      Object.entries(route.branches).map(([code, info]) => [code, info.name]),
    ),
  );
  const methodsByTracking = new Map();
  ledger.forEach((item) => {
    const methods = methodsByTracking.get(item.tracking) ?? new Set();
    methods.add(item.method);
    methodsByTracking.set(item.tracking, methods);
  });
  const methodsOf = (tracking) => [...(methodsByTracking.get(tracking) ?? [])];
  const paidByTracking = new Map();
  ledger.forEach((item) => {
    const paid = paidByTracking.get(item.tracking) ?? { "drop-off": 0, pickup: 0 };
    paid[item.stage === "pickup" ? "pickup" : "drop-off"] += item.amount;
    paidByTracking.set(item.tracking, paid);
  });
  const paidOf = (tracking) => paidByTracking.get(tracking) ?? { "drop-off": 0, pickup: 0 };

  const branchOptions = [
    { value: ALL, label: "All branches" },
    ...[
      ...new Map(
        [...records, ...ledger]
          .filter((item) => item.branch?.code)
          .map((item) => [item.branch.code, item.branch]),
      ).values(),
    ]
      .map((option) => ({
        value: option.code,
        label: branchLabel({ name: currentBranchNames.get(option.code) ?? option.name }),
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
  const inBranch = (item) => branch === ALL || item.branch?.code === branch;

  const currencyOptions = [
    { value: ALL, label: "All currencies" },
    ...[...new Set([...records.map(currencyOf), ...ledger.map((item) => item.currency)])]
      .sort()
      .map((code) => ({ value: code, label: code })),
  ];

  // Packages are dated by registration; payments by when they were received.
  // Only packages where money has actually been taken, at drop-off or at pickup.
  const packagesInRange = records
    .filter(
      (item) =>
        item.amountPaid > 0 && inBranch(item) && inDateRange(item.events[0].date, dateRange),
    )
    .sort(newestFirst);
  const outstanding = packagesInRange.filter((item) => balanceDue(item) > 0).sort(byUrgency);
  const receivedInRange = ledger.filter(
    (item) => inBranch(item) && inDateRange(item.date, dateRange),
  );

  const term = search.trim().toLowerCase();
  const matches = (fields) => !term || fields.some((text) => text.toLowerCase().includes(term));
  const packageMatches = (item) =>
    (route === ALL || item.route === route) && matches([item.tracking, item.sender]);
  const visibleAll = packagesInRange.filter(
    (item) => packageMatches(item) && (payment === ALL || item.payment === payment),
  );
  const visibleOutstanding = outstanding.filter(packageMatches);
  const visibleLedger = receivedInRange.filter(
    (item) =>
      (currency === ALL || item.currency === currency) &&
      (method === ALL || item.method === method) &&
      (stage === ALL || item.stage === stage) &&
      matches([item.id, item.tracking, item.payer]),
  );

  const tabs = {
    [EVERYTHING]: { label: "All", shown: visibleAll.length, total: packagesInRange.length },
    [OUTSTANDING]: {
      label: "Due",
      shown: visibleOutstanding.length,
      total: outstanding.length,
    },
    [RECEIVED]: { label: "Received", shown: visibleLedger.length, total: receivedInRange.length },
  };
  const filtered =
    term ||
    {
      [EVERYTHING]: route !== ALL || payment !== ALL,
      [OUTSTANDING]: route !== ALL,
      [RECEIVED]: currency !== ALL || method !== ALL || stage !== ALL,
    }[tab];

  function clearFilters() {
    setSearch("");
    setRoute(ALL);
    setPayment(ALL);
    setCurrency(ALL);
    setMethod(ALL);
    setStage(ALL);
  }

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="text-sm text-muted-foreground">Showing</span>
        <DateRangePicker
          value={dateRange}
          onChange={setDateRange}
          today={today}
          placeholder="All time"
        />
        {dateRange && (
          <Button variant="ghost" onClick={() => setDateRange(null)}>
            Show all time
          </Button>
        )}
        <span className="text-sm text-muted-foreground sm:ml-2">at</span>
        <Filter
          label="Filter by branch"
          value={branch}
          onChange={setBranch}
          options={branchOptions}
          className="sm:w-auto sm:min-w-44"
        />
      </div>
      <PaymentStats outstanding={outstanding} received={receivedInRange} />
      <Card className="min-w-0 pb-0">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <ToggleGroup
            type="single"
            value={tab}
            onValueChange={(value) => value && setTab(value)}
            aria-label="Payments view"
            className="rounded-lg bg-muted p-1"
          >
            {Object.entries(tabs).map(([value, { label, total }]) => (
              <ToggleGroupItem
                key={value}
                value={value}
                className="h-7 gap-1.5 rounded-md px-3 text-muted-foreground hover:bg-transparent data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
              >
                {label}
                <span className="font-mono text-xs text-muted-foreground">{total}</span>
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
              aria-label={
                tab === RECEIVED
                  ? "Search by receipt, tracking number or payer"
                  : "Search by tracking number or payer"
              }
              placeholder={
                tab === RECEIVED
                  ? "Search receipt, tracking # or payer..."
                  : "Search tracking # or payer..."
              }
              className="pl-8"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {tab === RECEIVED ? (
            <>
              <Filter
                label="Filter by where it was paid"
                value={stage}
                onChange={setStage}
                options={stageOptions}
                className="sm:w-auto sm:min-w-44"
              />
              <Filter
                label="Filter by method"
                value={method}
                onChange={setMethod}
                options={methodOptions}
              />
              <Filter
                label="Filter by currency"
                value={currency}
                onChange={setCurrency}
                options={currencyOptions}
              />
            </>
          ) : (
            <>
              <Filter
                label="Filter by route"
                value={route}
                onChange={setRoute}
                options={routeOptions}
              />
              {tab === EVERYTHING && (
                <Filter
                  label="Filter by payment"
                  value={payment}
                  onChange={setPayment}
                  options={paymentOptions}
                />
              )}
            </>
          )}
          {filtered && (
            <Button variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          )}
          <p role="status" className="text-sm text-muted-foreground sm:ml-auto">
            <span className="font-mono">{tabs[tab].shown}</span> of{" "}
            <span className="font-mono">{tabs[tab].total}</span>
          </p>
          {tab === RECEIVED && (
            <Button
              variant="outline"
              disabled={visibleLedger.length === 0}
              onClick={() => downloadCsv("payments", LEDGER_COLUMNS, visibleLedger)}
            >
              <Download aria-hidden="true" />
              Export CSV
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-0">
          <p role="status" className={notice ? "px-4 pb-2 text-sm text-status-good" : "sr-only"}>
            {notice}
          </p>
          {load.state === "loading" ? (
            <p className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Loading payments…
            </p>
          ) : load.state === "error" ? (
            <p role="alert" className="flex h-32 items-center justify-center px-4 text-center text-sm text-status-bad">
              Couldn&apos;t load payments: {load.message}
            </p>
          ) : tab === RECEIVED ? (
            <LedgerTable rows={visibleLedger} today={today} />
          ) : (
            <PackagePaymentsTable
              rows={tab === EVERYTHING ? visibleAll : visibleOutstanding}
              today={today}
              methodsOf={methodsOf}
              paidOf={paidOf}
              empty={
                tab === EVERYTHING ? "No packages match your filters." : "Nothing due here."
              }
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
