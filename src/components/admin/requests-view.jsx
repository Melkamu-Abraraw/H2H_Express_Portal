"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { LoaderCircle, PackageCheck, X } from "lucide-react";
import { DIRECTIONS, RouteLabel } from "@/components/admin/shipping-routes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

async function readResult(response) {
  const result = await response.json().catch(() => null);
  if (!result?.success) throw new Error(result?.error || `Server returned HTTP ${response.status}`);
  return result;
}

export function RequestsView() {
  const [state, setState] = useState({ status: "loading", requests: [] });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    function load(first) {
      fetch("/api/requests", { cache: "no-store" })
        .then(readResult)
        .then((result) => !cancelled && setState({ status: "ready", requests: result.requests }))
        .catch((e) => first && !cancelled && setState({ status: "error", message: e.message, requests: [] }));
    }
    load(true);
    const timer = setInterval(() => document.visibilityState === "visible" && load(false), 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  async function reject(code) {
    if (!window.confirm(`Reject ${code}? The customer won't be notified.`)) return;
    setBusy(code);
    setError("");
    try {
      await readResult(
        await fetch("/api/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, action: "reject" }),
        }),
      );
      setState((current) => ({ ...current, requests: current.requests.filter((item) => item.code !== code) }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading requests…
      </p>
    );
  }
  if (state.status === "error") return <p className="text-sm text-status-bad">{state.message}</p>;
  if (!state.requests.length) {
    return <p className="text-sm text-muted-foreground">No requests waiting. New ones appear here automatically.</p>;
  }

  return (
    <div className="grid gap-3">
      {error && <p className="text-sm text-status-bad">{error}</p>}
      {state.requests.map((item) => {
        const direction = DIRECTIONS[item.route];
        const totalKg = item.items.reduce((sum, row) => sum + row.kg * 1, 0);
        return (
          <Card key={item.code}>
            <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="grid gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{item.code}</span>
                  {item.shipping === "express" && <Badge variant="outline">🚨 Express</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </span>
                </div>
                {direction && <RouteLabel from={direction.from} to={direction.to} />}
                <p className="text-sm">
                  {item.sender.name} <span className="text-muted-foreground">→</span> {item.receiver.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.items.map((row) => `${row.description} × ${row.qty}`).join(", ")} · declared {totalKg} kg
                </p>
              </div>
              <div className="flex gap-2">
                <Button asChild>
                  <Link href={`/admin/packages/new?request=${encodeURIComponent(item.code)}`}>
                    <PackageCheck aria-hidden="true" /> Review &amp; register
                  </Link>
                </Button>
                <Button variant="outline" disabled={busy === item.code} onClick={() => reject(item.code)}>
                  <X aria-hidden="true" /> Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
