"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  CircleAlert,
  LoaderCircle,
  Lock,
  Search,
  Send,
  Undo2,
  X,
} from "lucide-react";
import { PackagePhotoThumb } from "@/components/admin/package-photos";
import { packageName } from "@/components/admin/package-tracking";
import { useProfile } from "@/components/admin/profile-store";
import { PackageRouteFlags, packageCountries } from "@/components/admin/shipping-routes";
import {
  BagStatusBadge,
  StatusLine,
  bagRequest,
  branchShort,
  kg,
  when,
} from "@/components/admin/bag-ui";
import { BAG_STATUS, VERIFICATION, bagWeight } from "@/lib/bags";
import { can } from "@/lib/permissions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// What happens to each package when the bag is received.
const NEXT_STEPS = {
  received: { label: "Ready for pickup", className: "text-status-good" },
  damaged: { label: "Ready for pickup · Damaged", className: "text-status-warn" },
  missing: { label: "Missing · Stays in transit", className: "text-status-bad" },
};
const NEXT_STEP_ORDER = { missing: 0, damaged: 1, received: 2 };

// Written out in full so Tailwind sees each class.
const TOGGLE_TONES = {
  received: "text-status-good data-[state=on]:border-status-good/50 data-[state=on]:bg-status-good/15",
  missing: "text-status-bad data-[state=on]:border-status-bad/50 data-[state=on]:bg-status-bad/15",
  damaged: "text-status-warn data-[state=on]:border-status-warn/50 data-[state=on]:bg-status-warn/15",
}

