import { addDays, format, isSameMonth } from "date-fns";
import {
  ArrowRight,
  Check,
  Handshake,
  Package,
  Plane,
  PlaneLanding,
  ShieldCheck,
  Store,
  Wallet,
} from "lucide-react";
import { CopyNumber, TrackingActions } from "@/components/tracking/tracking-actions";
import { VanImage } from "@/components/van-loader";

function etaRange(date) {
  const end = addDays(date, 1);
  return isSameMonth(date, end)
    ? `${format(date, "MMM d")}–${format(end, "d")}`
    : `${format(date, "MMM d")} – ${format(end, "MMM d")}`;
}

const STEP_ICONS = {
  received: Package,
  departed: Plane,
  arrived: PlaneLanding,
  customs: ShieldCheck,
  pickup: Store,
  delivered: Handshake,
};

// One segment per step. Past and upcoming step names sit above their segment; the current
// segment has the van above it instead, and its name in bold below the bar.
function Progress({ steps, current, delivered }) {
  const fill = delivered ? "bg-status-good" : "bg-brand";

  return (
    <div className="relative">
      <ol className="flex gap-1" aria-label="Delivery progress">
        {steps.map((step, index) => {
          const now = index === current;
          const width = index < current || delivered ? "100%" : now ? "50%" : "0%";
          return (
            <li
              key={step.key}
              aria-current={now ? "step" : undefined}
              className="flex min-w-0 flex-1 flex-col"
            >
              <span
                className={`flex h-7 items-end pb-1.5 text-[10px] whitespace-nowrap sm:text-xs ${
                  index === 0 ? "justify-start" : index === steps.length - 1 ? "justify-end" : "justify-center"
                } ${index < current ? "text-muted-foreground" : "text-muted-foreground/60"}`}
              >
                {!now && step.short}
              </span>
              <span className="h-1 overflow-hidden rounded-[2px] bg-muted">
                <span
                  className={`track-fill-in block h-full rounded-[2px] ${fill}`}
                  style={{ width, animationDuration: "0.6s", animationDelay: `${index * 0.3}s` }}
                />
              </span>
              <span
                className={`flex h-6 pt-1.5 text-xs font-semibold whitespace-nowrap sm:text-sm ${
                  index === 0 ? "justify-start" : index === steps.length - 1 ? "justify-end" : "justify-center"
                } ${delivered ? "text-status-good" : "text-foreground"}`}
              >
                {now ? step.short : ""}
              </span>
            </li>
          );
        })}
      </ol>
      {/* Parks over the middle of the current segment, in the space its label would use. */}
      <div
        className="track-van-in pointer-events-none absolute top-0.5 w-8 -translate-x-1/2 sm:top-0 sm:w-10"
        style={{ left: `${((current + 0.5) / steps.length) * 100}%` }}
        aria-hidden="true"
      >
        <VanImage className="van-bob [animation-iteration-count:5]" />
      </div>
    </div>
  );
}

function Stat({ label, children }) {
  return (
    <div className="min-w-0 px-4 py-3.5 sm:px-5 sm:py-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-pretty break-words sm:text-base">{children}</dd>
    </div>
  );
}

function Place({ label, country }) {
  const { Flag } = country;
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 flex h-6 items-center gap-2 font-medium">
        <Flag className="h-4 w-6 shrink-0 rounded-[1px] shadow-xs" aria-hidden="true" />
        <span className="truncate">{country.name}</span>
      </p>
    </div>
  );
}

