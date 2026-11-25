"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LoaderCircle, Search } from "lucide-react";
import { useProfile } from "@/components/admin/profile-store";
import {
  BagStatusBadge,
  bagRequest,
  bagUrl,
  branchShort,
  kg,
  when,
} from "@/components/admin/bag-ui";
import { can } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Bags on their way to the user's branch, oldest first, so the longest-waiting gets opened first.
export function BagsIncoming() {
  const profile = useProfile();
  const [data, setData] = useState(null);
  const [load, setLoad] = useState({ state: "loading" });
  const [term, setTerm] = useState("");

  useEffect(() => {
    let cancelled = false;
    function fetchBags(first) {
      bagRequest("/api/bags/incoming")
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
  }, []);

  const q = term.trim().toUpperCase();
  const rows = (data?.bags ?? []).filter((bag) => !q || bag.code.includes(q));
  const canReceive = can(profile, "bags.receive");

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Incoming boxes</h1>
        <p className="text-sm text-muted-foreground">
          {data?.branch ? `Boxes on their way to ${data.branch.name}.` : "Boxes on their way to every branch."} Open one to check its packages in.
        </p>
      </div>
      <Card className="min-w-0 pb-0">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input type="search" aria-label="Search by box reference" placeholder="Search box reference..." className="pl-8 font-mono" value={term} onChange={(event) => setTerm(event.target.value)} />
          </div>
          <p role="status" className="text-sm text-muted-foreground sm:ml-auto">
            <span className="font-mono">{rows.length}</span> in transit
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 text-muted-foreground">Box</TableHead>
                  <TableHead className="text-muted-foreground">From</TableHead>
                  {!data?.branch && <TableHead className="text-muted-foreground">To</TableHead>}
                  <TableHead className="text-right text-muted-foreground">Packages</TableHead>
                  <TableHead className="text-muted-foreground">Dispatched</TableHead>
                  <TableHead className="text-muted-foreground">Expected</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="pr-4 text-right text-muted-foreground"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((bag) => (
                  <TableRow key={bag.code} className="h-12">
                    <TableCell className="pl-4 font-mono text-[13px]">
                      <Link href={bagUrl(bag.code)} className="hover:underline">{bag.code}</Link>
                    </TableCell>
                    <TableCell className="max-w-48 truncate" title={bag.origin.name}>{branchShort(bag.origin)}</TableCell>
                    {!data?.branch && <TableCell className="max-w-48 truncate" title={bag.destination.name}>{branchShort(bag.destination)}</TableCell>}
                    <TableCell className="text-right font-mono">
                      {bag.totalPackages} <span className="text-muted-foreground">· {kg(bag.totalWeight)}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{when(bag.dispatchedAt, "MMM d, HH:mm")}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {when(bag.expectedAt, "MMM d")}
                      {bag.delayed && <Badge variant="outline" className="ml-2 border-status-bad/40 text-status-bad">Delayed</Badge>}
                    </TableCell>
                    <TableCell><BagStatusBadge status={bag.status} /></TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={bagUrl(bag.code)}>{canReceive ? "Receive" : "View"}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow>
                    <TableCell colSpan={8} className={`h-32 text-center ${load.state === "error" ? "text-status-bad" : "text-muted-foreground"}`}>
                      {load.state === "loading" ? (
                        <span className="inline-flex items-center gap-2">
                          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                          Loading incoming boxes…
                        </span>
                      ) : load.state === "error" ? (
                        `Couldn't load incoming boxes: ${load.message}`
                      ) : q ? (
                        "No incoming box matches."
                      ) : (
                        "No boxes are on their way right now."
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
