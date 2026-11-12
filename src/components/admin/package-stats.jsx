import { differenceInCalendarDays } from "date-fns";
import { formatMoney } from "@/components/admin/pricing-store";
import { balanceDue, totalsByCurrency } from "@/components/admin/package-payments";
import { statusDots } from "@/components/admin/package-views";

function plural(count, word) {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

function buildStats(packages, today, pickupDays) {
  const byStatus = (status) => packages.filter((item) => item.status === status);
  const inTransit = byStatus("In transit").length;
  const pickup = byStatus("Ready for pickup");
  const waiting = pickup.filter(
    (item) => today && differenceInCalendarDays(today, item.date) > pickupDays,
  ).length;
  const unpaid = packages.filter((item) => balanceDue(item) > 0);
  // One line per currency, since routes charge in CAD, ETB and so on.
  const due = totalsByCurrency(unpaid, balanceDue).map(([code, amount]) => formatMoney(amount, code));
  const weight = packages.reduce((sum, item) => sum + item.weight, 0);
  const express = packages.filter((item) => item.shipping === "express").length;

  return [
    {
      label: "In transit",
      dot: statusDots["In transit"],
      value: [inTransit],
      filter: { key: "status", value: "In transit" },
      detail: <span className="text-muted-foreground">On the way to pickup</span>,
    },
    {
      label: "Ready for pickup",
      dot: statusDots["Ready for pickup"],
      value: [pickup.length],
      filter: { key: "status", value: "Ready for pickup" },
      detail: waiting ? (
        <span className="text-status-bad">
          {waiting} waiting &gt; {pickupDays} {pickupDays === 1 ? "day" : "days"}
        </span>
      ) : (
        <span className="text-muted-foreground">None waiting long</span>
      ),
    },
    {
      label: "Delivered",
      dot: statusDots.Delivered,
      value: [byStatus("Delivered").length],
      filter: { key: "status", value: "Delivered" },
      detail: <span className="text-muted-foreground">Collected by the receiver</span>,
    },
    {
      label: "Pending payment",
      dot: "bg-status-warn",
      value: due.length ? due : ["None"],
      filter: { key: "payment", value: "Pending" },
      detail: (
        <span className={unpaid.length ? "text-status-warn" : "text-muted-foreground"}>
          {plural(unpaid.length, "package")}
        </span>
      ),
    },
    {
      label: "Total weight",
      dot: "bg-muted-foreground",
      value: [`${Math.round(weight * 10) / 10} kg`],
      detail: (
        <span className="text-muted-foreground">
          {plural(packages.length, "package")}
          {express ? ` · ${express} express` : ""}
        </span>
      ),
    },
  ];
}

const cardClass =
  "flex flex-col gap-1 rounded-xl border bg-card p-4 text-left text-card-foreground shadow-xs";

export function PackageStats({ items, today, pickupDays, filters, onSelect }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {buildStats(items, today, pickupDays).map(({ label, dot, value, detail, filter }) => {
        const body = (
          <>
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
          </>
        );

        if (!filter) {
          return (
            <div key={label} className={cardClass}>
              {body}
            </div>
          );
        }

        const active = filters[filter.key] === filter.value;
        return (
          <button
            key={label}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(filter.key, active ? null : filter.value)}
            className={`${cardClass} transition-colors outline-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-ring aria-pressed:ring-1 aria-pressed:ring-ring`}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
