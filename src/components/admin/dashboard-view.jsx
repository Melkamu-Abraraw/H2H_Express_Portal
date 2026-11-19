"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { addDays, differenceInCalendarDays, format, startOfDay, subDays } from "date-fns";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ChevronRight,
  CircleCheck,
  Package,
  PackageCheck,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { HANDLING } from "@/lib/handling";
import { statusFromEvents } from "@/components/admin/package-tracking";
import { RecentPackages } from "@/components/admin/recent-packages";
import { useProfile } from "@/components/admin/profile-store";
import { can } from "@/lib/permissions";
import { useToday } from "@/components/admin/date-range-picker";
import { balanceDue, totalsByCurrency } from "@/components/admin/package-payments";
import { formatMoney } from "@/components/admin/pricing-store";
import { useSettings } from "@/components/admin/settings-store";
import { packageCountries } from "@/components/admin/shipping-routes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const RANGES = [
  { days: 7, bucket: 1 },
  { days: 30, bucket: 3 },
  { days: 90, bucket: 9 },
];

// Route pairs take the existing series colours in order; the first two match the old chart.
const SERIES_COLORS = [
  "var(--chart-brand)",
  "var(--chart-ink)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-5)",
];

const STALE_TRANSIT_DAYS = 7;

const statusBars = [
  { status: "Received", label: "Received", color: "[&>*]:bg-status-received" },
  { status: "In transit", label: "In transit", color: "[&>*]:bg-status-transit" },
  { status: "Ready for pickup", label: "Ready for pickup", color: "[&>*]:bg-status-pickup" },
  { status: "Delivered", label: "Delivered", color: "[&>*]:bg-status-good" },
];

const severityStyles = {
  critical: "bg-status-bad/10 text-status-bad",
  warning: "bg-brand/20 text-foreground",
};

const number = new Intl.NumberFormat("en-US");

function subscribeToNothing() {
  return () => {};
}

function readToday() {
  return format(new Date(), "EEEE, d MMM");
}

// Empty on the server: the page is prerendered, so only the browser knows today's date.
function TodayDate() {
  const today = useSyncExternalStore(subscribeToNothing, readToday, () => "");
  return (
    <p className="min-h-4 text-xs text-muted-foreground">
      {today && `${today} · `}Today&apos;s overview
    </p>
  );
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!result.success) throw new Error(result.error || `Server returned HTTP ${response.status}`);
  return result;
}

function fromApiPackage(pkg) {
  return {
    ...pkg,
    date: new Date(pkg.date),
    events: pkg.events.map((event) => ({ ...event, date: new Date(event.date) })),
  };
}

const registeredOn = (pkg) => pkg.events[0].date;
const lastUpdate = (pkg) => pkg.events.at(-1).date;
const deliveredOn = (pkg) => pkg.events.find((event) => event.step === "delivered")?.date;

function within(date, from, to) {
  return Boolean(date) && date >= from && date < to;
}

// "Canada ↔ Ethiopia": both directions of a route count as one series.
function routePair(pkg) {
  const { from, to } = packageCountries(pkg);
  return [from.name, to.name].sort().join(" ↔ ");
}

// Change against the previous period. A percentage needs something to compare with, so when the
// previous period was empty it says "New this period" (or a dash if both are empty) instead of
// an always-100% figure. `direction` is 1 (up), -1 (down) or 0 (no change).
function change(current, before) {
  if (before <= 0) {
    return current > 0 ? { text: "New this period", direction: 1 } : { text: "—", direction: 0 };
  }
  const direction = Math.sign(current - before);
  return { text: `${Math.abs(Math.round(((current - before) / before) * 100))}%`, direction };
}