function plural(count, word) {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

function Field({ label, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function byLine(date, person) {
  if (!date) return null;
  return `${when(date)}${person?.name ? ` · ${person.name}` : ""}`;
}

// ---------------------------------------------------------------------------------------------

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, disabled, children, destructive }) {
  const [state, setState] = useState({ busy: false, error: "" });

  async function submit(event) {
    event.preventDefault();
    if (state.busy) return;
    setState({ busy: true, error: "" });
    try {
      await onConfirm();
      setState({ busy: false, error: "" });
      onOpenChange(false);
    } catch (error) {
      setState({ busy: false, error: error.message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !state.busy && onOpenChange(value)}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="grid flex-1 content-start gap-4 overflow-y-auto border-y p-4">
            {children}
            {state.error && <p role="alert" className="text-sm text-status-bad">{state.error}</p>}
          </div>
          <DialogFooter className="flex-row justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={state.busy}>
              Back
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={state.busy || disabled}>
              {state.busy ? "Saving…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManifestSummary({ bag }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-56 overflow-y-auto rounded-md border">
        <Table>
          <TableBody>
            {bag.items.map((item) => {
              // Names and photos come from the package itself.
              const pkg = { ...item, ...item.package };
              return (
                <TableRow key={item.tracking}>
                  <TableCell className="font-mono text-xs">{item.tracking}</TableCell>
                  <TableCell className="max-w-44 text-xs">
                    <div className="flex items-center gap-2">
                      <PackagePhotoThumb pkg={pkg} />
                      <span className="min-w-0 truncate" title={packageName(pkg)}>
                        {packageName(pkg) || <span className="text-muted-foreground">—</span>}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-32 truncate text-xs" title={item.sender}>{item.sender}</TableCell>
                  <TableCell>
                    <PackageRouteFlags pkg={pkg} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{kg(item.weight)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm font-medium">
        {plural(bag.items.length, "package")} · {kg(bagWeight(bag.items))}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Filling an open bag

// The destination country: its flag and name.
function CountryFlag({ pkg }) {
  const { to } = packageCountries(pkg);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <to.Flag className="h-3 w-4 shrink-0 rounded-[1px]" aria-hidden="true" />
      {to.name}
    </span>
  );
}

// The packages in a bag. While it's open (`onRemove` given) each row can be taken out; after
// that it's a read-only list, with what was found for each package once the bag is received.
function BagPackagesTable({ bag, onRemove, busy = false }) {
  const checked = bag.items.some((item) => item.verification);
  const columns = 6 + (checked ? 1 : 0) + (onRemove ? 1 : 0);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">
        Packages in this box{" "}
        <span className="font-normal text-muted-foreground">
          · {plural(bag.items.length, "package")} · {kg(bagWeight(bag.items))}
        </span>
      </p>
      <div className="max-h-96 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-muted-foreground">Tracking #</TableHead>
              <TableHead className="text-muted-foreground">Package</TableHead>
              <TableHead className="text-muted-foreground">Sender</TableHead>
              <TableHead className="text-muted-foreground">Receiver</TableHead>
              <TableHead className="text-muted-foreground">To</TableHead>
              <TableHead className="text-right text-muted-foreground">Weight</TableHead>
              {checked && <TableHead className="text-muted-foreground">Checked as</TableHead>}
              {onRemove && (
                <TableHead>
                  <span className="sr-only">Remove</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bag.items.map((item) => {
              // The bag keeps the basics; names and photos come from the package itself.
              const pkg = { ...item, ...item.package };
              const check = VERIFICATION.find((option) => option.value === item.verification);
              return (
                <TableRow key={item.tracking}>
                  <TableCell className="font-mono text-[13px]">{item.tracking}</TableCell>
                  <TableCell className="max-w-48">
                    <div className="flex items-center gap-2">
                      <PackagePhotoThumb pkg={pkg} />
                      <span className="min-w-0 truncate" title={packageName(pkg)}>
                        {packageName(pkg) || <span className="text-muted-foreground">—</span>}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-32 truncate" title={item.sender}>{item.sender}</TableCell>
                  <TableCell className="max-w-32 truncate" title={item.receiver}>{item.receiver}</TableCell>
                  <TableCell>
                    <CountryFlag pkg={pkg} />
                  </TableCell>
                  <TableCell className="text-right font-mono">{kg(item.weight)}</TableCell>
                  {checked && <TableCell className={check?.tone}>{check?.label ?? "—"}</TableCell>}
                  {onRemove && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-status-bad hover:text-status-bad"
                        disabled={busy}
                        aria-label={`Remove ${item.tracking} from the box`}
                        onClick={() => onRemove(item.tracking)}
                      >
                        <X aria-hidden="true" />
                        Remove
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {!bag.items.length && (
              <TableRow>
                <TableCell colSpan={columns} className="h-20 text-center text-muted-foreground">
                  {onRemove ? "Nothing in this box yet. Tick packages above and click Add." : "This box is empty."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AddPackagesPanel({ bag, onChanged }) {
  const [term, setTerm] = useState("");
  const [eligible, setEligible] = useState({ state: "loading", rows: [] });
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ bag: bag.code });
      if (term.trim()) params.set("q", term.trim());
      bagRequest(`/api/bags/eligible?${params}`)
        .then(({ packages }) => !cancelled && setEligible({ state: "ready", rows: packages }))
        .catch((error) => !cancelled && setEligible({ state: "error", rows: [], message: error.message }));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bag.code, term, version]);

  async function remove(tracking) {
    if (busy) return;
    setBusy(true);
    try {
      await bagRequest(`/api/bags/${bag.code}/packages?tracking=${encodeURIComponent(tracking)}`, { method: "DELETE" });
      setResult({ text: `Removed ${tracking} from the box.`, tone: "good" });
      setVersion((value) => value + 1);
      await onChanged();
    } catch (error) {
      setResult({ text: error.message, tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  async function add(trackings) {
    if (!trackings.length || busy) return;
    setBusy(true);
    try {
      const { added, rejected } = await bagRequest(`/api/bags/${bag.code}/packages`, { method: "POST", body: { trackings } });
      const parts = [];
      if (added.length) parts.push(`Added ${plural(added.length, "package")}`);
      if (rejected.length) parts.push(`Not added: ${rejected.map((row) => `${row.tracking} (${row.reason})`).join("; ")}`);
      setResult({ text: parts.join(" · "), tone: rejected.length ? (added.length ? "warn" : "bad") : "good" });
      setPicked(new Set());
      setVersion((value) => value + 1);
      await onChanged();
    } catch (error) {
      setResult({ text: error.message, tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  const rows = eligible.rows;
  const allPicked = rows.length > 0 && rows.every((row) => picked.has(row.tracking));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add packages</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <StatusLine result={result} onDismiss={() => setResult(null)} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Search eligible packages"
              placeholder="Search tracking #, name or package..."
              className="pl-8"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            />
          </div>
          <Button className="sm:ml-auto" disabled={!picked.size || busy} onClick={() => add([...picked])}>
            {busy ? "Adding…" : `Add ${picked.size ? plural(picked.size, "package") : "selected"}`}
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all eligible packages"
                    checked={allPicked ? true : picked.size ? "indeterminate" : false}
                    disabled={!rows.length}
                    onCheckedChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((row) => row.tracking)))}
                  />
                </TableHead>
                <TableHead className="text-muted-foreground">Tracking #</TableHead>
                <TableHead className="text-muted-foreground">Package</TableHead>
                <TableHead className="text-muted-foreground">Sender</TableHead>
                <TableHead className="text-muted-foreground">Receiver</TableHead>
                <TableHead className="text-muted-foreground">To</TableHead>
                <TableHead className="text-right text-muted-foreground">Weight</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.tracking} data-state={picked.has(row.tracking) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      aria-label={`Select ${row.tracking}`}
                      checked={picked.has(row.tracking)}
                      onCheckedChange={(checked) =>
                        setPicked((current) => {
                          const next = new Set(current);
                          if (checked === true) next.add(row.tracking);
                          else next.delete(row.tracking);
                          return next;
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="font-mono text-[13px]">{row.tracking}</TableCell>
                  <TableCell className="max-w-48">
                    <div className="flex items-center gap-2">
                      <PackagePhotoThumb pkg={row} />
                      <span className="min-w-0 truncate" title={packageName(row)}>
                        {packageName(row) || <span className="text-muted-foreground">—</span>}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-32 truncate" title={row.sender}>{row.sender}</TableCell>
                  <TableCell className="max-w-32 truncate" title={row.receiver}>{row.receiver}</TableCell>
                  <TableCell>
                    <CountryFlag pkg={row} />
                  </TableCell>
                  <TableCell className="text-right font-mono">{kg(row.weight)}</TableCell>
                  <TableCell>{row.status}</TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={8} className={`h-20 text-center ${eligible.state === "error" ? "text-status-bad" : "text-muted-foreground"}`}>
                    {eligible.state === "loading"
                      ? "Loading packages…"
                      : eligible.state === "error"
                        ? `Couldn't load packages: ${eligible.message}`
                        : term
                          ? "No eligible packages match."
                          : "No packages are waiting for this box."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="pt-2">
          <BagPackagesTable bag={bag} busy={busy} onRemove={remove} />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// The manifest

// ---------------------------------------------------------------------------------------------
// Receiving: every package is checked before the receipt is completed.

function ReceivePanel({ bag, onReceived }) {
  const [checks, setChecks] = useState({});
  const [confirming, setConfirming] = useState(false);

  const counts = Object.fromEntries(VERIFICATION.map(({ value }) => [value, bag.items.filter((item) => checks[item.tracking]?.status === value).length]));
  const unchecked = bag.items.filter((item) => !checks[item.tracking]?.status).length;
  const discrepancies = counts.missing + counts.damaged;
  // A tick means "received". Ticking every box marks all of them received, except packages
  // already marked missing or damaged.
  const allReceived = bag.items.length > 0 && counts.received === bag.items.length;
  const tick = (tracking, on) => setChecks((current) => ({ ...current, [tracking]: { status: on ? "received" : undefined } }));
  function tickAll() {
    setChecks((current) => {
      const next = { ...current };
      for (const item of bag.items) {
        const status = current[item.tracking]?.status;
        if (allReceived) next[item.tracking] = { status: undefined };
        else if (status !== "missing" && status !== "damaged") next[item.tracking] = { status: "received" };
      }
      return next;
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Receive this box</CardTitle>
        <Button disabled={unchecked > 0} onClick={() => setConfirming(true)}>
          Receive box
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Expected", bag.items.length, ""],
            ["Received", counts.received, "text-status-good"],
            ["Missing", counts.missing, counts.missing ? "text-status-bad" : ""],
            ["Damaged", counts.damaged, counts.damaged ? "text-status-warn" : ""],
            ["Not checked", unchecked, unchecked ? "text-status-warn" : ""],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-md border px-3 py-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className={`font-mono text-xl font-semibold ${tone}`}>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Mark all packages received"
                    checked={allReceived ? true : counts.received ? "indeterminate" : false}
                    disabled={!bag.items.length}
                    onCheckedChange={tickAll}
                  />
                </TableHead>
                <TableHead className="text-muted-foreground">Tracking #</TableHead>
                <TableHead className="text-muted-foreground">Package</TableHead>
                <TableHead className="text-muted-foreground">Receiver</TableHead>
                <TableHead className="text-right text-muted-foreground">Weight</TableHead>
                <TableHead className="text-muted-foreground">Check</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bag.items.map((item) => {
                const check = checks[item.tracking] ?? {};
                // Names and photos come from the package itself.
                const pkg = { ...item, ...item.package };
                return (
                  <TableRow key={item.tracking}>
                    <TableCell>
                      <Checkbox
                        aria-label={`${item.tracking} received`}
                        checked={check.status === "received"}
                        onCheckedChange={(on) => tick(item.tracking, on === true)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-[13px]">{item.tracking}</TableCell>
                    <TableCell className="max-w-48">
                      <div className="flex items-center gap-2">
                        <PackagePhotoThumb pkg={pkg} />
                        <span className="min-w-0 truncate" title={packageName(pkg)}>
                          {packageName(pkg) || <span className="text-muted-foreground">—</span>}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-40 truncate" title={item.receiver}>{item.receiver}</TableCell>
                    <TableCell className="text-right font-mono">{kg(item.weight)}</TableCell>
                    <TableCell>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        size="sm"
                        aria-label={`Check ${item.tracking}`}
                        value={check.status ?? ""}
                        onValueChange={(value) => setChecks((current) => ({ ...current, [item.tracking]: { status: value || undefined } }))}
                      >
                        {VERIFICATION.map((option) => (
                          <ToggleGroupItem
                            key={option.value}
                            value={option.value}
                            className={`px-2 text-xs data-[state=on]:font-semibold ${TOGGLE_TONES[option.value]}`}
                          >
                            {option.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {discrepancies > 0 && (
          // Red when something is missing, amber when it's only damage. Only counts above zero show.
          <div
            role="status"
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
              counts.missing ? "border-status-bad/25 bg-status-bad/5" : "border-status-warn/25 bg-status-warn/5"
            }`}
          >
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full ${
                counts.missing ? "bg-status-bad/15 text-status-bad" : "bg-status-warn/15 text-status-warn"
              }`}
            >
              <CircleAlert className="size-4" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex flex-wrap gap-1.5">
                {counts.missing > 0 && (
                  <span className="rounded-full bg-status-bad/15 px-2.5 py-0.5 text-xs font-semibold text-status-bad">
                    {counts.missing} missing
                  </span>
                )}
                {counts.damaged > 0 && (
                  <span className="rounded-full bg-status-warn/15 px-2.5 py-0.5 text-xs font-semibold text-status-warn">
                    {counts.damaged} damaged
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">A manager will follow up after you receive the box.</p>
            </div>
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Receive ${bag.code}?`}
        description={`Receiving the box at ${branchShort(bag.destination)} now. It can't be undone.`}
        confirmLabel="Receive"
        onConfirm={async () => {
          const verifications = Object.fromEntries(
            bag.items.map((item) => [item.tracking, { status: checks[item.tracking]?.status }]),
          );
          const response = await bagRequest(`/api/bags/${bag.code}`, { method: "POST", body: { action: "receive", verifications } });
          await onReceived(response);
        }}
      >
        <div className="max-h-72 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-muted-foreground">Tracking #</TableHead>
                <TableHead className="text-muted-foreground">Package</TableHead>
                <TableHead className="text-muted-foreground">Next step</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Problems first, so they're seen before confirming. */}
              {[...bag.items]
                .sort((a, b) => NEXT_STEP_ORDER[checks[a.tracking]?.status] - NEXT_STEP_ORDER[checks[b.tracking]?.status])
                .map((item) => {
                  const pkg = { ...item, ...item.package };
                  const next = NEXT_STEPS[checks[item.tracking]?.status];
                  return (
                    <TableRow key={item.tracking}>
                      <TableCell className="font-mono text-xs">{item.tracking}</TableCell>
                      <TableCell className="max-w-44 text-xs">
                        <div className="flex items-center gap-2">
                          <PackagePhotoThumb pkg={pkg} />
                          <span className="min-w-0 truncate" title={packageName(pkg)}>
                            {packageName(pkg) || <span className="text-muted-foreground">—</span>}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {next && (
                          <span className={`text-xs font-semibold whitespace-nowrap ${next.className}`}>
                            {next.label}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </ConfirmDialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Exceptions

// ---------------------------------------------------------------------------------------------

export function BagDetail({ code }) {
  const profile = useProfile();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [load, setLoad] = useState({ state: "loading" });
  const [notice, setNotice] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({ notes: "", reason: "" });
  const [printing, setPrinting] = useState(false);

  const reload = useCallback(async () => {
    try {
      const result = await bagRequest(`/api/bags/${encodeURIComponent(code)}`);
      setData(result);
      setLoad({ state: "ready" });
    } catch (error) {
      setLoad({ state: "error", message: error.message, status: error.status });
    }
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    bagRequest(`/api/bags/${encodeURIComponent(code)}`)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoad({ state: "ready" });
      })
      .catch((error) => !cancelled && setLoad({ state: "error", message: error.message, status: error.status }));
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!data) {
    return (
      <div className="grid flex-1 place-items-center p-10 text-center">
        {load.state === "error" ? (
          <div className="flex flex-col items-center gap-3">
            <p className={load.status === 404 ? "text-muted-foreground" : "text-status-bad"}>
              {load.status === 404 ? `Box ${code} wasn't found, or it isn't one your branch handles.` : `Couldn't load the box: ${load.message}`}
            </p>
            <Button asChild variant="outline">
              <Link href="/admin/bags">Back to boxes</Link>
            </Button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Loading box…
          </span>
        )}
      </div>
    );
  }

  const { bag, access } = data;
  const status = bag.status;
  const allowed = {
    fill: status === BAG_STATUS.OPEN && access.origin && can(profile, "bags.create"),
    cancel: [BAG_STATUS.OPEN, BAG_STATUS.READY_FOR_DISPATCH].includes(status) && access.origin && can(profile, "bags.create"),
    reopen: status === BAG_STATUS.READY_FOR_DISPATCH && can(profile, "bags.resolve"),
    dispatch: status === BAG_STATUS.READY_FOR_DISPATCH && access.origin && can(profile, "bags.dispatch"),
    receive: status === BAG_STATUS.IN_TRANSIT && access.destination && can(profile, "bags.receive"),
  };

  // Never held a package: cancelling deletes it outright (the server decides the same way).
  const empty = !bag.items.length && !bag.events?.some((event) => event.type === "packages_added");

  // `message` is optional: some changes speak for themselves (the status badge updates).
  async function act(action, body, message) {
    await bagRequest(`/api/bags/${bag.code}`, { method: "POST", body: { action, ...body } });
    await reload();
    setNotice(message ? { text: message, tone: "good" } : null);
  }

  async function printManifest() {
    setPrinting(true);
    try {
      const { buildManifestPdf, openPdf } = await import("@/lib/bag-pdf");
      openPdf(await buildManifestPdf(bag), `${bag.code}-manifest.pdf`);
    } catch (error) {
      setNotice({ text: `Couldn't build the PDF: ${error.message}`, tone: "bad" });
    } finally {
      setPrinting(false);
    }
  }

  const closeDialog = (open) => !open && setDialog(null);

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link href="/admin/bags" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          All boxes
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{bag.code}</h1>
          <BagStatusBadge status={status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {allowed.fill && (
            <Button onClick={() => setDialog("close")} disabled={!bag.items.length}>
              <Lock aria-hidden="true" />
              Close box
            </Button>
          )}
          {allowed.dispatch && (
            <Button onClick={() => { setForm({ notes: "", reason: "" }); setDialog("dispatch"); }}>
              <Send aria-hidden="true" />
              Dispatch box
            </Button>
          )}
          {allowed.reopen && (
            <Button variant="outline" onClick={() => { setForm((current) => ({ ...current, reason: "" })); setDialog("reopen"); }}>
              <Undo2 aria-hidden="true" />
              Reopen
            </Button>
          )}
          <Button variant="outline" onClick={printManifest} disabled={printing || !bag.items.length}>
            <FileText aria-hidden="true" />
            {printing ? "Preparing…" : "Print manifest"}
          </Button>
          {allowed.cancel && (
            <Button variant="ghost" className="text-status-bad" onClick={() => { setForm((current) => ({ ...current, reason: "" })); setDialog("cancel"); }}>
              <X aria-hidden="true" />
              {empty ? "Delete box" : "Cancel box"}
            </Button>
          )}
        </div>
        <StatusLine result={notice} onDismiss={() => setNotice(null)} />
      </div>

      {status === BAG_STATUS.IN_TRANSIT && !allowed.receive && (
        <Alert>
          <Send aria-hidden="true" />
          <AlertTitle>On its way to {branchShort(bag.destination)}</AlertTitle>
          <AlertDescription>Only the destination branch can receive this box.</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Box information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Origin branch">{branchShort(bag.origin)} <span className="text-muted-foreground">· {bag.origin.country}</span></Field>
            <Field label="Destination branch">{branchShort(bag.destination)} <span className="text-muted-foreground">· {bag.destination.country}</span></Field>
            <Field label="Packages">{plural(bag.items.length, "package")} · {kg(bagWeight(bag.items))}</Field>
            <Field label="Status"><BagStatusBadge status={status} /></Field>
            <Field label="Created">{byLine(bag.createdAt, bag.createdBy)}</Field>
            <Field label="Closed">{byLine(bag.closedAt, bag.closedBy)}</Field>
            <Field label="Dispatched">{byLine(bag.dispatchedAt, bag.dispatchedBy)}</Field>
            <Field label="Received">{byLine(bag.receivedAt, bag.receivedBy)}</Field>
            {bag.dispatch?.transportRef && <Field label="Transport reference">{bag.dispatch.transportRef}</Field>}
            {bag.dispatch?.carrier && <Field label="Vehicle or carrier">{bag.dispatch.carrier}</Field>}
            {bag.dispatch?.notes && <Field label="Dispatch notes">{bag.dispatch.notes}</Field>}
            {bag.receipt && (
              <Field label="Receipt">
                {bag.receipt.received} of {bag.receipt.expected} received
                {bag.receipt.missing ? `, ${bag.receipt.missing} missing` : ""}
                {bag.receipt.damaged ? `, ${bag.receipt.damaged} damaged` : ""}
              </Field>
            )}
            {bag.receipt?.notes && <Field label="Receiving notes">{bag.receipt.notes}</Field>}
            {bag.cancelledAt && <Field label="Cancelled">{byLine(bag.cancelledAt, bag.cancelledBy)} · {bag.cancelReason}</Field>}
            {bag.notes && <Field label="Notes">{bag.notes}</Field>}
          </dl>
        </CardContent>
      </Card>

      {allowed.fill && (
        <AddPackagesPanel bag={bag} onChanged={reload} />
      )}
      {!allowed.fill && !allowed.receive && (
        <Card>
          <CardContent>
            <BagPackagesTable bag={bag} />
          </CardContent>
        </Card>
      )}
      {allowed.receive && (
        <ReceivePanel
          bag={bag}
          onReceived={async ({ status: next }) => {
            await reload();
            setNotice({
              text: next === BAG_STATUS.EXCEPTION ? "Box received. Exceptions were recorded for the box." : "Box received. Every package is ready for pickup.",
              tone: next === BAG_STATUS.EXCEPTION ? "warn" : "good",
            });
          }}
        />
      )}

      <ConfirmDialog
        open={dialog === "close"}
        onOpenChange={closeDialog}
        title={<>Close box <span className="font-mono">{bag.code}</span>?</>}
        description="The box will be ready for dispatch."
        confirmLabel={`Close with ${plural(bag.items.length, "package")}`}
        onConfirm={() => act("close", {})}
      >
        <ManifestSummary bag={bag} />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "dispatch"}
        onOpenChange={closeDialog}
        title="Dispatch this box?"
        description={`Every package inside moves to In transit now, recorded under your name.`}
        confirmLabel="Dispatch"
        onConfirm={() => act("dispatch", { notes: form.notes }, `Box dispatched. ${plural(bag.items.length, "package")} now in transit.`)}
      >
        <dl className="grid grid-cols-2 gap-3 rounded-md border bg-muted/40 p-3">
          <Field label="Box">{bag.code}</Field>
          <Field label="Packages">{plural(bag.items.length, "package")} · {kg(bagWeight(bag.items))}</Field>
          <Field label="From">{branchShort(bag.origin)}</Field>
          <Field label="To">{branchShort(bag.destination)}</Field>
          <Field label="Dispatched by">{profile.name}</Field>
          <Field label="Date and time">Now</Field>
        </dl>
        <div className="grid gap-2">
          <Label htmlFor="dispatch-notes">Notes (optional)</Label>
          <Textarea id="dispatch-notes" rows={2} maxLength={1000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "reopen"}
        onOpenChange={closeDialog}
        title="Reopen this box?"
        description="Staff at the origin can add and remove packages again. The reason is kept in the box's history."
        confirmLabel="Reopen"
        disabled={!form.reason.trim()}
        onConfirm={() => act("reopen", { reason: form.reason }, "Box reopened.")}
      >
        <div className="grid gap-2">
          <Label htmlFor="reopen-reason">Reason</Label>
          <Textarea id="reopen-reason" rows={2} maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "cancel"}
        onOpenChange={closeDialog}
        title={empty ? "Delete this empty box?" : "Cancel this box?"}
        description={
          empty
            ? `${bag.code} has never held a package, so it is removed completely and leaves no history.`
            : "Its packages are released and can go into another box. The box keeps its history."
        }
        confirmLabel={empty ? "Delete box" : "Cancel box"}
        destructive
        disabled={!empty && !form.reason.trim()}
        onConfirm={async () => {
          if (empty) {
            await bagRequest(`/api/bags/${bag.code}`, { method: "POST", body: { action: "cancel" } });
            router.replace("/admin/bags");
            return;
          }
          await act("cancel", { reason: form.reason }, "Box cancelled. Its packages were released.");
        }}
      >
        {!empty && (
          <div className="grid gap-2">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Textarea id="cancel-reason" rows={2} maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
          </div>
        )}
      </ConfirmDialog>

    </>
  );
}
