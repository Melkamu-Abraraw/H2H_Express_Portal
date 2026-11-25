"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Eye, LoaderCircle, Plus, Search } from "lucide-react";
import { DateRangePicker, useToday } from "@/components/admin/date-range-picker";
import { useProfile } from "@/components/admin/profile-store";
import { ALL, Filter } from "@/components/admin/table-filters";
import {
  BagStatusBadge,
  bagRequest,
  bagUrl,
  branchShort,
  kg,
  when,
} from "@/components/admin/bag-ui";
import { BAG_STATUS, BAG_STATUSES } from "@/lib/bags";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const STAT_CARDS = [
  { key: "total", label: "Total boxes", status: null, dot: "bg-muted-foreground", detail: "Every box you can see" },
  { key: BAG_STATUS.OPEN, label: "Open", status: BAG_STATUS.OPEN, detail: "Being filled" },
  { key: BAG_STATUS.READY_FOR_DISPATCH, label: "Ready for dispatch", status: BAG_STATUS.READY_FOR_DISPATCH, detail: "Closed, waiting to leave" },
  { key: BAG_STATUS.IN_TRANSIT, label: "In transit", status: BAG_STATUS.IN_TRANSIT, detail: "On the way" },
  { key: BAG_STATUS.RECEIVED, label: "Received", status: BAG_STATUS.RECEIVED, detail: "Checked in at destination" },
];

const cardClass =
  "flex flex-col gap-1 rounded-xl border bg-card p-4 text-left text-card-foreground shadow-xs transition-colors outline-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-ring aria-pressed:ring-1 aria-pressed:ring-ring";

// Cancelled bags aren't listed, and bags received with problems count as Received.
const statusOptions = [
  { value: ALL, label: "All statuses" },
  ...BAG_STATUSES.filter(({ value }) => value !== BAG_STATUS.CANCELLED && value !== BAG_STATUS.EXCEPTION).map(({ value, label }) => ({ value, label })),
];

const DATE_FIELDS = [
  { value: "created", label: "Created" },
  { value: "dispatched", label: "Dispatched" },
  { value: "received", label: "Received" },
];

const COLUMNS = [
  { key: "code", label: "Box" },
  { key: "origin", label: "Origin" },
  { key: "destination", label: "Destination" },
  { key: "packages", label: "Packages", align: "right" },
  { key: "weight", label: "Weight", align: "right" },
  { key: "status", label: "Status" },
  { key: null, label: "Created by" },
  { key: "created", label: "Created" },
  { key: "dispatched", label: "Dispatched" },
];

// The next thing to do with a bag, from where the user sits.
function nextAction(bag, profile) {
  const own = profile.branch?.code;
  const atOrigin = !own || own === bag.origin.code;
  const atDestination = !own || own === bag.destination.code || can(profile, "bags.resolve");
  if (bag.status === BAG_STATUS.OPEN && atOrigin && can(profile, "bags.create")) return "Add packages";
  if (bag.status === BAG_STATUS.READY_FOR_DISPATCH && atOrigin && can(profile, "bags.dispatch")) return "Dispatch";
  if (bag.status === BAG_STATUS.IN_TRANSIT && atDestination && can(profile, "bags.receive")) return "Receive";
  // Everything else, including received bags, is view only.
  return "View";
}

function SortHeader({ column, sort, onSort, className = "" }) {
  if (!column.key) return <TableHead className={`text-muted-foreground ${className}`}>{column.label}</TableHead>;
  const active = sort.key === column.key;
  const Icon = sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={`text-muted-foreground ${column.align === "right" ? "text-right" : ""} ${className}`}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {column.label}
        {active && <Icon className="size-3.5" aria-hidden="true" />}
      </button>
    </TableHead>
  );
}

