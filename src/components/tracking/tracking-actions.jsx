"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { useSettings } from "@/components/admin/settings-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function useFlash() {
  const [flash, setFlash] = useState(false);
  return [
    flash,
    () => {
      setFlash(true);
      setTimeout(() => setFlash(false), 1800);
    },
  ];
}

export function CopyNumber({ number, className }) {
  const [copied, flash] = useFlash();

  async function copy() {
    try {
      await navigator.clipboard.writeText(number);
      flash();
    } catch {
      // Clipboard blocked: the number is still on screen to copy by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "group inline-flex items-center gap-2 rounded-md font-mono text-base font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label={copied ? "Tracking number copied" : `Copy tracking number ${number}`}
    >
      {number}
      {copied ? (
        <Check className="size-4 text-status-good" aria-hidden="true" />
      ) : (
        <Copy
          className="size-4 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

// Shown only once a support phone is set in Settings → Business profile.
export function TrackingActions({ number }) {
  const { business } = useSettings();
  const digits = business.phone.replace(/\D/g, "");
  if (!digits) return null;
  const message = `Hi ${business.name}, I have a question about package ${number}.`;

  return (
    <div className="border-t p-5 sm:px-6">
      <Button
        asChild
        size="lg"
        className="h-12 w-full rounded-md bg-[#25D366] text-base text-[#0b3d1f] hover:bg-[#25D366]/85"
      >
        <a
          href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle aria-hidden="true" />
          Ask on WhatsApp
        </a>
      </Button>
    </div>
  );
}
