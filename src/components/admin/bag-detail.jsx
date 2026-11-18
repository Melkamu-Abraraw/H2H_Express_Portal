"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CircleAlert,
  FileText,
  History,
  LoaderCircle,
  Lock,
  Search,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { currentStepLabel } from "@/components/admin/package-tracking";
import { statusDots } from "@/components/admin/package-views";
import { PackageHistory } from "@/components/admin/package-history";
import { useProfile } from "@/components/admin/profile-store";
import {
  BagStatusBadge,
  StatusLine,
  bagRequest,
  kg,
  when,
} from "@/components/admin/bag-ui";
import { BAG_STATUS, EXCEPTION_TYPES, RESOLUTIONS, VERIFICATION, bagWeight } from "@/lib/bags";
import { can } from "@/lib/permissions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const EVENT_LABELS = {
  created: "Bag created",
  packages_added: "Packages added",
  package_removed: "Package removed",
  closed: "Closed · ready for dispatch",
  reopened: "Reopened for changes",
  cancelled: "Cancelled",
  dispatched: "Dispatched · in transit",
  received: "Received at destination",
  exceptions_resolved: "All exceptions resolved",
};

// Written out in full so Tailwind sees each class.
const TOGGLE_TONES = {
  received: "data-[state=on]:text-status-good",
  missing: "data-[state=on]:text-status-bad",
  damaged: "data-[state=on]:text-status-warn",
};

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

function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, disabled, children, destructive }) {
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
      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <span>
          <span className="font-mono font-semibold">{bag.code}</span>
          <span className="text-muted-foreground"> · {bag.origin.name} → {bag.destination.name}</span>
        </span>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-md border">
        <Table>
          <TableBody>
            {bag.items.map((item) => (
              <TableRow key={item.tracking}>
                <TableCell className="font-mono text-xs">{item.tracking}</TableCell>
                <TableCell className="max-w-40 truncate text-xs">{item.receiver}</TableCell>
                <TableCell className="text-right font-mono text-xs">{kg(item.weight)}</TableCell>
              </TableRow>
            ))}
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
        <CardDescription>
          Packages received at {bag.origin.name}, going to {bag.destination.country}, and not in another bag.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <StatusLine result={result} onDismiss={() => setResult(null)} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Search eligible packages"
              placeholder="Search tracking # or name..."
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
                <TableHead className="text-muted-foreground">Customer</TableHead>
                <TableHead className="text-muted-foreground">Destination</TableHead>
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
                  <TableCell className="max-w-48 truncate" title={`${row.sender} → ${row.receiver}`}>
                    {row.sender} <span className="text-muted-foreground">→</span> {row.receiver}
                  </TableCell>
                  <TableCell>{row.to}</TableCell>
                  <TableCell className="text-right font-mono">{kg(row.weight)}</TableCell>
                  <TableCell>{row.status}</TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={6} className={`h-20 text-center ${eligible.state === "error" ? "text-status-bad" : "text-muted-foreground"}`}>
                    {eligible.state === "loading"
                      ? "Loading packages…"
                      : eligible.state === "error"
                        ? `Couldn't load packages: ${eligible.message}`
                        : term
                          ? "No eligible packages match."
                          : "No packages are waiting for this bag."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// The manifest

function HistoryButton({ pkg }) {
  if (!pkg) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`History of ${pkg.tracking}`}>
          <History aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-(--radix-popover-content-available-height) w-[calc(100vw-2rem)] max-w-96 overflow-y-auto">
        <p className="mb-3 font-mono text-sm font-semibold">{pkg.tracking}</p>
        <PackageHistory pkg={pkg} />
      </PopoverContent>
    </Popover>
  );
}

