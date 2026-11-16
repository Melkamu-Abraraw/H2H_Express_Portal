import Link from "next/link";
import { format } from "date-fns";
import { PaymentCell } from "@/components/admin/payment-cell";
import { statusDots } from "@/components/admin/package-views";
import { PackageRouteFlags } from "@/components/admin/shipping-routes";
import { relativeDay } from "@/components/admin/table-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SHOWN = 8;

// The packages touched most recently, for a dispatcher to work from.
export function RecentPackages({ packages, today, loading }) {
  const recent = [...packages].sort((a, b) => b.date - a.date).slice(0, SHOWN);

  return (
    <Card className="min-w-0 pb-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Recent packages</CardTitle>
        <Button variant="outline" size="xs" asChild>
          <Link href="/admin/packages">View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="px-0">
        <Table className="[&_td:not(:first-child):not(:last-child)]:px-2 [&_th:not(:first-child):not(:last-child)]:px-2">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4 text-muted-foreground">Tracking #</TableHead>
              <TableHead className="text-muted-foreground">Customer</TableHead>
              <TableHead className="text-muted-foreground">Route</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Payment</TableHead>
              <TableHead className="pr-4 text-muted-foreground">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {loading ? "Loading…" : "No packages yet."}
                </TableCell>
              </TableRow>
            )}
            {recent.map((item) => (
              <TableRow key={item.tracking} className="h-12">
                <TableCell className="pl-4 font-mono text-[13px]">
                  <Link
                    href={`/admin/packages?q=${encodeURIComponent(item.tracking)}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {item.tracking}
                  </Link>
                </TableCell>
                <TableCell className="max-w-40 truncate" title={item.sender}>
                  {item.sender}
                </TableCell>
                <TableCell>
                  <PackageRouteFlags pkg={item} />
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    <span className={`size-1.5 rounded-full ${statusDots[item.status]}`} aria-hidden="true" />
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <PaymentCell pkg={item} />
                </TableCell>
                <TableCell className="pr-4">
                  <div className="flex flex-col leading-tight">
                    <span>{format(item.date, "MMM d, HH:mm")}</span>
                    {today && <span className="text-xs text-muted-foreground">{relativeDay(item.date, today)}</span>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
