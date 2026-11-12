"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { addDays, differenceInCalendarDays, format, startOfDay, subDays } from "date-fns";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  CircleCheck,
  Package,
  TriangleAlert,
  Truck,
  Users,
} from "lucide-react";
import { CURRENT_USER } from "@/components/admin/current-user";
import { useToday } from "@/components/admin/date-range-picker";
import { balanceDue } from "@/components/admin/package-payments";
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
  { status: "In transit", label: "In transit", color: "[&>*]:bg-brand" },
  { status: "Ready for pickup", label: "Ready for pickup", color: "[&>*]:bg-foreground" },
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

// Change against the previous period: a percentage, or the plain count when that period was
// empty. `direction` is 1 (up), -1 (down) or 0 (no change).
function change(current, before) {
  const direction = Math.sign(current - before);
  if (before > 0) {
    return { text: `${Math.abs(Math.round(((current - before) / before) * 100))}%`, direction };
  }
  return { text: String(Math.abs(current - before)), direction };
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
    <span className={`inline-flex items-center gap-0.5 align-top font-mono leading-5 ${tone}`}>
      {Arrow && <Arrow className="size-3.5" strokeWidth={2.5} aria-hidden="true" />}
      <span className="sr-only">
        {value.direction > 0 ? "up" : value.direction < 0 ? "down" : "no change"}
      </span>
      {value.text}
    </span>
  );
}

function ChangeText({ value, period }) {
  return (
    <>
      <Trend value={value} /> vs last {period} days
    </>
  );
}

function KpiCard({ title, value, detail, icon: Icon }) {
  return (
    <Card size="sm" className="gap-1">
      <CardHeader className="flex flex-row items-start justify-between">
        <CardDescription>{title}</CardDescription>
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
  const unpaid = packages.filter((pkg) => balanceDue(pkg) > 0).length;
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
          <span className="font-mono font-semibold">{number.format(unpaid)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function buildAlerts(packages, today, pickupDays) {
  const age = (date) => differenceInCalendarDays(today, date);
  const pickup = packages.filter((pkg) => pkg.status === "Ready for pickup");
  const waiting = pickup.filter((pkg) => age(lastUpdate(pkg)) > pickupDays);
  const owing = pickup.filter((pkg) => balanceDue(pkg) > 0);
  const stale = packages.filter(
    (pkg) => pkg.status === "In transit" && age(lastUpdate(pkg)) > STALE_TRANSIT_DAYS,
  );
  return [
    {
      id: "owing",
      severity: "critical",
      count: owing.length,
      title: "Unpaid at pickup",
      detail: "Collect before release",
      href: "/admin/packages/pickup",
    },
    {
      id: "waiting",
      severity: "warning",
      count: waiting.length,
      title: "Waiting for pickup",
      detail: `Ready over ${pickupDays} ${pickupDays === 1 ? "day" : "days"}`,
      href: "/admin/packages/pickup",
    },
    {
      id: "stale",
      severity: "warning",
      count: stale.length,
      title: "No update",
      detail: `${STALE_TRANSIT_DAYS}+ days in transit`,
      href: "/admin/packages/in-transit",
    },
  ].filter((alert) => alert.count > 0);
}

function IssueAlerts({ alerts, loading }) {
  const count = alerts.reduce((sum, alert) => sum + alert.count, 0);

  return (
    <Card size="sm" className="min-w-0 gap-2 py-2.5">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="inline-flex items-center gap-2 text-sm">
          Issue Alerts
          <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 font-mono text-[11px] leading-none font-bold text-brand-dark dark:text-brand">
            {count}
          </span>
        </CardTitle>
        <Button variant="outline" size="xs" asChild>
          <Link href="/admin/packages">View All</Link>
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {/* Same height as one alert row, so the cards below don't jump when data arrives. */}
        {loading ? (
          <div className="h-10 animate-pulse rounded-lg border bg-muted/40" aria-hidden="true" />
        ) : (
          alerts.length === 0 && (
            <p className="flex h-10 items-center gap-2 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
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
            className="flex h-10 min-w-0 items-center gap-2 rounded-lg border px-2 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function buildDashboard(packages, customers, today, range) {
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
  const newCustomers = customers.filter((person) =>
    within(new Date(person.customerSince), start, end),
  ).length;
  const inTransit = packages.filter((pkg) => pkg.status === "In transit").length;
  const readyForPickup = packages.filter((pkg) => pkg.status === "Ready for pickup").length;

  const kpis = [
    {
      title: "Total customers",
      icon: Users,
      value: number.format(customers.length),
      detail: (
        <>
          <Trend value={{ text: String(newCustomers), direction: Math.sign(newCustomers) }} /> new ·{" "}
          {range} days
        </>
      ),
    },
    {
      title: "Total packages",
      icon: Package,
      value: number.format(registered.length),
      detail: <ChangeText value={change(registered.length, registeredBefore)} period={range} />,
    },
    {
      title: "In transit",
      icon: Truck,
      value: number.format(inTransit),
      detail: `${number.format(readyForPickup)} ready for pickup`,
    },
    {
      title: "Delivered",
      icon: CircleCheck,
      value: number.format(delivered),
      detail: <ChangeText value={change(delivered, deliveredBefore)} period={range} />,
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
  const [range, setRange] = useState(30);
  const [data, setData] = useState({ state: "loading", packages: [], customers: [] });
  const today = useToday();
  const { pickupReminderDays } = useSettings();

  // Loads on open, then quietly refreshes so changes made elsewhere (e.g. staff replying in
  // Telegram) show up without a reload.
  useEffect(() => {
    let cancelled = false;
    function load(first) {
      Promise.all([fetchJson("/api/packages"), fetchJson("/api/customers")])
        .then(([packageResult, customerResult]) => {
          if (cancelled) return;
          setData({
            state: "ready",
            packages: packageResult.packages.map(fromApiPackage),
            customers: customerResult.customers,
          });
        })
        .catch(
          (error) =>
            first &&
            !cancelled &&
            setData({ state: "error", message: error.message, packages: [], customers: [] }),
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
  const dashboard = ready ? buildDashboard(data.packages, data.customers, today, range) : null;
  const alerts = ready ? buildAlerts(data.packages, today, pickupReminderDays) : [];

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 pt-3 pb-4 md:px-6 md:pt-4 md:pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Welcome back, <span className="text-brand">{CURRENT_USER.name}</span>
          </h1>
          <TodayDate />
        </div>
        <ToggleGroup
          type="single"
          value={String(range)}
          onValueChange={(value) => value && setRange(Number(value))}
          aria-label="Date range"
          className="rounded-lg bg-muted p-1"
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key metrics">
        {dashboard
          ? dashboard.kpis.map((kpi) => <KpiCard key={kpi.title} {...kpi} />)
          : ["Total customers", "Total packages", "In transit", "Delivered"].map((title) => (
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
    </main>
  );
}
