"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheck, LoaderCircle, PackageCheck, PackageX } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/bag-detail";
import { StatusLine, bagRequest, bagUrl, branchShort, when } from "@/components/admin/bag-ui";
import { PackagePhotoThumb } from "@/components/admin/package-photos";
import { packageName } from "@/components/admin/package-tracking";
import { PackageRouteFlags } from "@/components/admin/shipping-routes";
import { EXCEPTION_TYPES, LOST_RESOLUTIONS, RESOLUTIONS } from "@/lib/bags";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// How each case can be closed, in a few words.
const OUTCOMES = {
  found: { title: "Found", hint: "It becomes ready for pickup", action: "Mark found", done: "found, ready for pickup", icon: PackageCheck, tone: "text-status-good" },
  lost: { title: "Lost", hint: "Close it for good", action: "Close as lost", done: "closed as lost", icon: PackageX, tone: "text-status-bad" },
  accepted: { title: "Handled", hint: "It can still be delivered", action: "Mark handled", done: "marked handled", icon: CircleCheck, tone: "text-status-good" },
  destroyed: { title: "Destroyed", hint: "Close it as damaged", action: "Close as damaged", done: "closed as damaged", icon: PackageX, tone: "text-status-bad" },
};

// When a package is closed as lost: pay back what the customer paid (or part of it), or nothing.
function RefundChoice({ exception, refund, onChange }) {
  const pkg = exception.package ?? {};
  const paid = Number(pkg.amountPaid) || 0;
  const currency = pkg.currency ?? "";
  const amount = Number(refund.amount);
  const tooMuch = refund.on && amount > paid;

  if (paid <= 0) {
    return <p className="text-sm text-muted-foreground">Nothing was paid for this package, so there&apos;s nothing to refund.</p>;
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Refund</span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={refund.on ? "yes" : "no"}
          onValueChange={(value) => value && onChange({ ...refund, on: value === "yes" })}
          aria-label="Refund the customer"
        >
          <ToggleGroupItem value="yes" className="px-3 text-xs data-[state=on]:border-ring data-[state=on]:bg-accent/60">
            Refund
          </ToggleGroupItem>
          <ToggleGroupItem value="no" className="px-3 text-xs data-[state=on]:border-ring data-[state=on]:bg-accent/60">
            No refund
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {refund.on && (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="grid gap-1.5">
            <Label htmlFor="refund-amount" className="text-xs text-muted-foreground">
              Amount ({currency}) · paid {paid.toFixed(2)}
            </Label>
            <Input
              id="refund-amount"
              type="number"
              inputMode="decimal"
              min="0"
              max={paid}
              step="0.01"
              className="font-mono"
              value={refund.amount}
              onChange={(event) => onChange({ ...refund, amount: event.target.value })}
              aria-invalid={tooMuch || undefined}
            />
            {tooMuch && <span className="text-xs text-status-bad">Can&apos;t be more than what was paid.</span>}
          </div>
          <div className="grid content-start gap-1.5">
            <span className="text-xs text-muted-foreground">Paid back by</span>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={refund.method}
              onValueChange={(value) => value && onChange({ ...refund, method: value })}
              aria-label="Refund method"
            >
              {["Cash", "Transfer"].map((method) => (
                <ToggleGroupItem key={method} value={method} className="px-3 text-xs data-[state=on]:border-ring data-[state=on]:bg-accent/60">
                  {method}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      )}
    </div>
  );
}

// The package, then one card per way to close the case (a single option needs no choosing).
function ResolveChoices({ exception, value, onChange, refund, onRefundChange }) {
  const pkg = exception.package ?? { tracking: exception.tracking };
  const options = RESOLUTIONS[exception.type].map((option) => option.value);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
        <PackagePhotoThumb pkg={pkg} />
        <span className="grid min-w-0 leading-tight">
          <span className="truncate text-sm font-medium">{packageName(pkg) || "Package"}</span>
          <span className="font-mono text-xs text-muted-foreground">{exception.tracking}</span>
        </span>
      </div>
      {options.length > 1 && (
        <div role="radiogroup" aria-label="Outcome" className="grid gap-2 sm:grid-cols-2">
          {options.map((key) => {
            const outcome = OUTCOMES[key];
            const Icon = outcome.icon;
            const selected = value === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(key)}
                className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors outline-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50 ${
                  selected ? "border-ring bg-accent/40 ring-1 ring-ring" : ""
                }`}
              >
                <Icon className={`size-5 shrink-0 ${outcome.tone}`} aria-hidden="true" />
                <span className="grid leading-tight">
                  <span className="text-sm font-medium">{outcome.title}</span>
                  <span className="text-xs text-muted-foreground">{outcome.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {LOST_RESOLUTIONS.includes(value) && <RefundChoice exception={exception} refund={refund} onChange={onRefundChange} />}
    </div>
  );
}

// Missing and damaged packages from received bags that still need a decision. Managers close
// each one here: found (it becomes ready for pickup), lost, or handled (damage).
export function BagsReport() {
  const [list, setList] = useState(null);
  const [load, setLoad] = useState({ state: "loading" });
  const [notice, setNotice] = useState(null);
  const [resolving, setResolving] = useState(null);
  const [resolution, setResolution] = useState("");
  const [refund, setRefund] = useState({ on: false, amount: "0", method: "Cash" });

  const reload = useCallback(async () => {
    try {
      const result = await bagRequest("/api/bags/reports");
      setList(result.exceptions);
      setLoad({ state: "ready" });
    } catch (error) {
      setLoad({ state: "error", message: error.message });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    bagRequest("/api/bags/reports")
      .then((result) => {
        if (cancelled) return;
        setList(result.exceptions);
        setLoad({ state: "ready" });
      })
      .catch((error) => !cancelled && setLoad({ state: "error", message: error.message }));
    return () => {
      cancelled = true;
    };
  }, []);

  function startResolving(exception) {
    setResolving(exception);
    setResolution(RESOLUTIONS[exception.type][0].value);
    // A refund of everything that was paid is the usual answer; staff can lower it or turn it off.
    const paid = Number(exception.package?.amountPaid) || 0;
    setRefund({ on: paid > 0, amount: paid > 0 ? paid.toFixed(2) : "0", method: "Cash" });
  }

  const losing = LOST_RESOLUTIONS.includes(resolution);
  const refundAmount = Number(refund.amount);
  const refundInvalid =
    losing && refund.on && (!(refundAmount > 0) || refundAmount > (Number(resolving?.package?.amountPaid) || 0));

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Package issues</h1>
        <p className="text-sm text-muted-foreground">
          Packages found missing or damaged when their box was received.
        </p>
      </div>
      <StatusLine result={notice} onDismiss={() => setNotice(null)} />
      <Card className="min-w-0 py-0">
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 text-muted-foreground">Package</TableHead>
                  <TableHead className="text-muted-foreground">Problem</TableHead>
                  <TableHead className="text-muted-foreground">Box</TableHead>
                  <TableHead className="text-muted-foreground">Route</TableHead>
                  <TableHead className="text-muted-foreground">Sender</TableHead>
                  <TableHead className="text-muted-foreground">Receiver</TableHead>
                  <TableHead className="text-muted-foreground">Reported</TableHead>
                  <TableHead className="pr-4 text-right text-muted-foreground">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list?.map((exception) => {
                  const pkg = exception.package ?? { tracking: exception.tracking };
                  return (
                    <TableRow key={exception._id} className="h-14">
                      <TableCell className="max-w-64 pl-4">
                        <div className="flex items-center gap-2">
                          <PackagePhotoThumb pkg={pkg} />
                          <span className="grid min-w-0 leading-tight">
                            <span className="font-mono text-[13px]">{exception.tracking}</span>
                            <span className="truncate text-xs text-muted-foreground" title={packageName(pkg)}>
                              {packageName(pkg) || "—"}
                            </span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm font-medium ${exception.type === "missing" ? "text-status-bad" : "text-status-warn"}`}>
                          {EXCEPTION_TYPES[exception.type]}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-[13px]">
                        <Link href={bagUrl(exception.bagCode)} className="hover:underline">
                          {exception.bagCode}
                        </Link>
                      </TableCell>
                      <TableCell title={`${branchShort(exception.origin)} → ${branchShort(exception.destination)}`}>
                        {exception.package ? <PackageRouteFlags pkg={exception.package} /> : "—"}
                      </TableCell>
                      <TableCell className="max-w-32 truncate" title={pkg.sender}>{pkg.sender ?? "—"}</TableCell>
                      <TableCell className="max-w-32 truncate" title={pkg.receiver}>{pkg.receiver ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="grid leading-tight">
                          <span>{when(exception.createdAt, "MMM d, HH:mm")}</span>
                          <span className="text-xs text-muted-foreground">{exception.reportedBy?.name}</span>
                        </span>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button size="sm" onClick={() => startResolving(exception)}>
                          Resolve
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(!list || list.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={8} className={`h-32 text-center ${load.state === "error" ? "text-status-bad" : "text-muted-foreground"}`}>
                      {load.state === "loading" ? (
                        <span className="inline-flex items-center gap-2">
                          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                          Loading package issues…
                        </span>
                      ) : load.state === "error" ? (
                        `Couldn't load package issues: ${load.message}`
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <CircleCheck className="size-4 text-status-good" aria-hidden="true" />
                          No package issues.
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {resolving && (
        <ConfirmDialog
          open={Boolean(resolving)}
          onOpenChange={(open) => !open && setResolving(null)}
          title={EXCEPTION_TYPES[resolving.type]}
          description={`From box ${resolving.bagCode}`}
          confirmLabel={OUTCOMES[resolution]?.action ?? "Resolve"}
          disabled={!resolution || refundInvalid}
          onConfirm={async () => {
            const refunding = losing && refund.on && refundAmount > 0;
            await bagRequest(`/api/bags/exceptions/${resolving._id}`, {
              method: "POST",
              body: { resolution, ...(refunding && { refund: { amount: refundAmount, method: refund.method } }) },
            });
            const refunded = refunding ? ` Refund of ${resolving.package?.currency ?? ""} ${refundAmount.toFixed(2)} recorded.` : "";
            setNotice({ text: `${resolving.tracking}: ${OUTCOMES[resolution]?.done ?? "resolved"}.${refunded}`, tone: "good" });
            await reload();
          }}
        >
          <ResolveChoices
            exception={resolving}
            value={resolution}
            onChange={setResolution}
            refund={refund}
            onRefundChange={setRefund}
          />
        </ConfirmDialog>
      )}
    </>
  );
}