// Green arrow up for an increase, red arrow down for a drop, no arrow when nothing changed.
function Trend({ value }) {
  const Arrow = value.direction > 0 ? ArrowUp : value.direction < 0 ? ArrowDown : null;
  const tone =
    value.direction > 0
      ? "text-status-good"
      : value.direction < 0
        ? "text-status-bad"
        : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-0.5 align-top leading-5 tabular-nums ${tone}`}>
      {Arrow && <Arrow className="size-3.5" strokeWidth={2.5} aria-hidden="true" />}
      <span className="sr-only">
        {value.direction > 0 ? "up" : value.direction < 0 ? "down" : "no change"}
      </span>
      {value.text}
    </span>
  );
}

// `caption` says which period the number covers, since only some cards follow the date filter.
function KpiCard({ title, caption, value, detail, icon: Icon }) {
  return (
    <Card size="sm" className="gap-1">
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="grid gap-0.5">
          <CardDescription>{title}</CardDescription>
          {caption && <span className="text-xs text-muted-foreground/80">{caption}</span>}
        </div>
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <p className="font-mono text-2xl font-semibold tracking-tight">{value}</p>
        <p className="flex min-h-5 items-center gap-1 text-sm leading-5 text-muted-foreground">
          <span>{detail}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function LegendItem({ color, label, value }) {
  const [left, right] = label.split(" ↔ ");
  return (
    <div className="grid gap-1">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px]" style={{ background: color }} aria-hidden="true" />
        {left}
        {right && (
          <>
            <ArrowLeftRight className="size-3" aria-label="to and from" />
            {right}
          </>
        )}
      </span>
      <span className="text-center font-mono text-xl font-bold text-foreground">
        {number.format(value)}
      </span>
    </div>
  );
}

function VolumeCard({ buckets, series, range, tickInterval }) {
  const config = Object.fromEntries(
    series.map(({ key, label, color }) => [key, { label, color }]),
  );
  return (
    <Card className="min-w-0 lg:col-span-5">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle>Package volume</CardTitle>
          <CardDescription>Last {range} days</CardDescription>
        </div>
        {/* Legend height is reserved while loading so the chart doesn't shift when it appears. */}
        <div className="flex min-h-12 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {series.map(({ key, label, color }) => (
            <LegendItem
              key={key}
              color={color}
              label={label}
              value={buckets.reduce((sum, bucket) => sum + bucket[key], 0)}
            />
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {series.length === 0 ? (
          <p className="grid h-60 place-items-center text-sm text-muted-foreground">
            No packages in the last {range} days
          </p>
        ) : (
          <ChartContainer
            config={config}
            className="aspect-auto h-60 w-full [&_.recharts-cartesian-axis-tick_text]:font-mono"
          >
            <BarChart
              accessibilityLayer
              data={buckets}
              barGap={3}
              barCategoryGap="16%"
              margin={{ left: 0, right: 0, top: 8 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={tickInterval}
              />
              <YAxis width={36} tickLine={false} axisLine={false} allowDecimals={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              {series.map(({ key }) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={`var(--color-${key})`}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function StatusCard({ packages }) {
  const owing = packages.filter((pkg) => balanceDue(pkg) > 0);
  // Routes charge in different currencies, so the amount is listed per currency.
  const owed = totalsByCurrency(owing, balanceDue).map(([code, amount]) => formatMoney(amount, code));
  return (
    <Card className="min-w-0 lg:col-span-3">
      <CardHeader>
        <CardTitle>Package status</CardTitle>
        <CardDescription>Now</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <p className="mt-2">
          <span className="font-mono text-4xl font-semibold tracking-tight">
            {number.format(packages.length)}
          </span>{" "}
          <span className="text-muted-foreground">packages</span>
        </p>
        {statusBars.map(({ status, label, color }) => {
          const count = packages.filter((pkg) => pkg.status === status).length;
          const percent = packages.length ? Math.round((count / packages.length) * 100) : 0;
          return (
            <div key={status} className="grid gap-2">
              <div className="flex justify-between gap-2 text-sm">
                <span>{label}</span>
                <span className="font-mono text-muted-foreground">
                  {number.format(count)} · {percent}%
                </span>
              </div>
              <Progress value={percent} className={`h-2 ${color}`} aria-label={label} />
            </div>
          );
        })}
        <Separator className="mt-auto" />
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Balance due</span>
          <span className="text-right">
            <span className="font-mono font-semibold">{owed.length ? owed.join(" + ") : "None"}</span>
            {owing.length > 0 && (
              <span className="text-muted-foreground">
                {" "}
                owed · {number.format(owing.length)} {owing.length === 1 ? "package" : "packages"}
              </span>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// Packages found missing or damaged when their bag was opened, grouped by problem (across all
// bags), until a manager resolves them on the Package issues page. Checked before delivered
// packages are dropped: a damaged package can be handed over while its case is still open.
function bagIssueAlerts(packages) {
  const of = (type) => packages.filter((pkg) => pkg.exception?.type === type);
  const bags = (list) => new Set(list.map((pkg) => pkg.exception.bag)).size;
  const missing = of("missing");
  const damaged = of("damaged");
  return [
    {
      id: "bag-missing",
      severity: "critical",
      count: missing.length,
      trackings: missing.map((pkg) => pkg.tracking),
      title: "Missing",
      detail: `From ${bags(missing)} ${bags(missing) === 1 ? "bag" : "bags"} · Resolve in Package issues`,
      href: "/admin/bags/reports",
    },
    {
      id: "bag-damaged",
      severity: "warning",
      count: damaged.length,
      trackings: damaged.map((pkg) => pkg.tracking),
      title: "Damaged",
      detail: `From ${bags(damaged)} ${bags(damaged) === 1 ? "bag" : "bags"} · Resolve in Package issues`,
      href: "/admin/bags/reports",
    },
  ];
}

function buildAlerts(packages, today, pickupDays, { bagIssues = false } = {}) {
  const age = (date) => differenceInCalendarDays(today, date);
  const fromBags = bagIssues ? bagIssueAlerts(packages) : [];
  // Delivered packages never raise alerts; the last tracking step is the source of truth.
  // Lost packages are closed too, so they raise nothing either.
  packages = packages.filter((pkg) => !["delivered", "lost", "damaged"].includes(pkg.events.at(-1).step));
  const pickup = packages.filter((pkg) => pkg.status === "Ready for pickup");
  const waiting = pickup.filter((pkg) => age(lastUpdate(pkg)) > pickupDays);
  const owing = pickup.filter((pkg) => balanceDue(pkg) > 0);
  const stale = packages.filter(
    (pkg) => pkg.status === "In transit" && age(lastUpdate(pkg)) > STALE_TRANSIT_DAYS,
  );
  // Packages flagged at registration (urgent, fragile, rush, special care) until delivered.
  const flagged = HANDLING.map((item) => {
    const matching = packages.filter(
      (pkg) => pkg.handling?.flags?.includes(item.key),
    );
    // A rush package shows its earliest "must arrive before" date, and turns critical once it's passed.
    const deadlines = item.key === "rush" ? matching.map((pkg) => pkg.handling.rushBy).filter(Boolean).sort() : [];
    const overdue = deadlines.length > 0 && deadlines[0] < format(today, "yyyy-MM-dd");
    return {
      id: `handling-${item.key}`,
      severity: overdue ? "critical" : item.severity,
      count: matching.length,
      trackings: matching.map((pkg) => pkg.tracking),
      title: item.label,
      detail: deadlines.length
        ? `${overdue ? "Past deadline" : "Arrive before"} ${format(new Date(`${deadlines[0]}T00:00`), "MMM d")}`
        : "Needs attention before it ships",
      href: `/admin/packages?handling=${item.key}`,
    };
  });
  return [
    ...fromBags,
    ...flagged,
    {
      id: "owing",
      severity: "critical",
      count: owing.length,
      trackings: owing.map((pkg) => pkg.tracking),
      title: "Unpaid at pickup",
      detail: "Collect before release",
      href: "/admin/packages/pickup",
    },
    {
      id: "waiting",
      severity: "warning",
      count: waiting.length,
      trackings: waiting.map((pkg) => pkg.tracking),
      title: "Waiting for pickup",
      detail: `Ready over ${pickupDays} ${pickupDays === 1 ? "day" : "days"}`,
      href: "/admin/packages/pickup",
    },
    {
      id: "stale",
      severity: "warning",
      count: stale.length,
      trackings: stale.map((pkg) => pkg.tracking),
      title: "No update",
      detail: `${STALE_TRANSIT_DAYS}+ days in transit`,
      href: `/admin/packages?status=${encodeURIComponent("In transit")}`,
    },
  ].filter((alert) => alert.count > 0);
}

function IssueAlerts({ alerts, loading }) {
  // One package can raise several alerts, so packages are counted once.
  const packageCount = new Set(alerts.flatMap((alert) => alert.trackings)).size;

  return (
    <Card size="sm" className="min-w-0 gap-2 py-2.5">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="inline-flex items-center gap-2 text-sm">
          Issue Alerts
          {alerts.length > 0 && (
            <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] leading-none font-semibold text-brand-dark tabular-nums dark:text-brand">
              {alerts.length} {alerts.length === 1 ? "alert" : "alerts"} · {packageCount}{" "}
              {packageCount === 1 ? "package" : "packages"}
            </span>
          )}
        </CardTitle>
        <Button variant="outline" size="xs" asChild>
          <Link href="/admin/packages">View All</Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {/* Same height as one alert row, so the cards below don't jump when data arrives. */}
        {loading ? (
          <div className="h-10 animate-pulse rounded-lg border bg-muted/40" aria-hidden="true" />
        ) : (
          alerts.length === 0 && (
            <p className="flex h-10 items-center gap-2 text-sm text-muted-foreground">
              <CircleCheck className="size-4 text-status-good" aria-hidden="true" />
              No issues
            </p>
          )
        )}
        {alerts.map((alert) => (
          <Link
            key={alert.id}
            href={alert.href}
            title={`${alert.count} ${alert.count === 1 ? "Package" : "Packages"} – ${alert.title}: ${alert.detail}`}
            className="group flex h-10 min-w-56 flex-1 basis-56 items-center gap-2 rounded-lg border px-2 transition-colors hover:border-foreground/30 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-md ${severityStyles[alert.severity]}`}
            >
              <TriangleAlert className="size-3.5" aria-hidden="true" />
            </span>
            <span className="grid min-w-0 flex-1">
              <span className="truncate text-sm leading-4 font-medium">
                <span className="font-mono">{alert.count}</span>{" "}
                {alert.count === 1 ? "Package" : "Packages"} – {alert.title}
              </span>
              <span className="truncate text-xs leading-4 text-muted-foreground">
                {alert.detail}
              </span>
            </span>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
              aria-hidden="true"
            />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