function ManifestTable({ bag, canRemove, onRemove }) {
  const [term, setTerm] = useState("");
  const [removing, setRemoving] = useState("");
  const q = term.trim().toLowerCase();
  const rows = bag.items.filter(
    (item) => !q || [item.tracking, item.sender, item.receiver].some((value) => value?.toLowerCase().includes(q)),
  );
  const showCheck = bag.items.some((item) => item.verification);

  return (
    <Card className="min-w-0 pb-0">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div>
          <CardTitle>Package manifest</CardTitle>
          <CardDescription>
            {plural(bag.items.length, "package")} · {kg(bagWeight(bag.items))}
          </CardDescription>
        </div>
        <div className="relative w-full sm:ml-auto sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" aria-label="Search the manifest" placeholder="Search manifest..." className="pl-8" value={term} onChange={(event) => setTerm(event.target.value)} />
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 text-muted-foreground">Tracking #</TableHead>
                <TableHead className="text-muted-foreground">Customer</TableHead>
                <TableHead className="text-muted-foreground">Destination</TableHead>
                <TableHead className="text-right text-muted-foreground">Weight</TableHead>
                <TableHead className="text-muted-foreground">Current status</TableHead>
                {showCheck && <TableHead className="text-muted-foreground">Checked as</TableHead>}
                <TableHead className="pr-4 text-right text-muted-foreground">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => {
                const pkg = item.package;
                const check = VERIFICATION.find((option) => option.value === item.verification);
                return (
                  <TableRow key={item.tracking} className="h-12">
                    <TableCell className="pl-4 font-mono text-[13px]">
                      <Link href={`/admin/packages?q=${encodeURIComponent(item.tracking)}`} className="hover:underline">
                        {item.tracking}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-56 truncate" title={`${item.sender} → ${item.receiver}`}>
                      {item.sender} <span className="text-muted-foreground">→</span> {item.receiver}
                    </TableCell>
                    <TableCell>{item.to}</TableCell>
                    <TableCell className="text-right font-mono">{kg(item.weight)}</TableCell>
                    <TableCell>
                      {pkg ? (
                        <span className="inline-flex flex-wrap items-center gap-1">
                          <Badge variant="outline">
                            <span className={`size-1.5 rounded-full ${statusDots[pkg.status]}`} aria-hidden="true" />
                            {currentStepLabel(pkg)}
                          </Badge>
                          {pkg.exception && (
                            <Badge variant="outline" className="border-status-bad/40 text-status-bad">
                              {EXCEPTION_TYPES[pkg.exception.type]}
                            </Badge>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not found</span>
                      )}
                    </TableCell>
                    {showCheck && (
                      <TableCell>
                        <span className={check?.tone}>{check?.label ?? "—"}</span>
                        {item.verificationNotes && <span className="block max-w-48 truncate text-xs text-muted-foreground" title={item.verificationNotes}>{item.verificationNotes}</span>}
                      </TableCell>
                    )}
                    <TableCell className="pr-4">
                      <div className="flex justify-end gap-1">
                        <HistoryButton pkg={pkg} />
                        {canRemove && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${item.tracking} from the bag`}
                            disabled={removing === item.tracking}
                            onClick={async () => {
                              setRemoving(item.tracking);
                              await onRemove(item.tracking);
                              setRemoving("");
                            }}
                          >
                            {removing === item.tracking ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {bag.items.length ? "No packages match your search." : "This bag is empty. Add packages above."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Receiving: every package is checked before the receipt is completed.

function ReceivePanel({ bag, onReceived }) {
  const [checks, setChecks] = useState({});
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);

  const set = (tracking, patch) => setChecks((current) => ({ ...current, [tracking]: { ...current[tracking], ...patch } }));
  const counts = Object.fromEntries(VERIFICATION.map(({ value }) => [value, bag.items.filter((item) => checks[item.tracking]?.status === value).length]));
  const unchecked = bag.items.filter((item) => !checks[item.tracking]?.status).length;
  const discrepancies = counts.missing + counts.damaged;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receive this bag</CardTitle>
        <CardDescription>
          Check each package as you take it out. A package is only ready for pickup once it&apos;s checked here.
        </CardDescription>
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
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" disabled={!Object.keys(checks).length} onClick={() => setChecks({})}>
            Reset
          </Button>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-muted-foreground">Tracking #</TableHead>
                <TableHead className="text-muted-foreground">Receiver</TableHead>
                <TableHead className="text-right text-muted-foreground">Weight</TableHead>
                <TableHead className="text-muted-foreground">Check</TableHead>
                <TableHead className="text-muted-foreground">Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bag.items.map((item) => {
                const check = checks[item.tracking] ?? {};
                return (
                  <TableRow key={item.tracking}>
                    <TableCell className="font-mono text-[13px]">{item.tracking}</TableCell>
                    <TableCell className="max-w-40 truncate">{item.receiver}</TableCell>
                    <TableCell className="text-right font-mono">{kg(item.weight)}</TableCell>
                    <TableCell>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        size="sm"
                        aria-label={`Check ${item.tracking}`}
                        value={check.status ?? ""}
                        onValueChange={(value) => set(item.tracking, { status: value || undefined })}
                      >
                        {VERIFICATION.map((option) => (
                          <ToggleGroupItem
                            key={option.value}
                            value={option.value}
                            className={`px-2 text-xs data-[state=on]:bg-sidebar-accent data-[state=on]:font-semibold ${TOGGLE_TONES[option.value]}`}
                          >
                            {option.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </TableCell>
                    <TableCell>
                      {check.status && check.status !== "received" ? (
                        <Input
                          aria-label={`What's wrong with ${item.tracking}`}
                          placeholder="What's wrong?"
                          className="h-7 min-w-40 text-xs"
                          maxLength={500}
                          value={check.notes ?? ""}
                          onChange={(event) => set(item.tracking, { notes: event.target.value })}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {discrepancies > 0 && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>
              {plural(counts.missing, "package")} missing, {counts.damaged} damaged
            </AlertTitle>
            <AlertDescription>
              These will be recorded as exceptions for a manager to investigate. Missing packages stay in transit.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid gap-2">
          <Label htmlFor="receive-notes">Receiving notes {discrepancies > 0 ? "(required)" : "(optional)"}</Label>
          <Textarea
            id="receive-notes"
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={discrepancies ? "Describe what was wrong: seal, condition, what's missing…" : "Seal intact, anything worth noting…"}
          />
        </div>
        <div className="flex justify-end">
          <Button disabled={unchecked > 0 || (discrepancies > 0 && !notes.trim())} onClick={() => setConfirming(true)}>
            Complete receipt
          </Button>
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Receive ${bag.code}?`}
        description={`This records you as receiving the bag at ${bag.destination.name} now. It can't be undone.`}
        confirmLabel={discrepancies ? "Receive with exceptions" : "Receive bag"}
        onConfirm={async () => {
          const verifications = Object.fromEntries(
            bag.items.map((item) => [item.tracking, { status: checks[item.tracking]?.status, notes: checks[item.tracking]?.notes ?? "" }]),
          );
          const response = await bagRequest(`/api/bags/${bag.code}`, { method: "POST", body: { action: "receive", verifications, notes } });
          await onReceived(response);
        }}
      >
        <ul className="grid gap-1 text-sm">
          <li>{plural(counts.received, "package")} received → ready for pickup</li>
          {counts.damaged > 0 && <li className="text-status-warn">{counts.damaged} damaged → ready for pickup and flagged</li>}
          {counts.missing > 0 && <li className="text-status-bad">{counts.missing} missing → stay in transit and flagged</li>}
        </ul>
      </ConfirmDialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Exceptions

function ExceptionsCard({ exceptions, canResolve, onResolved }) {
  const [resolving, setResolving] = useState(null);
  const [resolution, setResolution] = useState("");
  const [notes, setNotes] = useState("");
  if (!exceptions.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exceptions</CardTitle>
        <CardDescription>Problems found when the bag was opened. The original dispatch record is kept as is.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {exceptions.map((exception) => (
          <div key={exception._id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{exception.tracking}</span>
                <Badge variant="outline" className={exception.type === "missing" ? "border-status-bad/40 text-status-bad" : "border-status-warn/40 text-status-warn"}>
                  {EXCEPTION_TYPES[exception.type]}
                </Badge>
                <Badge variant="outline" className={exception.status === "open" ? "" : "text-status-good"}>
                  {exception.status === "open" ? "Open" : "Resolved"}
                </Badge>
              </span>
              {exception.description && <span className="text-muted-foreground">{exception.description}</span>}
              <span className="text-xs text-muted-foreground">
                Reported {byLine(exception.createdAt, exception.reportedBy)}
              </span>
              {exception.status !== "open" && (
                <span className="text-xs text-muted-foreground">
                  {RESOLUTIONS[exception.type]?.find((option) => option.value === exception.resolution)?.label} · {byLine(exception.resolvedAt, exception.resolvedBy)}
                  {exception.resolutionNotes ? ` · ${exception.resolutionNotes}` : ""}
                </span>
              )}
            </div>
            {canResolve && exception.status === "open" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setResolving(exception);
                  setResolution(RESOLUTIONS[exception.type][0].value);
                  setNotes("");
                }}
              >
                Resolve
              </Button>
            )}
          </div>
        ))}
      </CardContent>
      {resolving && (
        <ConfirmDialog
          open={Boolean(resolving)}
          onOpenChange={(open) => !open && setResolving(null)}
          title={`Resolve ${EXCEPTION_TYPES[resolving.type].toLowerCase()}`}
          description={`${resolving.tracking}. This is recorded on the package's history.`}
          confirmLabel="Resolve"
          disabled={!notes.trim() || !resolution}
          onConfirm={async () => {
            await bagRequest(`/api/bags/exceptions/${resolving._id}`, { method: "POST", body: { resolution, notes } });
            await onResolved();
          }}
        >
          <ToggleGroup type="single" variant="outline" className="w-full" value={resolution} onValueChange={(value) => value && setResolution(value)}>
            {RESOLUTIONS[resolving.type].map((option) => (
              <ToggleGroupItem key={option.value} value={option.value} className="flex-1 text-xs data-[state=on]:border-brand data-[state=on]:bg-sidebar-accent">
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="grid gap-2">
            <Label htmlFor="resolve-notes">What happened</Label>
            <Textarea id="resolve-notes" rows={3} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        </ConfirmDialog>
      )}
    </Card>
  );
}

function BagTimeline({ events }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bag history</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col">
          {[...events].reverse().map((event, index, list) => (
            <li key={`${event.type}-${event.at}-${index}`} className="relative flex gap-3 pb-3 last:pb-0">
              {index < list.length - 1 && <span className="absolute top-3 left-[4.5px] h-full w-px bg-muted-foreground/30" aria-hidden="true" />}
              <span className={`relative mt-1.5 size-2.5 shrink-0 rounded-full ${index === 0 ? "bg-brand ring-4 ring-brand/25" : "bg-status-good"}`} aria-hidden="true" />
              <div className="flex min-w-0 flex-col text-sm">
                <span>
                  {EVENT_LABELS[event.type] ?? event.type}
                  {event.count ? ` (${event.count})` : ""}
                  {event.trackings?.length === 1 && event.type === "package_removed" && <span className="font-mono text-xs text-muted-foreground"> · {event.trackings[0]}</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {when(event.at)} · {event.by?.name}
                </span>
                {event.notes && <span className="text-xs break-words text-muted-foreground italic">{event.notes}</span>}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------

export function BagDetail({ code }) {
  const profile = useProfile();
  const [data, setData] = useState(null);
  const [load, setLoad] = useState({ state: "loading" });
  const [notice, setNotice] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({ transportRef: "", carrier: "", notes: "", reason: "" });
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
              {load.status === 404 ? `Bag ${code} wasn't found, or it isn't one your branch handles.` : `Couldn't load the bag: ${load.message}`}
            </p>
            <Button asChild variant="outline">
              <Link href="/admin/bags">Back to bags</Link>
            </Button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Loading bag…
          </span>
        )}
      </div>
    );
  }

  const { bag, exceptions, access } = data;
  const status = bag.status;
  const allowed = {
    fill: status === BAG_STATUS.OPEN && access.origin && can(profile, "bags.create"),
    cancel: [BAG_STATUS.OPEN, BAG_STATUS.READY_FOR_DISPATCH].includes(status) && access.origin && can(profile, "bags.create"),
    reopen: status === BAG_STATUS.READY_FOR_DISPATCH && can(profile, "bags.resolve"),
    dispatch: status === BAG_STATUS.READY_FOR_DISPATCH && access.origin && can(profile, "bags.dispatch"),
    receive: status === BAG_STATUS.IN_TRANSIT && access.destination && can(profile, "bags.receive"),
    resolve: can(profile, "bags.resolve"),
  };

  async function act(action, body, message) {
    await bagRequest(`/api/bags/${bag.code}`, { method: "POST", body: { action, ...body } });
    await reload();
    setNotice({ text: message, tone: "good" });
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
          All bags
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{bag.code}</h1>
          <BagStatusBadge status={status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {allowed.fill && (
            <Button onClick={() => setDialog("close")} disabled={!bag.items.length}>
              <Lock aria-hidden="true" />
              Close bag
            </Button>
          )}
          {allowed.dispatch && (
            <Button onClick={() => { setForm({ transportRef: "", carrier: "", notes: "", reason: "" }); setDialog("dispatch"); }}>
              <Send aria-hidden="true" />
              Dispatch bag
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
              Cancel bag
            </Button>
          )}
        </div>
        <StatusLine result={notice} onDismiss={() => setNotice(null)} />
      </div>

      {status === BAG_STATUS.IN_TRANSIT && !allowed.receive && (
        <Alert>
          <Send aria-hidden="true" />
          <AlertTitle>On its way to {bag.destination.name}</AlertTitle>
          <AlertDescription>Only the destination branch can receive this bag.</AlertDescription>
        </Alert>
      )}
      {status === BAG_STATUS.EXCEPTION && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Received with exceptions</AlertTitle>
          <AlertDescription>
            {bag.receipt?.missing ? `${plural(bag.receipt.missing, "package")} missing. ` : ""}
            {bag.receipt?.damaged ? `${bag.receipt.damaged} damaged. ` : ""}
            The bag is settled once every exception is resolved.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Bag information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Origin branch">{bag.origin.name} <span className="text-muted-foreground">· {bag.origin.country}</span></Field>
            <Field label="Destination branch">{bag.destination.name} <span className="text-muted-foreground">· {bag.destination.country}</span></Field>
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
      {allowed.receive ? (
        <ReceivePanel
          bag={bag}
          onReceived={async ({ status: next }) => {
            await reload();
            setNotice({
              text: next === BAG_STATUS.EXCEPTION ? "Bag received. Exceptions were recorded for investigation." : "Bag received. Every package is ready for pickup.",
              tone: next === BAG_STATUS.EXCEPTION ? "warn" : "good",
            });
          }}
        />
      ) : (
        <ManifestTable
          bag={bag}
          canRemove={allowed.fill}
          onRemove={async (tracking) => {
            try {
              await bagRequest(`/api/bags/${bag.code}/packages?tracking=${encodeURIComponent(tracking)}`, { method: "DELETE" });
              await reload();
              setNotice({ text: `Removed ${tracking} from the bag.`, tone: "good" });
            } catch (error) {
              setNotice({ text: error.message, tone: "bad" });
            }
          }}
        />
      )}
      <ExceptionsCard
        exceptions={exceptions}
        canResolve={allowed.resolve}
        onResolved={async () => {
          await reload();
          setNotice({ text: "Exception resolved.", tone: "good" });
        }}
      />
      <BagTimeline events={bag.events} />

      <ConfirmDialog
        open={dialog === "close"}
        onOpenChange={closeDialog}
        title="Close this bag?"
        description="Once closed, packages can't be added or removed. It will be ready for dispatch."
        confirmLabel={`Close with ${plural(bag.items.length, "package")}`}
        onConfirm={() => act("close", {}, "Bag closed. It's ready for dispatch.")}
      >
        <ManifestSummary bag={bag} />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "dispatch"}
        onOpenChange={closeDialog}
        title="Dispatch this bag?"
        description={`Every package inside moves to In transit now, recorded under your name.`}
        confirmLabel="Dispatch"
        onConfirm={() => act("dispatch", { transportRef: form.transportRef, carrier: form.carrier, notes: form.notes }, `Bag dispatched. ${plural(bag.items.length, "package")} now in transit.`)}
      >
        <dl className="grid grid-cols-2 gap-3 rounded-md border bg-muted/40 p-3">
          <Field label="Bag">{bag.code}</Field>
          <Field label="Packages">{plural(bag.items.length, "package")} · {kg(bagWeight(bag.items))}</Field>
          <Field label="From">{bag.origin.name}</Field>
          <Field label="To">{bag.destination.name}</Field>
          <Field label="Dispatched by">{profile.name}</Field>
          <Field label="Date and time">Now, when you confirm</Field>
        </dl>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="dispatch-ref">Transport reference (optional)</Label>
            <Input id="dispatch-ref" maxLength={120} value={form.transportRef} onChange={(event) => setForm({ ...form, transportRef: event.target.value })} placeholder="Flight, waybill…" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dispatch-carrier">Vehicle or carrier (optional)</Label>
            <Input id="dispatch-carrier" maxLength={120} value={form.carrier} onChange={(event) => setForm({ ...form, carrier: event.target.value })} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="dispatch-notes">Notes (optional)</Label>
          <Textarea id="dispatch-notes" rows={2} maxLength={1000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "reopen"}
        onOpenChange={closeDialog}
        title="Reopen this bag?"
        description="Staff at the origin can add and remove packages again. The reason is kept in the bag's history."
        confirmLabel="Reopen"
        disabled={!form.reason.trim()}
        onConfirm={() => act("reopen", { reason: form.reason }, "Bag reopened.")}
      >
        <div className="grid gap-2">
          <Label htmlFor="reopen-reason">Reason</Label>
          <Textarea id="reopen-reason" rows={2} maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "cancel"}
        onOpenChange={closeDialog}
        title="Cancel this bag?"
        description="Its packages are released and can go into another bag. The bag keeps its history."
        confirmLabel="Cancel bag"
        destructive
        disabled={!form.reason.trim()}
        onConfirm={() => act("cancel", { reason: form.reason }, "Bag cancelled. Its packages were released.")}
      >
        <div className="grid gap-2">
          <Label htmlFor="cancel-reason">Reason</Label>
          <Textarea id="cancel-reason" rows={2} maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
        </div>
      </ConfirmDialog>

    </>
  );
}