// Oldest first on a thin line: green dots for steps that happened, a yellow dot and bold
// text for where the package is now, and plain grey text for what's still to come.
function History({ steps, current, delivered }) {
  return (
    <section className="grid content-start gap-5 rounded-lg border bg-card p-5 text-card-foreground shadow-xs sm:p-6">
      <h2 className="text-base font-semibold">Shipment timeline</h2>
      <ol className="grid">
        {steps.map((step, index) => {
          const now = index === current;
          const happened = index < current || now;
          const dot = now
            ? delivered
              ? "bg-status-good ring-4 ring-status-good/20"
              : "bg-brand ring-4 ring-brand/30"
            : happened
              ? "bg-status-good"
              : "bg-muted-foreground/30";
          return (
            <li key={step.key} className="relative flex gap-4 pb-5 last:pb-0">
              {index < steps.length - 1 && (
                <span
                  className={`absolute top-3 bottom-0 left-[4px] w-px ${
                    index < current ? "bg-status-good" : "bg-border"
                  }`}
                  aria-hidden="true"
                />
              )}
              <span className={`relative mt-1.5 size-[9px] shrink-0 rounded-full ${dot}`} aria-hidden="true" />
              <div className="min-w-0">
                <p
                  className={`text-sm ${
                    now
                      ? `font-semibold ${delivered ? "text-status-good" : "text-foreground"}`
                      : happened
                        ? "text-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  {step.event}
                </p>
                <p className="text-xs text-muted-foreground">
                  {happened
                    ? format(step.date, "MMM d, h:mm a")
                    : `Expected ${format(step.date, "MMM d")}`}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function TrackingCard({ info }) {
  const StageIcon = STEP_ICONS[info.steps[info.current].key] ?? Package;

  return (
    // Side by side on wide screens so nothing important needs scrolling; stacked on phones.
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
      <article className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs">
        <div className="grid gap-5 p-5 sm:p-6">
          <header className="grid gap-1">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                info.delivered ? "text-status-good" : "text-brand-dark dark:text-brand"
              }`}
            >
              {info.delivered ? (
                <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
              ) : (
                <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
              )}
              {info.delivered ? "Delivered" : "In progress"}
            </span>
            <CopyNumber number={info.tracking} />
          </header>

          {/* Even gaps either side keep the arrow centred; it sits on the country line, not the labels. */}
          <div className="flex items-end gap-3">
            <Place label="From" country={info.origin.country} />
            <span className="flex h-6 items-center">
              <ArrowRight className="size-3.5 text-brand-dark dark:text-brand" strokeWidth={2.5} aria-label="to" />
            </span>
            <Place label="To" country={info.country} />
          </div>

          <div className="flex items-start gap-3.5 rounded-lg bg-muted/50 p-4">
            <span
              className={`grid shrink-0 place-items-center pt-0.5 ${
                info.delivered ? "text-status-good" : "text-brand-dark dark:text-brand"
              }`}
              aria-hidden="true"
            >
              <StageIcon className="size-4.5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">{info.title}</h1>
              <p className="text-sm text-muted-foreground">{info.message}</p>
            </div>
          </div>

          <Progress steps={info.steps} current={info.current} delivered={info.delivered} />
        </div>

        <dl className="grid grid-cols-2 border-t bg-muted/40 sm:grid-cols-4 [&>div]:border-border max-sm:[&>div:nth-child(-n+2)]:border-b max-sm:[&>div:nth-child(odd)]:border-r sm:[&>div:not(:last-child)]:border-r">
          <Stat label="Weight">{info.weight.toFixed(1)} kg</Stat>
          <Stat label="Shipped on">{format(info.shipped, "MMM d, yyyy")}</Stat>
          <Stat label={info.delivered ? "Delivered" : "Estimated delivery"}>
            {info.delivered ? format(info.updated, "MMM d") : etaRange(info.eta)}
          </Stat>
          <Stat label="Pickup at">{info.pickup}</Stat>
        </dl>

        {info.balanceDue && !info.delivered && (
          <p className="flex items-start gap-3 border-t px-5 py-3 text-sm sm:px-6">
            <Wallet className="mt-0.5 size-4 shrink-0 text-status-warn" aria-hidden="true" />
            A balance is due before pickup. You can pay at the office when you collect.
          </p>
        )}

        <TrackingActions number={info.tracking} />
      </article>

      <History steps={info.steps} current={info.current} delivered={info.delivered} />
    </div>
  );
}