function CreateBagDialog({ open, onOpenChange, branches, profile }) {
  const router = useRouter();
  const own = profile.branch?.code;
  const originOptions = own ? branches.filter((branch) => branch.code === own) : branches;
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [state, setState] = useState({ busy: false, error: "" });
  const originCode = own ?? (origin || originOptions[0]?.code || "");
  const from = branches.find((branch) => branch.code === originCode);
  const destinations = branches.filter((branch) => from && branch.countryCode !== from.countryCode);

  async function submit(event) {
    event.preventDefault();
    if (state.busy) return;
    setState({ busy: true, error: "" });
    try {
      const { bag } = await bagRequest("/api/bags", { method: "POST", body: { origin: originCode, destination, notes } });
      router.push(bagUrl(bag.code));
    } catch (error) {
      setState({ busy: false, error: error.message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Create a box</DialogTitle>
          </DialogHeader>
          <div className="grid flex-1 content-start gap-4 overflow-y-auto border-y p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid min-w-0 content-start gap-2">
                <Label htmlFor="bag-origin">Origin branch</Label>
                {own ? (
                  <Input id="bag-origin" value={branchShort(profile.branch)} readOnly className="bg-muted/50" />
                ) : (
                  <Select value={originCode} onValueChange={(value) => { setOrigin(value); setDestination(""); }}>
                    <SelectTrigger id="bag-origin" className="w-full">
                      <SelectValue placeholder="Choose a branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {originOptions.map((branch) => (
                        <SelectItem key={branch.code} value={branch.code}>
                          {branchShort(branch)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {own && !from && (
                  <p className="text-xs text-status-bad">Your branch isn&apos;t on any route, so it can&apos;t send boxes.</p>
                )}
              </div>
              <div className="grid min-w-0 content-start gap-2">
                <Label htmlFor="bag-destination">Destination branch</Label>
                <Select value={destination} onValueChange={setDestination}>
                  <SelectTrigger id="bag-destination" className="w-full">
                    <SelectValue placeholder="Choose where it's going" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinations.map((branch) => (
                      <SelectItem key={branch.code} value={branch.code}>
                        {branchShort(branch)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bag-notes">Notes (optional)</Label>
              <Textarea id="bag-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} />
            </div>
            {state.error && <p role="alert" className="text-sm text-status-bad">{state.error}</p>}
          </div>
          <DialogFooter className="flex-row justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={state.busy || !originCode || !destination}>
              {state.busy ? "Creating…" : "Create box"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BagsView() {
  const profile = useProfile();
  const today = useToday();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(ALL);
  const [origin, setOrigin] = useState(ALL);
  const [destination, setDestination] = useState(ALL);
  const [dateField, setDateField] = useState("created");
  const [range, setRange] = useState(null);
  // "priority" (no column picked): open bags first, then bags to review, then the rest.
  const [sort, setSort] = useState({ key: "priority", dir: "asc" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [load, setLoad] = useState({ state: "loading" });
  const [creating, setCreating] = useState(false);

  // Wait for typing to pause before searching.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ sort: sort.key, dir: sort.dir, page: String(page), pageSize: "20" });
    if (query) params.set("q", query);
    if (status !== ALL) params.set("status", status);
    if (origin !== ALL) params.set("origin", origin);
    if (destination !== ALL) params.set("destination", destination);
    if (range?.from) {
      params.set(`${dateField}From`, format(range.from, "yyyy-MM-dd"));
      params.set(`${dateField}To`, format(range.to ?? range.from, "yyyy-MM-dd"));
    }
    function fetchBags(first) {
      bagRequest(`/api/bags?${params}`)
        .then((result) => {
          if (cancelled) return;
          setData(result);
          setLoad({ state: "ready" });
        })
        .catch((error) => first && !cancelled && setLoad({ state: "error", message: error.message }));
    }
    fetchBags(true);
    const timer = setInterval(() => document.visibilityState === "visible" && fetchBags(false), 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [query, status, origin, destination, dateField, range, sort, page]);

  const branches = data?.branches ?? [];
  const branchOptions = (label) => [{ value: ALL, label }, ...branches.map((branch) => ({ value: branch.code, label: branch.name }))];
  const filtered = query || status !== ALL || origin !== ALL || destination !== ALL || range;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function change(setter) {
    return (value) => {
      setter(value);
      setPage(1);
    };
  }

  function onSort(key) {
    setSort((current) => ({ key, dir: current.key === key && current.dir === "desc" ? "asc" : "desc" }));
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setStatus(ALL);
    setOrigin(ALL);
    setDestination(ALL);
    setRange(null);
    setPage(1);
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Boxes</h1>
        {can(profile, "bags.create") && (
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            Create box
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {STAT_CARDS.map((card) => {
          const info = BAG_STATUSES.find((item) => item.value === card.status);
          const active = Boolean(card.status) && status === card.status;
          return (
            <button
              key={card.key}
              type="button"
              aria-pressed={active}
              onClick={() => change(setStatus)(card.status && !active ? card.status : ALL)}
              className={cardClass}
            >
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <span className={`size-2 rounded-full ${info?.dot ?? card.dot}`} aria-hidden="true" />
                {card.label}
              </span>
              <span className="font-mono text-2xl font-semibold tracking-tight">
                {data ? data.stats[card.key] ?? 0 : "–"}
              </span>
              <span className="mt-auto text-sm text-muted-foreground">
                {card.detail}
              </span>
            </button>
          );
        })}
      </div>

      <Card className="min-w-0 pb-0">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:w-auto sm:min-w-48 sm:max-w-xs sm:flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Search by box reference"
              placeholder="Search box reference..."
              className="pl-8 font-mono"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Filter label="Filter by status" value={status} onChange={change(setStatus)} options={statusOptions} />
          <Filter label="Filter by origin branch" value={origin} onChange={change(setOrigin)} options={branchOptions("All origins")} />
          <Filter label="Filter by destination branch" value={destination} onChange={change(setDestination)} options={branchOptions("All destinations")} />
          <div className="flex w-full gap-2 sm:w-auto">
            <Filter label="Which date to filter by" value={dateField} onChange={change(setDateField)} options={DATE_FIELDS} className="w-32 sm:w-32" />
            <DateRangePicker value={range} onChange={change(setRange)} today={today} placeholder="All time" />
          </div>
          {filtered && (
            <Button variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          )}
          <p role="status" className="text-sm text-muted-foreground sm:ml-auto">
            <span className="font-mono">{data?.total ?? 0}</span> {data?.total === 1 ? "box" : "boxes"}
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table className="[&_td:not(:first-child):not(:last-child)]:px-2 [&_th:not(:first-child):not(:last-child)]:px-2">
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((column, index) => (
                    <SortHeader key={column.label} column={column} sort={sort} onSort={onSort} className={index === 0 ? "pl-4" : ""} />
                  ))}
                  <TableHead className="pr-4 text-right text-muted-foreground">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.bags.map((bag) => (
                  <TableRow key={bag.code} className="h-12">
                    <TableCell className="pl-4 font-mono text-[13px]">
                      <Link href={bagUrl(bag.code)} className="hover:underline">
                        {bag.code}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-40 truncate" title={bag.origin.name}>{branchShort(bag.origin)}</TableCell>
                    <TableCell className="max-w-40 truncate" title={bag.destination.name}>{branchShort(bag.destination)}</TableCell>
                    <TableCell className="text-right font-mono">{bag.totalPackages}</TableCell>
                    <TableCell className="text-right font-mono">{kg(bag.totalWeight)}</TableCell>
                    <TableCell>
                      <BagStatusBadge status={bag.status} />
                    </TableCell>
                    <TableCell className="max-w-32 truncate">{bag.createdBy?.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{when(bag.createdAt, "MMM d, HH:mm")}</TableCell>
                    <TableCell className="whitespace-nowrap">{bag.dispatchedAt ? when(bag.dispatchedAt, "MMM d, HH:mm") : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="pr-4 text-right">
                      {nextAction(bag, profile) === "View" ? (
                        <Button asChild size="icon-sm" variant="ghost" title="View box">
                          <Link href={bagUrl(bag.code)} aria-label={`View ${bag.code}`}>
                            <Eye aria-hidden="true" />
                          </Link>
                        </Button>
                      ) : (
                        <Button asChild size="sm" variant="outline">
                          <Link href={bagUrl(bag.code)}>{nextAction(bag, profile)}</Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(!data || data.bags.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length + 1} className={`h-32 text-center ${load.state === "error" ? "text-status-bad" : "text-muted-foreground"}`}>
                      {load.state === "loading" ? (
                        <span className="inline-flex items-center gap-2">
                          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                          Loading boxes…
                        </span>
                      ) : load.state === "error" ? (
                        `Couldn't load boxes: ${load.message}`
                      ) : filtered ? (
                        "No boxes match your filters."
                      ) : (
                        "No boxes yet. Create one to start grouping packages for transport."
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 border-t px-4 py-2 text-sm">
              <span className="text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      {creating && <CreateBagDialog open={creating} onOpenChange={setCreating} branches={branches} profile={profile} />}
    </>
  );
}
