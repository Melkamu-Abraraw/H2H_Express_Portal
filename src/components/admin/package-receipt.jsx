"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Download, LoaderCircle, Mail, MailCheck, MailX } from "lucide-react";
import { buildReceiptPdf } from "@/lib/receipt-pdf";
import { CopyNumber } from "@/components/tracking/tracking-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function trackUrlOf(receipt) {
  return (
    receipt.trackUrl ?? `${window.location.origin}/track/${encodeURIComponent(receipt.tracking)}`
  );
}

const EMAIL_NOTES = {
  sent: (email) => ({ tone: "good", title: "Confirmation email sent", detail: email.to }),
  failed: (email) => ({ tone: "bad", title: "Email not sent", detail: `Couldn't reach ${email.to}` }),
  "not-configured": () => ({
    tone: "muted",
    title: "Email isn't set up",
    detail: "Download the receipt instead",
  }),
  "no-address": () => ({
    tone: "muted",
    title: "No email address",
    detail: "Download the receipt instead",
  }),
};

const NOTE_STYLES = {
  good: { icon: MailCheck, badge: "bg-status-good/12 text-status-good" },
  bad: { icon: MailX, badge: "bg-status-bad/12 text-status-bad" },
  muted: { icon: Mail, badge: "bg-muted text-muted-foreground" },
};

function EmailStatus({ note }) {
  const { icon: Icon, badge } = NOTE_STYLES[note.tone];
  return (
    <div role="status" className="flex items-center gap-2.5">
      <span className={`grid size-7 shrink-0 place-items-center rounded-full ${badge}`}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="grid min-w-0 leading-tight">
        <span className="text-sm font-medium">{note.title}</span>
        <span className="truncate text-sm text-muted-foreground">{note.detail}</span>
      </div>
    </div>
  );
}

function ReceiptDialog({ receipt, onOpenChange, onRegisterAnother }) {
  const [pdf, setPdf] = useState({ state: "idle" });
  const emailNote = receipt.email ? EMAIL_NOTES[receipt.email.status]?.(receipt.email) : null;

  async function download() {
    setPdf({ state: "building" });
    try {
      const blob = await buildReceiptPdf(receipt, trackUrlOf(receipt));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `H2H-receipt-${receipt.tracking}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPdf({ state: "idle" });
    } catch (error) {
      console.error("Receipt PDF failed", error);
      setPdf({ state: "error" });
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Package registered</DialogTitle>
          <DialogDescription>
            Receipt {receipt.receiptNo} · {format(receipt.date, "MMM d, yyyy HH:mm")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 px-4">
          {emailNote && <EmailStatus note={emailNote} />}

          <div className="rounded-lg border border-brand/60 bg-sidebar-accent p-3 text-center">
            <p className="text-xs text-muted-foreground">Tracking number</p>
            <CopyNumber number={receipt.tracking} className="text-lg font-bold tracking-wide" />
          </div>

          {pdf.state === "error" && (
            <p className="text-xs text-status-bad">
              Couldn&apos;t create the PDF. Please try again.
            </p>
          )}
        </div>


        <DialogFooter className="flex flex-row gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            onClick={download}
            disabled={pdf.state === "building"}
            aria-label={pdf.state === "building" ? "Preparing PDF receipt" : "Download PDF receipt"}
            title="Download PDF receipt"
          >
            {pdf.state === "building" ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Download aria-hidden="true" />
            )}
          </Button>
          <Button className="h-9 flex-1" onClick={onRegisterAnother}>
            Register another package
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PackageReceiptDialog({ receipt, onOpenChange, onRegisterAnother }) {
  if (!receipt) return null;
  return (
    <ReceiptDialog
      key={receipt.tracking}
      receipt={receipt}
      onOpenChange={onOpenChange}
      onRegisterAnother={onRegisterAnother}
    />
  );
}
