"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ChevronRight, Eye, Plus, X } from "lucide-react";
import { statusPills } from "@/components/admin/package-views";
import { formatMoney } from "@/components/admin/pricing-store";
import { packageCountries } from "@/components/admin/shipping-routes";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const MAX_RECEIVERS = 3;
const MAX_RECENT = 2;

function newPackageHref(customerId, receiverName) {
  const params = new URLSearchParams({ customer: customerId });
  if (receiverName) params.set("receiver", receiverName);
  return `/admin/packages/new?${params}`;
}

function Money({ totals, empty }) {
  if (totals.length === 0) return <span className="text-muted-foreground">{empty}</span>;
  return totals.map(([currency, amount]) => (
    <span key={currency} className="block whitespace-nowrap">
      {formatMoney(amount, currency)}
    </span>
  ));
}

function Stat({ label, children, className }) {
  return (
    <div className="rounded-md bg-muted/60 px-2 py-1.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={`font-mono text-xs font-semibold ${className ?? ""}`}>{children}</dd>
    </div>
  );
}

function EmptyNote({ children }) {
  return <p className="py-1 text-xs text-muted-foreground">{children}</p>;
}

function SectionTitle({ children }) {
  return (
    <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

function CardBody({ customer, onClose }) {
  const plural = (count) => (count === 1 ? "package" : "packages");
  const receivers = customer.savedReceivers.slice(0, MAX_RECEIVERS);
  const hiddenReceivers = customer.savedReceivers.length - receivers.length;

  return (
    <>
      <div className="flex items-center gap-2.5">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/20 text-xs font-semibold"
          aria-hidden="true"
        >
          {customer.name
            .split(" ")
            .map((part) => part[0])
            .slice(0, 2)
            .join("")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{customer.name}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {customer.id} · since {format(customer.customerSince, "MMM yyyy")}
          </p>
        </div>
        <Button variant="ghost" size="icon-xs" aria-label="Close" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </div>

      <dl className="grid grid-cols-3 gap-1.5">
        <Stat label="Packages">{customer.sent}</Stat>
        <Stat label="Spent">
          <Money totals={customer.spent} empty="None" />
        </Stat>
        <Stat label="Balance due" className={customer.dues.length ? "text-status-warn" : undefined}>
          <Money totals={customer.dues} empty="None" />
        </Stat>
      </dl>

      <section className="grid gap-1">
        <SectionTitle>Saved receivers</SectionTitle>
        {customer.savedReceivers.length === 0 ? (
          <EmptyNote>No receivers yet. They&apos;re saved after the first package.</EmptyNote>
        ) : (
          <ul className="divide-y">
            {receivers.map((receiver) => {
              const { Flag } = packageCountries({ route: receiver.route, to: receiver.country }).to;
              return (
                <li key={receiver.name}>
                  <Link
                    href={newPackageHref(customer.id, receiver.name)}
                    className="group flex items-center justify-between gap-2 rounded-sm py-1.5 text-[13px] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{receiver.name}</span>
                      <span className="text-muted-foreground">·</span>
                      <Flag className="h-3 w-4 shrink-0 rounded-[2px]" aria-hidden="true" />
                      <span className="truncate text-muted-foreground">{receiver.city}</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      {receiver.count} {plural(receiver.count)}
                      <ChevronRight
                        className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                        aria-hidden="true"
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {hiddenReceivers > 0 && (
          <p className="text-xs text-muted-foreground">+{hiddenReceivers} more in the form</p>
        )}
      </section>

      <section className="grid gap-1">
        <SectionTitle>Recent packages</SectionTitle>
        {customer.recentPackages.length === 0 ? (
          <EmptyNote>This customer hasn&apos;t sent a package yet.</EmptyNote>
        ) : (
          <ul className="divide-y">
            {customer.recentPackages.slice(0, MAX_RECENT).map((pkg) => (
              <li key={pkg.tracking} className="flex items-center justify-between gap-2 py-1.5">
                <span className="font-mono text-xs">{pkg.tracking}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusPills[pkg.status]}`}
                >
                  {pkg.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {customer.notes && (
        <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs">
          <span className="font-medium">Note:</span> {customer.notes}
        </p>
      )}

      <Button asChild className="w-full">
        <Link href={newPackageHref(customer.id)}>
          <Plus aria-hidden="true" />
          Register new package
        </Link>
      </Button>
    </>
  );
}

export function CustomerCardButton({ customer }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label={`View ${customer.name}`}>
              <Eye aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>View customer</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        collisionPadding={16}
        className="flex max-h-(--radix-popover-content-available-height) w-[calc(100vw-2rem)] max-w-80 flex-col gap-3 overflow-y-auto p-3"
      >
        <CardBody customer={customer} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