// How many packages had this status at a past moment, from their tracking history.
function countAt(packages, status, moment) {
  return packages.filter((pkg) => {
    const events = pkg.events.filter((event) => event.date <= moment);
    return events.length > 0 && statusFromEvents(events) === status;
  }).length;
}

function buildDashboard(packages, today, range) {
  const { bucket } = RANGES.find((option) => option.days === range);
  const end = addDays(startOfDay(today), 1);
  const start = subDays(end, range);
  const previousStart = subDays(start, range);

  const registered = packages.filter((pkg) => within(registeredOn(pkg), start, end));
  const registeredBefore = packages.filter((pkg) =>
    within(registeredOn(pkg), previousStart, start),
  ).length;
  const delivered = packages.filter((pkg) => within(deliveredOn(pkg), start, end)).length;
  const deliveredBefore = packages.filter((pkg) =>
    within(deliveredOn(pkg), previousStart, start),
  ).length;
  const received = packages.filter((pkg) => pkg.status === "Received").length;
  const inTransit = packages.filter((pkg) => pkg.status === "In transit").length;
  const readyForPickup = packages.filter((pkg) => pkg.status === "Ready for pickup").length;

  // Every card has the same shape: a number and its change against the period (or, for live
  // counts, against the same moment one period ago).
  const ago = `Now · vs ${range} days ago`;
  const kpis = [
    {
      title: "Packages registered",
      caption: `Last ${range} days`,
      icon: Package,
      value: number.format(registered.length),
      detail: <Trend value={change(registered.length, registeredBefore)} />,
    },
    {
      title: "Received",
      caption: ago,
      icon: Package,
      value: number.format(received),
      detail: <Trend value={change(received, countAt(packages, "Received", start))} />,
    },
    {
      title: "In transit",
      caption: ago,
      icon: Truck,
      value: number.format(inTransit),
      detail: <Trend value={change(inTransit, countAt(packages, "In transit", start))} />,
    },
    {
      title: "Ready for pickup",
      caption: ago,
      icon: PackageCheck,
      value: number.format(readyForPickup),
      detail: <Trend value={change(readyForPickup, countAt(packages, "Ready for pickup", start))} />,
    },
    {
      title: "Delivered",
      caption: `Last ${range} days`,
      icon: CircleCheck,
      value: number.format(delivered),
      detail: <Trend value={change(delivered, deliveredBefore)} />,
    },
  ];

  // One series per route pair with packages in this period, busiest first.
  const pairCounts = new Map();
  registered.forEach((pkg) => pairCounts.set(routePair(pkg), (pairCounts.get(routePair(pkg)) ?? 0) + 1));
  const series = [...pairCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label], index) => ({
      key: `route${index}`,
      label,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
    }));
  const keyOf = new Map(series.map(({ key, label }) => [label, key]));

  const buckets = [];
  for (let offset = 0; offset < range; offset += bucket) {
    const from = addDays(start, offset);
    const to = addDays(from, bucket);
    const row = { label: format(from, "MMM d") };
    series.forEach(({ key }) => {
      row[key] = 0;
    });
    registered
      .filter((pkg) => within(registeredOn(pkg), from, to))
      .forEach((pkg) => {
        row[keyOf.get(routePair(pkg))] += 1;
      });
    buckets.push(row);
  }

  return { kpis, series, buckets, tickInterval: bucket === 1 ? 0 : 1 };
}

