"use client";

import { format } from "date-fns";
import { X } from "lucide-react";
import { accountRequest } from "@/components/admin/profile-store";
import { bagStatusInfo } from "@/lib/bags";
import { Badge } from "@/components/ui/badge";

// Shared pieces for the Bags pages: API calls, formatting and the status badge.

export function bagRequest(url, { method = "GET", body } = {}) {
  return accountRequest(url, {
    method,
    cache: "no-store",
    ...(body !== undefined && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}

export function bagUrl(code) {
  return `/admin/bags/${encodeURIComponent(code)}`;
}

export function when(date, pattern = "MMM d, yyyy HH:mm") {
  return date ? format(new Date(date), pattern) : "—";
}

export function kg(value) {
  return `${(Number(value) || 0).toFixed(1)} kg`;
}

export function BagStatusBadge({ status, className }) {
  const info = bagStatusInfo(status);
  return (
    <Badge variant="outline" className={className}>
      <span className={`size-1.5 rounded-full ${info.dot}`} aria-hidden="true" />
      {info.label}
    </Badge>
  );
}

export function branchShort(branch) {
  if (!branch?.name) return "—";
  return branch.name.replace(/hand to hand express/i, "H2H").replace(/\s+/g, " ").trim();
}

// A one-line result message under a toolbar, like the packages table uses.
export function StatusLine({ result, onDismiss }) {
  if (!result) return <p role="status" className="sr-only" />;
  const tone = result.tone === "bad" ? "text-status-bad" : result.tone === "warn" ? "text-status-warn" : "text-status-good";
  return (
    <p role="status" className={`flex items-start gap-2 text-sm ${tone}`}>
      <span className="flex-1">{result.text}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </p>
  );
}
