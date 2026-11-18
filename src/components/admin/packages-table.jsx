"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, LoaderCircle, Search, StickyNote } from "lucide-react";
import { endOfDay, format, startOfDay, startOfMonth } from "date-fns";
import { HANDLING } from "@/lib/handling";
import { downloadPackagesCsv } from "@/components/admin/export-packages";
import { DateRangePicker, useToday } from "@/components/admin/date-range-picker";
import { PackageRowActions } from "@/components/admin/package-row-actions";
import { useProfile } from "@/components/admin/profile-store";
import { can } from "@/lib/permissions";
import { PaymentCell } from "@/components/admin/payment-cell";
import { PackageStats } from "@/components/admin/package-stats";
import { useSettings } from "@/components/admin/settings-store";
import { statusDots } from "@/components/admin/package-views";
import { currentStepLabel } from "@/components/admin/package-tracking";
import { EXCEPTION_TYPES } from "@/lib/bags";
import { ALL, Filter, relativeDay } from "@/components/admin/table-filters";
import { PackageRouteFlags, PackageRouteLabel } from "@/components/admin/shipping-routes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// The API sends dates as text; the table works with Date objects.
function fromApi(pkg) {
  return {
    ...pkg,
    date: new Date(pkg.date),
    events: pkg.events.map((event) => ({ ...event, date: new Date(event.date) })),
  };
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

const paymentOptions = [
  { value: ALL, label: "All payments" },
  { value: "Paid", label: "Paid" },
  { value: "Pending", label: "Pending" },
];

// Flagged and not yet delivered, matching the dashboard's issue alerts.
const handlingOptions = [
  { value: ALL, label: "All handling" },
  ...HANDLING.map(({ key, label }) => ({ value: key, label })),
];

function NotesCell({ pkg }) {
  const flags = HANDLING.filter((item) => pkg.handling?.flags?.includes(item.key));
  if (!flags.length && !pkg.notes) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {flags.map((item) => (
        <Badge
          key={item.key}
          variant="outline"
          className={item.severity === "critical" ? "border-status-bad/40 text-status-bad" : undefined}
        >
          {item.key === "rush" && pkg.handling.rushBy ? `Rush · ${pkg.handling.rushBy}` : item.label}
        </Badge>
      ))}
      {pkg.notes && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`Notes for ${pkg.tracking}: ${pkg.notes}`}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <StickyNote className="size-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="block max-w-xs text-left leading-snug">
            <span className="line-clamp-8 break-words whitespace-pre-wrap">{pkg.notes}</span>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

const statusOptions = [
  { value: ALL, label: "All statuses" },
  ...Object.keys(statusDots).map((status) => ({
    value: status,
    label: status,
  })),
];

export function PackagesTable({ status, initialHandling, initialSearch = "" }) {
  const profile = useProfile();
  const canUpdate = can(profile, "packages.status");
  const canCollect = can(profile, "payments.record");
  const [records, setRecords] = useState([]);
  const [load, setLoad] = useState({ state: "loading" });
  const [search, setSearch] = useState(initialSearch);
  const [route, setRoute] = useState(ALL);
  const [payment, setPayment] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [handling, setHandling] = useState(initialHandling ?? ALL);
  const [bulkResult, setBulkResult] = useState(null);
  // undefined = default (this month to date), null = all time.
  // Coming from an alert or a tracking link, show every date so nothing is hidden.
  const [pickedRange, setPickedRange] = useState(initialHandling || initialSearch ? null : undefined);
  const today = useToday();
  const settings = useSettings();
  const dateRange =
    pickedRange !== undefined ? pickedRange : today && { from: startOfMonth(today), to: today };

  // Loads on open, then quietly refreshes so changes made elsewhere (e.g. staff replying in
  // Telegram) show up without a reload.
  useEffect(() => {
    let cancelled = false;
    function load(first) {
      fetch("/api/packages", { cache: "no-store" })
        .then(readResult)
        .then((result) => {
          if (cancelled) return;
          setRecords(result.packages.map(fromApi));
          setLoad({ state: "ready" });
        })
        .catch((error) => first && !cancelled && setLoad({ state: "error", message: error.message }));
    }
    load(true);
    const timer = setInterval(() => document.visibilityState === "visible" && load(false), 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Routes in the filter are the ones packages are actually on, including routes added later.
  const routeOptions = [
    { value: ALL, label: "All routes" },
    ...[...new Map(records.map((item) => [item.route, item])).values()].map((item) => ({
      value: item.route,
      label: <PackageRouteLabel pkg={item} />,
    })),
  ];

  // Saves a step for some packages and puts the server's copies back in the table.
  async function saveStep(trackings, stepKey) {
    const result = await readResult(
      await fetch("/api/packages/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackings, step: stepKey }),
      }),
    );
    const moved = new Map(result.moved.map((pkg) => [pkg.tracking, fromApi(pkg)]));
    setRecords((current) => current.map((item) => moved.get(item.tracking) ?? item));
    return result;
  }

  const inRange = dateRange?.from
    ? records.filter(
        (item) =>
          item.date >= startOfDay(dateRange.from) &&
          item.date <= endOfDay(dateRange.to ?? dateRange.from),
      )
    : records;
  const available = status ? inRange.filter((item) => item.status === status) : inRange;
  const term = search.trim().toLowerCase();
  const visible = available.filter(
    (item) =>
      (route === ALL || item.route === route) &&
      (payment === ALL || item.payment === payment) &&
      (statusFilter === ALL || item.status === statusFilter) &&
      (handling === ALL || (item.events.at(-1).step !== "delivered" && item.handling?.flags?.includes(handling))) &&
      (!term ||
        [item.tracking, item.sender, item.receiver].some((text) =>
          text.toLowerCase().includes(term),
        )),
  );
  const filtered = term || route !== ALL || payment !== ALL || statusFilter !== ALL || handling !== ALL;
  function clearFilters() {
    setSearch("");
    setRoute(ALL);
    setPayment(ALL);
    setStatusFilter(ALL);
    setHandling(ALL);
  }

  function selectStat(key, value) {
    const setters = { status: setStatusFilter, payment: setPayment };
    setters[key](value ?? ALL);
  }

  return (
    <>
      {!status && (
        <PackageStats
          items={inRange}
          today={today}
          pickupDays={settings.pickupReminderDays}
          filters={{ status: statusFilter, payment }}
          onSelect={selectStat}
        />
      )}
      <Card className="min-w-0 pb-0">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:w-auto sm:min-w-48 sm:max-w-xs sm:flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search by tracking number or name"
              placeholder="Search tracking # or name..."
              className="pl-8"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {!status && (
            <Filter
              label="Filter by status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
            />
          )}
          <DateRangePicker value={dateRange} onChange={setPickedRange} today={today} />
          <Filter
            label="Filter by route"
            value={route}
            onChange={setRoute}
            options={routeOptions}
          />
          <Filter
            label="Filter by special handling"
            value={handling}
            onChange={setHandling}
            options={handlingOptions}
          />
          <Filter
            label="Filter by payment"
            value={payment}
            onChange={setPayment}
            options={paymentOptions}
          />
          {filtered && (
            <Button variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          )}
          <p role="status" className="text-sm text-muted-foreground sm:ml-auto">
            <span className="font-mono">{visible.length}</span> of{" "}
            <span className="font-mono">{available.length}</span>
          </p>
          <Button
            variant="outline"
            disabled={visible.length === 0}
            onClick={() => downloadPackagesCsv(visible)}
          >
            <Download aria-hidden="true" />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="px-0">
          <p
            role="status"
            className={
              bulkResult
                ? `px-4 pb-2 text-sm ${bulkResult.warn ? "text-status-warn" : "text-status-good"}`
                : "sr-only"
            }
          >
            {bulkResult?.text}
          </p>
          {/* Tighter cells and wrapping notes so the rows fit without scrolling sideways. */}
          <Table className="[&_td:not(:first-child):not(:last-child)]:px-2 [&_th:not(:first-child):not(:last-child)]:px-2">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 text-muted-foreground">Tracking #</TableHead>
                <TableHead className="text-muted-foreground">Sender</TableHead>
                <TableHead className="text-muted-foreground">Receiver</TableHead>
                <TableHead className="text-muted-foreground">Route</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Payment</TableHead>
                <TableHead className="text-muted-foreground">Notes</TableHead>
                <TableHead className="text-right text-muted-foreground">Weight</TableHead>
                <TableHead className="text-muted-foreground">Updated</TableHead>
                <TableHead className="pr-4 text-right text-muted-foreground">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => (
                <TableRow key={item.tracking} className="h-12">
                  <TableCell className="pl-4 font-mono text-[13px]">{item.tracking}</TableCell>
                  <TableCell className="max-w-32 truncate" title={item.sender}>{item.sender}</TableCell>
                  <TableCell className="max-w-32 truncate" title={item.receiver}>{item.receiver}</TableCell>
                  <TableCell>
                    <PackageRouteFlags pkg={item} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      <span
                        className={`size-1.5 rounded-full ${statusDots[item.status]}`}
                        aria-hidden="true"
                      />
                      {currentStepLabel(item)}
                    </Badge>
                    {(item.bag?.code || item.exception) && (
                      <div className="mt-0.5 flex flex-wrap gap-1 text-xs">
                        {item.bag?.code && (
                          <Link href={`/admin/bags/${item.bag.code}`} className="font-mono text-muted-foreground hover:text-foreground hover:underline">
                            {item.bag.code}
                          </Link>
                        )}
                        {item.exception && (
                          <span className="text-status-bad">{EXCEPTION_TYPES[item.exception.type]}</span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <PaymentCell pkg={item} />
                  </TableCell>
                  <TableCell className="max-w-44 whitespace-normal">
                    <NotesCell pkg={item} />
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {item.weight.toFixed(1)} kg
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col leading-tight">
                      <span>{format(item.date, "MMM d, HH:mm")}</span>
                      {today && (
                        <span className="text-xs text-muted-foreground">
                          {relativeDay(item.date, today)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="pr-4">
                    <PackageRowActions
                      pkg={item}
                      canUpdate={canUpdate}
                      canCollect={canCollect}
                      onCollect={async ({ amount, method, branch }) => {
                        // Pickup payment first, then release the package.
                        const paid = await readResult(
                          await fetch("/api/payments", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ tracking: item.tracking, amount, method, branch }),
                          }),
                        );
                        setRecords((current) =>
                          current.map((row) =>
                            row.tracking === item.tracking ? fromApi(paid.package) : row,
                          ),
                        );
                        await saveStep([item.tracking], "delivered");
                        setBulkResult({
                          text: `Collected ${paid.payment.currency} ${amount.toFixed(2)} (${method}) and marked ${item.tracking} delivered · ${paid.payment.id}`,
                          warn: false,
                        });
                      }}
                      onHandOver={async () => {
                        // Errors are shown in the popover, next to the button.
                        const result = await saveStep([item.tracking], "delivered");
                        if (!result.moved.length) throw new Error("It isn't ready for pickup any more. Reload the list.");
                        setBulkResult({ text: `${item.tracking} handed over and marked delivered.`, warn: false });
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {visible.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className={`h-32 text-center ${load.state === "error" ? "text-status-bad" : "text-muted-foreground"}`}
                  >
                    {load.state === "loading" ? (
                      <span className="inline-flex items-center gap-2">
                        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                        Loading packages…
                      </span>
                    ) : load.state === "error" ? (
                      `Couldn't load packages: ${load.message}`
                    ) : records.length === 0 ? (
                      "No packages registered yet."
                    ) : (
                      "No packages match your search."
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
