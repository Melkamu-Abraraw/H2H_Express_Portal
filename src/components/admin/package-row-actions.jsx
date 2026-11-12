"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, CircleCheck, Eye, X } from "lucide-react";
import { formatMoney } from "@/components/admin/pricing-store";
import { balanceDue, blockedByPayment, currencyOf } from "@/components/admin/package-payments";
import { trackingSteps, trackingTimeline } from "@/components/admin/package-tracking";
import { useRoutes } from "@/components/admin/routes-store";
import { pickupBranchFor } from "@/components/admin/shipping-routes";
import { useSettings } from "@/components/admin/settings-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const dotStyles = {
  done: "bg-status-good",
  current: "bg-brand ring-4 ring-brand/25",
  upcoming: "bg-muted-foreground/40",
};

function IconAction({ label, children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Timeline({ pkg }) {
  return (
    <ol className="flex flex-col" aria-label="Tracking history">
      {trackingTimeline(pkg).map((step, index, steps) => (
        <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
          {index < steps.length - 1 && (
            <span
              className="absolute top-3 left-[4.5px] h-full w-px bg-muted-foreground/30"
              aria-hidden="true"
            />
          )}
          <span
            className={`relative mt-1.5 size-2.5 shrink-0 rounded-full ${dotStyles[step.state]}`}
            aria-hidden="true"
          />
          <div className="flex flex-col">
            <span
              className={step.state === "current" ? "font-semibold" : undefined}
              aria-current={step.state === "current" ? "step" : undefined}
            >
              {step.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {step.state === "upcoming"
                ? `Est. ${format(step.date, "MMM d")}`
                : format(step.date, "MMM d, HH:mm")}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function UpdateStatusMenu({ pkg, onAdvance }) {
  const { requirePaymentBeforeDelivery } = useSettings();
  const steps = trackingSteps(pkg.route);
  const reached = steps.findIndex((step) => step.key === pkg.events.at(-1).step);
  const remaining = steps.slice(reached + 1);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="w-full" disabled={remaining.length === 0}>
          {remaining.length ? "Update status" : "Delivered"}
          {remaining.length > 0 && <ChevronDown aria-hidden="true" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        {remaining.map((step) => {
          const blocked = blockedByPayment(pkg, step.key, requirePaymentBeforeDelivery);
          return (
            <DropdownMenuItem
              key={step.key}
              disabled={blocked}
              onSelect={() => onAdvance(step.key)}
              className="flex-col items-start gap-0"
            >
              {step.label}
              {blocked && (
                <span className="text-xs text-status-warn">
                  Collect {formatMoney(balanceDue(pkg), currencyOf(pkg))} below first
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function branchLabel(name) {
  return name.replace(/hand to hand express/i, "").trim().replace(/^\((.*)\)$/, "$1") || name;
}

// Branches from Routes, plus the fixed pickup branch for this package's destination.
function useBranches(pkg) {
  const routes = useRoutes();
  const branches = [
    ...new Map(
      routes.flatMap((route) =>
        Object.entries(route.branches).map(([code, info]) => [code, { code, name: info.name }]),
      ),
    ).values(),
  ];
  const pickup = pickupBranchFor(pkg);
  if (pickup && !branches.some((branch) => branch.code === pickup.code)) {
    branches.push({ code: pickup.code, name: pickup.name });
  }
  return { branches, pickup };
}

// The receiver settles the balance at pickup; only then is the package released.
function CollectPanel({ pkg, onCollect }) {
  const currency = currencyOf(pkg);
  const due = balanceDue(pkg);
  const { branches, pickup } = useBranches(pkg);
  const [method, setMethod] = useState("Cash");
  const [branchCode, setBranchCode] = useState(pickup?.code ?? branches[0]?.code ?? "");
  const [state, setState] = useState({ busy: false, error: "" });

  async function submit(event) {
    event.preventDefault();
    if (state.busy) return;
    setState({ busy: true, error: "" });
    try {
      await onCollect({
        amount: due,
        method,
        branch: branches.find((option) => option.code === branchCode) ?? null,
      });
    } catch (error) {
      setState({ busy: false, error: error.message });
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-md border border-status-warn/40 bg-status-warn/5 p-3"
    >
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-status-warn">Collect {formatMoney(due, currency)}</span>
        <span className="text-xs text-muted-foreground">
          Paid {formatMoney(pkg.amountPaid, currency)} of {formatMoney(pkg.charge, currency)}
        </span>
      </div>
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label="Payment method"
        className="w-full"
        value={method}
        onValueChange={(value) => value && setMethod(value)}
      >
        {["Cash", "Transfer"].map((option) => (
          <ToggleGroupItem
            key={option}
            value={option}
            className="flex-1 data-[state=on]:border-brand data-[state=on]:bg-sidebar-accent"
          >
            {option}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Select value={branchCode} onValueChange={setBranchCode}>
        <SelectTrigger aria-label="Branch taking the payment" className="w-full">
          <SelectValue placeholder="Branch" />
        </SelectTrigger>
        <SelectContent>
          {branches.map((option) => (
            <SelectItem key={option.code} value={option.code}>
              {branchLabel(option.name)}
              {option.code === pickup?.code && (
                <span className="text-muted-foreground"> · pickup</span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" disabled={state.busy || !branchCode}>
        {state.busy ? "Saving…" : "Collect & mark delivered"}
      </Button>
      {state.error && <p className="text-xs text-status-bad">{state.error}</p>}
    </form>
  );
}

function PaymentPanel({ pkg }) {
  const currency = currencyOf(pkg);
  const due = balanceDue(pkg);

  if (due === 0) {
    return (
      <p className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <CircleCheck className="size-4 text-status-good" aria-hidden="true" />
        <span>
          <span className="font-medium">Paid in full</span>{" "}
          <span className="text-muted-foreground">· {formatMoney(pkg.charge, currency)}</span>
        </span>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border border-status-warn/40 bg-status-warn/5 p-3">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-status-warn">{formatMoney(due, currency)} due</span>
        <span className="text-xs text-muted-foreground">
          Paid {formatMoney(pkg.amountPaid, currency)} of {formatMoney(pkg.charge, currency)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Collected at pickup, before the package is marked delivered.
      </p>
    </div>
  );
}

export function PackageRowActions({ pkg, onAdvance, onCollect }) {
  const [open, setOpen] = useState(false);
  const summary = [`${pkg.sender} → ${pkg.receiver}`, `${pkg.weight.toFixed(1)} kg`].join(" · ");

  return (
    <div className="flex items-center justify-end gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <IconAction label="View tracking">
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={`View tracking for ${pkg.tracking}`}
            >
              <Eye aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </IconAction>
        <PopoverContent
          align="end"
          className="flex w-[calc(100vw-2rem)] max-w-96 flex-col gap-4 p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-sm font-semibold">{pkg.tracking}</p>
              <p className="text-sm text-muted-foreground">{summary}</p>
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <Timeline pkg={pkg} />
          {balanceDue(pkg) > 0 && pkg.events.at(-1).step === "pickup" ? (
            <CollectPanel
              pkg={pkg}
              onCollect={async (payment) => {
                await onCollect(payment);
                setOpen(false);
              }}
            />
          ) : (
            <PaymentPanel pkg={pkg} />
          )}
          <UpdateStatusMenu pkg={pkg} onAdvance={onAdvance} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
