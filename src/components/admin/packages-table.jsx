"use client";

import { useEffect, useState } from "react";
import { Download, LoaderCircle, Search } from "lucide-react";
import { endOfDay, format, startOfDay, startOfMonth } from "date-fns";
import { BulkStatusBar } from "@/components/admin/bulk-status-bar";
import { downloadPackagesCsv } from "@/components/admin/export-packages";
import { DateRangePicker, useToday } from "@/components/admin/date-range-picker";
import { PackageRowActions } from "@/components/admin/package-row-actions";
import { PaymentCell } from "@/components/admin/payment-cell";
import { blockedByPayment } from "@/components/admin/package-payments";
import { canMoveTo, trackingSteps } from "@/components/admin/package-tracking";
import { PackageStats } from "@/components/admin/package-stats";
import { useSettings } from "@/components/admin/settings-store";
import { statusDots } from "@/components/admin/package-views";
import { ALL, Filter, relativeDay } from "@/components/admin/table-filters";
import { PackageRouteLabel } from "@/components/admin/shipping-routes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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

const statusOptions = [
  { value: ALL, label: "All statuses" },
  ...Object.keys(statusDots).map((status) => ({
    value: status,
    label: status,
  })),
];

export function PackagesTable({ status }) {
  const [records, setRecords] = useState([]);
  const [load, setLoad] = useState({ state: "loading" });
  const [search, setSearch] = useState("");
  const [route, setRoute] = useState(ALL);
  const [payment, setPayment] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkResult, setBulkResult] = useState(null);
  // undefined = default (this month to date), null = all time.
  const [pickedRange, setPickedRange] = useState(undefined);
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
      (!term ||
        [item.tracking, item.sender, item.receiver].some((text) =>
          text.toLowerCase().includes(term),
        )),
  );
  const filtered = term || route !== ALL || payment !== ALL || statusFilter !== ALL;
  // Only rows still on screen count as selected, so hidden rows are never changed.
  const selectedRows = visible.filter((item) => selected.has(item.tracking));
  const allSelected = visible.length > 0 && selectedRows.length === visible.length;
  const headerChecked = allSelected ? true : selectedRows.length ? "indeterminate" : false;

  function toggleRow(tracking, checked) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(tracking);
      else next.delete(tracking);
      return next;
    });
    setBulkResult(null);
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(visible.map((item) => item.tracking)));
    setBulkResult(null);
  }

  async function applyBulk(step) {
    const ahead = selectedRows.filter((item) => canMoveTo(item, step.key));
    const unpaid = ahead.filter((item) =>
      blockedByPayment(item, step.key, settings.requirePaymentBeforeDelivery),
    );
    const targets = ahead.filter((item) => !unpaid.includes(item)).map((item) => item.tracking);
    const passed = selectedRows.length - ahead.length;
    let saved = 0;
    try {
      if (targets.length) saved = (await saveStep(targets, step.key)).moved.length;
    } catch (error) {
      setBulkResult({ text: `Couldn't update: ${error.message}`, warn: true });
      return;
    }
    const parts = [`Moved ${saved} to “${step.label}”`];
    if (passed) parts.push(`${passed} skipped (already at or past that step)`);
    if (unpaid.length) {
      parts.push(
        `${unpaid.length} not delivered: balance due (${unpaid.map((item) => item.tracking).join(", ")})`,
      );
    }
    setBulkResult({ text: parts.join(" · "), warn: unpaid.length > 0 });
    // Keep the unpaid ones selected so staff can deal with them next.
    setSelected(new Set(unpaid.map((item) => item.tracking)));
  }

  function clearFilters() {
    setSearch("");
    setRoute(ALL);
    setPayment(ALL);
    setStatusFilter(ALL);
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
          {selectedRows.length > 0 && (
            <BulkStatusBar
              selected={selectedRows}
              onApply={applyBulk}
              onClear={() => setSelected(new Set())}
            />
          )}
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    aria-label="Select all shown packages"
                    checked={headerChecked}
                    onCheckedChange={toggleAll}
                    disabled={visible.length === 0}
                  />
                </TableHead>
                <TableHead className="text-muted-foreground">Tracking #</TableHead>
                <TableHead className="text-muted-foreground">Sender</TableHead>
                <TableHead className="text-muted-foreground">Receiver</TableHead>
                <TableHead className="text-muted-foreground">Route</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Payment</TableHead>
                <TableHead className="text-right text-muted-foreground">Weight</TableHead>
                <TableHead className="text-muted-foreground">Updated</TableHead>
                <TableHead className="pr-4 text-right text-muted-foreground">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => (
                <TableRow
                  key={item.tracking}
                  className="h-12"
                  data-state={selected.has(item.tracking) ? "selected" : undefined}
                >
                  <TableCell className="pl-4">
                    <Checkbox
                      aria-label={`Select ${item.tracking}`}
                      checked={selected.has(item.tracking)}
                      onCheckedChange={(checked) => toggleRow(item.tracking, checked === true)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-[13px]">{item.tracking}</TableCell>
                  <TableCell>{item.sender}</TableCell>
                  <TableCell>{item.receiver}</TableCell>
                  <TableCell>
                    <PackageRouteLabel pkg={item} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      <span
                        className={`size-1.5 rounded-full ${statusDots[item.status]}`}
                        aria-hidden="true"
                      />
                      {item.status}
                    </Badge>
                    {/* "In transit" covers several steps, so say which one the package is at. */}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {trackingSteps(item.route).find((step) => step.key === item.events.at(-1).step)?.label}
                    </p>
                  </TableCell>
                  <TableCell>
                    <PaymentCell pkg={item} />
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
                      onAdvance={async (step) => {
                        try {
                          await saveStep([item.tracking], step);
                          setBulkResult(null);
                        } catch (error) {
                          setBulkResult({ text: `Couldn't update ${item.tracking}: ${error.message}`, warn: true });
                        }
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
