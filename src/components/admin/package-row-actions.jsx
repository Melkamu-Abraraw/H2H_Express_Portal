"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { CircleCheck, Eye, Handshake, X } from "lucide-react";
import { formatMoney } from "@/components/admin/pricing-store";
import { pickupAmount } from "@/lib/exchange";
import { useExchangeRates } from "@/components/admin/exchange-store";
import { balanceDue, currencyOf } from "@/components/admin/package-payments";
import { isWrittenOff, lastStep, trackingTimeline } from "@/components/admin/package-tracking";
import { useRoutes } from "@/components/admin/routes-store";
import { packageCountries, pickupBranchFor } from "@/components/admin/shipping-routes";
import { Button } from "@/components/ui/button";
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
  lost: "bg-status-bad ring-4 ring-status-bad/25",
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

// A paid package waiting at pickup is handed over in two clicks, so a stray click can't do it.
function HandOverPanel({ pkg, onHandOver }) {
  const [state, setState] = useState({ confirming: false, busy: false, error: "" });

  async function confirm() {
    setState({ confirming: true, busy: true, error: "" });
    try {
      await onHandOver();
    } catch (error) {
      setState({ confirming: false, busy: false, error: error.message });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {state.confirming ? (
        <div className="flex flex-col gap-2 rounded-md border border-brand/50 bg-brand/5 p-3 text-sm">
          <span>
            Hand <span className="font-medium">{pkg.tracking}</span> to {pkg.receiver}? Check their photo ID first.
          </span>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled={state.busy} onClick={() => setState({ confirming: false, busy: false, error: "" })}>
              Back
            </Button>
            <Button className="flex-1" disabled={state.busy} onClick={confirm}>
              {state.busy ? "Saving…" : "Confirm hand-over"}
            </Button>
          </div>
        </div>
      ) : (
        <Button className="w-full" onClick={() => setState({ confirming: true, busy: false, error: "" })}>
          <Handshake aria-hidden="true" />
          Hand over to receiver
        </Button>
      )}
      {state.error && <p className="text-xs text-status-bad">{state.error}</p>}
    </div>
  );
}

function branchLabel(name) {
  return name.replace(/hand to hand express/i, "").trim().replace(/^\((.*)\)$/, "$1") || name;
}

// Where the receiver can collect: only branches in the package's destination country, i.e. the
// branches of routes that start there (to Ethiopia: Addis Ababa; to Canada: the Toronto
// branches). Plus the fixed pickup branch for that country, if it isn't listed already.
// No branch there at all (e.g. Uganda): every branch, so the package can still be released.
function useBranches(pkg) {
  const routes = useRoutes();
  const { to } = packageCountries(pkg);
  const branchesOf = (list) => [
    ...new Map(
      list.flatMap((route) =>
        Object.entries(route.branches).map(([code, info]) => [code, { code, name: info.name }]),
      ),
    ).values(),
  ];
  const local = routes.filter((route) => route.from.code === to.code);
  const branches = branchesOf(local.length || pickupBranchFor(pkg) ? local : routes);
  const pickup = pickupBranchFor(pkg);
  if (pickup && !branches.some((branch) => branch.code === pickup.code)) {
    branches.unshift({ code: pickup.code, name: pickup.name });
  }
  return { branches, pickup };
}

// The receiver settles the balance at pickup; only then is the package released.
function CollectPanel({ pkg, onCollect }) {
  const currency = currencyOf(pkg);
  const due = balanceDue(pkg);
  // The receiver pays in the destination's currency (Birr, CAD or UGX) at today's rate.
  const local = pickupAmount(pkg, due, useExchangeRates());
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
        <span className="font-medium text-status-warn">Collect {local ? local.text : formatMoney(due, currency)}</span>
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

// A lost package: closed for good, with any refund that was given.
function LostPanel({ pkg }) {
  const currency = currencyOf(pkg);
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-status-bad/30 bg-status-bad/5 px-3 py-2 text-sm">
      <span className="font-medium text-status-bad">{lastStep(pkg) === "damaged" ? "Closed as damaged" : "Closed as lost"}</span>
      <span className="text-xs text-muted-foreground">
        {pkg.refund?.amount > 0
          ? `Refunded ${formatMoney(pkg.refund.amount, currency)} (${pkg.refund.method}) · ${pkg.refund.receiptNo}`
          : `No refund · paid ${formatMoney(pkg.amountPaid, currency)} of ${formatMoney(pkg.charge, currency)}`}
      </span>
    </div>
  );
}

function PaymentPanel({ pkg }) {
  const currency = currencyOf(pkg);
  const due = balanceDue(pkg);
  const local = pickupAmount(pkg, due, useExchangeRates());
  if (isWrittenOff(pkg)) return <LostPanel pkg={pkg} />;

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
        Collected at pickup{local ? ` as ${local.text}` : ""}, before the package is marked delivered.
      </p>
    </div>
  );
}

// What moves a package on from where it is now. Statuses aren't changed by hand here: bags move
// packages to In transit and Ready for pickup; the only action is handing a package over.
function NextStepNote({ pkg }) {
  const text = {
    departed: "It becomes Ready for pickup when its box is received at the destination branch.",
    delivered: "Collected by the receiver.",
  }[lastStep(pkg)];
  return text ? <p className="text-xs text-muted-foreground">{text}</p> : null;
}

// `canUpdate` / `canCollect`: whether the signed-in role may hand the package over or take
// money for it (the server checks both again).
export function PackageRowActions({ pkg, onHandOver, onCollect, canUpdate = true, canCollect = true }) {
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
          className="flex max-h-(--radix-popover-content-available-height) w-[calc(100vw-2rem)] max-w-96 flex-col gap-4 overflow-y-auto p-4"
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
          {pkg.exception ? (
            // An open missing/damaged case: no status actions until it's closed on Package issues.
            <p className="rounded-md border border-status-bad/30 bg-status-bad/5 px-3 py-2 text-sm">
              <span className="font-medium text-status-bad">
                {pkg.exception.type === "missing" ? "Missing package" : "Damaged package"}
              </span>
              <span className="block text-xs text-muted-foreground">
                Waiting for a decision on Package issues.
              </span>
            </p>
          ) : pkg.bag?.code ? (
            <>
              <PaymentPanel pkg={pkg} />
              <p className="rounded-md border px-3 py-2 text-sm">
                In box{" "}
                <Link href={`/admin/bags/${pkg.bag.code}`} className="font-mono font-medium hover:underline">
                  {pkg.bag.code}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  It moves with the box: In transit when the box is dispatched, Ready for pickup when it&apos;s received.
                </span>
              </p>
            </>
          ) : balanceDue(pkg) > 0 && lastStep(pkg) === "pickup" ? (
            canCollect && canUpdate ? (
              // Collecting the balance also marks the package delivered, so no separate status menu.
              <CollectPanel
                pkg={pkg}
                onCollect={async (payment) => {
                  await onCollect(payment);
                  setOpen(false);
                }}
              />
            ) : (
              <>
                <PaymentPanel pkg={pkg} />
                <p className="text-xs text-muted-foreground">
                  The balance is collected at the front desk before the package is handed over.
                </p>
              </>
            )
          ) : (
            <>
              <PaymentPanel pkg={pkg} />
              {lastStep(pkg) === "pickup" ? (
                canUpdate && (
                  <HandOverPanel
                    pkg={pkg}
                    onHandOver={async () => {
                      await onHandOver();
                      setOpen(false);
                    }}
                  />
                )
              ) : (
                <NextStepNote pkg={pkg} />
              )}
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
