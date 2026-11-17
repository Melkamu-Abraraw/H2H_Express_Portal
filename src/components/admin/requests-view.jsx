"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { CircleAlert, CircleCheck, LoaderCircle, X, XCircle } from "lucide-react";
import { DIRECTIONS, RouteLabel } from "@/components/admin/shipping-routes";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// How long the "rejected" confirmation stays before it clears itself.
const NOTICE_MS = 6000;

async function readResult(response) {
  const result = await response.json().catch(() => null);
  if (!result?.success) throw new Error(result?.error || `Server returned HTTP ${response.status}`);
  return result;
}

export function RequestsView() {
  const [state, setState] = useState({ status: "loading", requests: [] });
  // The request waiting for a yes/no in the reject dialog.
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  // { title, text } confirming a rejection, shown above the list. Errors stay in the dialog.
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

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

  function askToReject(item) {
    setDialogError("");
    setConfirming(item);
  }

  function closeDialog() {
    if (busy) return;
    setConfirming(null);
    setDialogError("");
  }

  async function reject() {
    const item = confirming;
    if (!item) return;
    setBusy(true);
    setDialogError("");
    try {
      await readResult(
        await fetch("/api/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: item.code, action: "reject" }),
        }),
      );
      setState((current) => ({
        ...current,
        requests: current.requests.filter((request) => request.code !== item.code),
      }));
      setConfirming(null);
      setNotice({
        title: `${item.code} rejected`,
        text: `The request from ${item.sender.name} was removed from the list.`,
      });
    } catch (e) {
      // Keep the dialog open so the person can retry or cancel.
      setDialogError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}
      <RequestList state={state} busyCode={busy ? confirming?.code : null} onReject={askToReject} />
      <Dialog open={Boolean(confirming)} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent showCloseButton={false} className="gap-4 p-5 sm:max-w-sm">
          <DialogHeader className="gap-1.5 p-0 text-left">
            <DialogTitle>Reject {confirming?.code}?</DialogTitle>
            <DialogDescription>
              The request from {confirming?.sender.name} will be removed from the list. The customer
              won&apos;t be notified, and this can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          {dialogError && (
            <p className="flex items-start gap-2 text-sm text-status-bad" role="alert">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {dialogError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeDialog} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={reject} disabled={busy}>
              {busy ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <XCircle aria-hidden="true" />
              )}
              {busy ? "Rejecting…" : "Reject request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Notice({ notice, onDismiss }) {
  return (
    <Alert aria-live="polite">
      <CircleCheck className="text-status-good" aria-hidden="true" />
      <AlertTitle>{notice.title}</AlertTitle>
      <AlertDescription>{notice.text}</AlertDescription>
      <AlertAction>
        <Button variant="ghost" size="icon" className="size-7" onClick={onDismiss} aria-label="Dismiss">
          <X aria-hidden="true" />
        </Button>
      </AlertAction>
    </Alert>
  );
}

function RequestList({ state, busyCode, onReject }) {
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
                <Button asChild size="sm" className="bg-brand text-black hover:bg-brand/90">
                  <Link href={`/admin/packages/new?request=${encodeURIComponent(item.code)}`}>Review</Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-status-bad hover:text-status-bad"
                  disabled={busyCode === item.code}
                  onClick={() => onReject(item)}
                >
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
