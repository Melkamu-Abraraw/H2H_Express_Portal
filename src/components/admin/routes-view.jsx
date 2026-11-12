"use client";

import { ArrowRight, Building2, TriangleAlert } from "lucide-react";
import { balanceDue, totalsByCurrency } from "@/components/admin/package-payments";
import { packages } from "@/components/admin/packages-data";
import { statusDots } from "@/components/admin/package-views";
import { formatMoney, getRate, useShippingRates } from "@/components/admin/pricing-store";
import { AddRouteButton, EditRouteButton } from "@/components/admin/route-sheet";
import { useRoutes } from "@/components/admin/routes-store";
import { RouteLabel } from "@/components/admin/shipping-routes";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const SPEEDS = [
  { value: "normal", label: "Normal" },
  { value: "express", label: "Express" },
];

const ACTIVE_STATUSES = ["In transit", "Ready for pickup"];

function routeSummary(code) {
  const onRoute = packages.filter((item) => item.route === code);
  const unpaid = onRoute.filter((item) => balanceDue(item) > 0);
  return {
    total: onRoute.length,
    byStatus: Object.fromEntries(
      ACTIVE_STATUSES.map((status) => [
        status,
        onRoute.filter((item) => item.status === status).length,
      ]),
    ),
    owed: totalsByCurrency(unpaid, balanceDue),
    unpaid: unpaid.length,
  };
}

function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {children}
      </h3>
      {action}
    </div>
  );
}

function Figure({ label, children, className }) {
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`font-mono text-lg font-semibold tracking-tight ${className ?? ""}`}>
        {children}
      </dd>
    </div>
  );
}

function Rates({ code, currency, rates }) {
  const missing = SPEEDS.filter(({ value }) => getRate(rates, code, value) === null);

  return (
    <section className="grid gap-2">
      <SectionTitle>Price per kg</SectionTitle>
      <dl className="grid grid-cols-2 gap-2">
        {SPEEDS.map(({ value, label }) => {
          const rate = getRate(rates, code, value);
          return (
            <div key={value} className="rounded-md border px-3 py-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-mono text-sm font-semibold">
                {rate === null ? (
                  <span className="font-sans font-normal text-muted-foreground">Not set</span>
                ) : (
                  formatMoney(rate, currency)
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {missing.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-status-warn">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {missing.length === SPEEDS.length
            ? "No rates set. Use Edit to add them before taking packages."
            : `${missing.map(({ label }) => label).join(", ")} rate not set.`}
        </p>
      )}
    </section>
  );
}

function Steps({ steps }) {
  return (
    <section className="grid gap-2">
      <SectionTitle>Tracking steps</SectionTitle>
      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <li key={step.key} className="relative flex gap-3 pb-3 text-sm last:pb-0">
            {index < steps.length - 1 && (
              <span
                className="absolute top-3 left-[9px] h-full w-px bg-muted-foreground/30"
                aria-hidden="true"
              />
            )}
            <span
              className="relative grid size-5 shrink-0 place-items-center rounded-full border bg-card font-mono text-[10px] text-muted-foreground"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Branches({ branches, defaultBranch }) {
  return (
    <section className="grid gap-2">
      <SectionTitle>Drop-off branches</SectionTitle>
      <ul className="grid gap-2">
        {Object.entries(branches).map(([key, branch]) => (
          <li key={key} className="flex gap-2.5 text-sm">
            <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-medium">
                {branch.name}
                {key === defaultBranch && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">Default</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">{branch.address}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RouteCard({ route, rates }) {
  const { code, from, to, currency, depart, arrive, steps, branches, defaultBranch } = route;
  const summary = routeSummary(code);
  const [mainOwed, ...otherOwed] = summary.owed.map(([unit, amount]) => formatMoney(amount, unit));

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-base font-semibold">
            <RouteLabel from={from} to={to} />
          </h2>
          <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {depart && arrive && (
              <>
                <span className="inline-flex items-center gap-1 font-mono">
                  {depart}
                  <ArrowRight className="size-3.5" aria-label="to" />
                  {arrive}
                </span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>Charged in {currency}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{code}</span>
          </p>
        </div>
        <EditRouteButton route={route} />
      </CardHeader>
      <CardContent className="grid gap-5">
        <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Figure label="Packages">{summary.total}</Figure>
          {ACTIVE_STATUSES.map((status) => (
            <Figure
              key={status}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <span className={`size-1.5 rounded-full ${statusDots[status]}`} aria-hidden="true" />
                  {status}
                </span>
              }
            >
              {summary.byStatus[status]}
            </Figure>
          ))}
          <Figure
            label={`Balance due · ${summary.unpaid} ${summary.unpaid === 1 ? "package" : "packages"}`}
            className={mainOwed ? "text-status-warn" : undefined}
          >
            {mainOwed ?? "None"}
            {otherOwed.map((amount) => (
              <span key={amount} className="block text-sm">
                + {amount}
              </span>
            ))}
          </Figure>
        </dl>
        <div className="grid gap-6 md:grid-cols-3">
          <Rates code={code} currency={currency} rates={rates} />
          <Steps steps={steps} />
          <Branches branches={branches} defaultBranch={defaultBranch} />
        </div>
      </CardContent>
    </Card>
  );
}

export function RoutesView() {
  const rates = useShippingRates();
  const routes = useRoutes();

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted-foreground">
          <span className="font-mono">{routes.length}</span> routes
        </p>
        <AddRouteButton />
      </div>
      {routes.map((route) => (
        <RouteCard key={route.code} route={route} rates={rates} />
      ))}
    </div>
  );
}