export function DashboardView() {
  const profile = useProfile();
  const [range, setRange] = useState(30);
  const [data, setData] = useState({ state: "loading", packages: [] });
  const today = useToday();
  const { pickupReminderDays } = useSettings();

  // Loads on open, then quietly refreshes so changes made elsewhere (e.g. staff replying in
  // Telegram) show up without a reload.
  useEffect(() => {
    let cancelled = false;
    function load(first) {
      fetchJson("/api/packages")
        .then((packageResult) => {
          if (cancelled) return;
          setData({
            state: "ready",
            packages: packageResult.packages.map(fromApiPackage),
          });
        })
        .catch(
          (error) =>
            first &&
            !cancelled &&
            setData({ state: "error", message: error.message, packages: [] }),
        );
    }
    load(true);
    const timer = setInterval(() => document.visibilityState === "visible" && load(false), 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const ready = data.state === "ready" && today;
  const dashboard = ready ? buildDashboard(data.packages, today, range) : null;
  // Owners and managers resolve bag exceptions, so they see them here.
  const alerts = ready
    ? buildAlerts(data.packages, today, pickupReminderDays, { bagIssues: can(profile, "bags.resolve") })
    : [];

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 pt-3 pb-4 md:px-6 md:pt-4 md:pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Welcome back, <span className="text-brand">{profile.name}</span>
          </h1>
          <TodayDate />
        </div>
        <ToggleGroup
          type="single"
          value={String(range)}
          onValueChange={(value) => value && setRange(Number(value))}
          aria-label="Date range"
          className="rounded-sm bg-muted p-1"
        >
          {RANGES.map(({ days }) => (
            <ToggleGroupItem
              key={days}
              value={String(days)}
              className="h-7 rounded-md px-3 text-muted-foreground hover:bg-transparent data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              {days} days
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {data.state === "error" && (
        <p role="alert" className="rounded-lg border border-status-bad/40 p-3 text-sm text-status-bad">
          Couldn&apos;t load: {data.message}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Key metrics">
        {dashboard
          ? dashboard.kpis.map((kpi) => <KpiCard key={kpi.title} {...kpi} />)
          : ["Packages registered", "In transit", "Ready for pickup", "Delivered"].map((title) => (
              <KpiCard key={title} title={title} value="—" detail="Loading…" icon={Package} />
            ))}
      </section>

      <IssueAlerts alerts={alerts} loading={!ready && data.state !== "error"} />

      <section className="grid gap-4 lg:grid-cols-8" aria-label="Charts">
        <VolumeCard
          buckets={dashboard?.buckets ?? []}
          series={dashboard?.series ?? []}
          range={range}
          tickInterval={dashboard?.tickInterval ?? 0}
        />
        <StatusCard packages={data.packages} />
      </section>

      <RecentPackages packages={data.packages} today={today} loading={!ready && data.state !== "error"} />
    </main>
  );
}
