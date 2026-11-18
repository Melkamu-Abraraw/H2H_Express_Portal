"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { LoaderCircle } from "lucide-react";
import { DateRangePicker, useToday } from "@/components/admin/date-range-picker";
import { bagRequest, bagUrl, branchShort, kg, when } from "@/components/admin/bag-ui";
import { EXCEPTION_TYPES } from "@/lib/bags";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function duration(hours) {
  if (hours === null || hours === undefined) return "—";
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

function Stat({ label, value, detail, tone = "" }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-4 text-card-foreground shadow-xs">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`font-mono text-2xl font-semibold tracking-tight ${tone}`}>{value}</span>
      {detail && <span className="mt-auto text-sm text-muted-foreground">{detail}</span>}
    </div>
  );
}

function BranchTable({ rows, columns, empty }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4 text-muted-foreground">Branch</TableHead>
            {columns.map((column) => (
              <TableHead key={column.key} className="text-right text-muted-foreground last:pr-4">{column.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row._id}>
              <TableCell className="pl-4">{branchShort(row)}</TableCell>
              {columns.map((column) => (
                <TableCell key={column.key} className="text-right font-mono last:pr-4">
                  {column.format ? column.format(row[column.key]) : row[column.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={columns.length + 1} className="h-20 text-center text-muted-foreground">{empty}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// Bag figures for owners and managers: movement by branch, delays and exceptions.
export function BagsReport() {
  const today = useToday();
  const [range, setRange] = useState(null);
  const [report, setReport] = useState(null);
  const [load, setLoad] = useState({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (range?.from) {
      params.set("from", format(range.from, "yyyy-MM-dd"));
      params.set("to", format(range.to ?? range.from, "yyyy-MM-dd"));
    }
    bagRequest(`/api/bags/reports?${params}`)
      .then((result) => {
        if (cancelled) return;
        setReport(result);
        setLoad({ state: "ready" });
      })
      .catch((error) => !cancelled && setLoad({ state: "error", message: error.message }));
    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bag reports</h1>
          <p className="text-sm text-muted-foreground">Dispatches, receipts, delays and exceptions across branches.</p>
        </div>
        <DateRangePicker value={range} onChange={setRange} today={today} placeholder="All time" />
      </div>
      {!report ? (
        <div className={`grid h-40 place-items-center ${load.state === "error" ? "text-status-bad" : "text-muted-foreground"}`}>
          {load.state === "error" ? (
            `Couldn't load the report: ${load.message}`
          ) : (
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Loading report…
            </span>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Stat label="In transit now" value={report.inTransit} detail="Bags on the way" />
            <Stat label="Delayed" value={report.delayed.length} tone={report.delayed.length ? "text-status-bad" : ""} detail={`In transit > ${report.delayDays} days`} />
            <Stat label="Dispatch → receipt" value={duration(report.averageHours)} detail="Average time" />
            <Stat label="Packages per bag" value={report.averagePackages ? report.averagePackages.toFixed(1) : "—"} detail="Average, received bags" />
            <Stat label="Missing packages" value={report.exceptions.missing} tone={report.exceptions.missing ? "text-status-bad" : ""} detail="Reported on receipt" />
            <Stat label="Damaged packages" value={report.exceptions.damaged} tone={report.exceptions.damaged ? "text-status-warn" : ""} detail={`${report.exceptions.open} cases still open`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="pb-0">
              <CardHeader>
                <CardTitle>Dispatched by branch</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <BranchTable
                  rows={report.dispatched}
                  empty="No bags dispatched in this period."
                  columns={[
                    { key: "bags", label: "Bags" },
                    { key: "packages", label: "Packages" },
                    { key: "weight", label: "Weight", format: kg },
                  ]}
                />
              </CardContent>
            </Card>
            <Card className="pb-0">
              <CardHeader>
                <CardTitle>Received by branch</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <BranchTable
                  rows={report.received}
                  empty="No bags received in this period."
                  columns={[
                    { key: "bags", label: "Bags" },
                    { key: "packages", label: "Packages" },
                    { key: "missing", label: "Missing" },
                    { key: "damaged", label: "Damaged" },
                  ]}
                />
              </CardContent>
            </Card>
          </div>
          <Card className="pb-0">
            <CardHeader>
              <CardTitle>Delayed in transit</CardTitle>
              <CardDescription>Dispatched more than {report.delayDays} days ago and not yet received.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4 text-muted-foreground">Bag</TableHead>
                      <TableHead className="text-muted-foreground">From</TableHead>
                      <TableHead className="text-muted-foreground">To</TableHead>
                      <TableHead className="text-right text-muted-foreground">Packages</TableHead>
                      <TableHead className="pr-4 text-muted-foreground">Dispatched</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.delayed.map((bag) => (
                      <TableRow key={bag.code}>
                        <TableCell className="pl-4 font-mono text-[13px]"><Link href={bagUrl(bag.code)} className="hover:underline">{bag.code}</Link></TableCell>
                        <TableCell>{branchShort(bag.origin)}</TableCell>
                        <TableCell>{branchShort(bag.destination)}</TableCell>
                        <TableCell className="text-right font-mono">{bag.totalPackages}</TableCell>
                        <TableCell className="pr-4">{when(bag.dispatchedAt)}</TableCell>
                      </TableRow>
                    ))}
                    {!report.delayed.length && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">No delayed bags.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <Card className="pb-0">
            <CardHeader>
              <CardTitle>Open exceptions</CardTitle>
              <CardDescription>Missing and damaged packages still under investigation.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4 text-muted-foreground">Package</TableHead>
                      <TableHead className="text-muted-foreground">Type</TableHead>
                      <TableHead className="text-muted-foreground">Bag</TableHead>
                      <TableHead className="text-muted-foreground">Route</TableHead>
                      <TableHead className="pr-4 text-muted-foreground">Reported</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.exceptions.list.map((exception) => (
                      <TableRow key={exception._id}>
                        <TableCell className="pl-4 font-mono text-[13px]">{exception.tracking}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={exception.type === "missing" ? "border-status-bad/40 text-status-bad" : "border-status-warn/40 text-status-warn"}>
                            {EXCEPTION_TYPES[exception.type]}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-[13px]"><Link href={bagUrl(exception.bagCode)} className="hover:underline">{exception.bagCode}</Link></TableCell>
                        <TableCell>{branchShort(exception.origin)} → {branchShort(exception.destination)}</TableCell>
                        <TableCell className="pr-4">{when(exception.createdAt)} · {exception.reportedBy?.name}</TableCell>
                      </TableRow>
                    ))}
                    {!report.exceptions.list.length && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">No open exceptions.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
