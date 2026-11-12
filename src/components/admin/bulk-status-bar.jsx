"use client";

import { ChevronDown, X } from "lucide-react";
import { blockedByPayment } from "@/components/admin/package-payments";
import { BULK_STEPS, canMoveTo } from "@/components/admin/package-tracking";
import { useSettings } from "@/components/admin/settings-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function BulkStatusBar({ selected, onApply, onClear }) {
  const { requirePaymentBeforeDelivery } = useSettings();
  return (
    <div className="flex flex-wrap items-center gap-2 border-y bg-muted/50 px-4 py-2">
      <span className="text-sm font-medium">
        <span className="font-mono">{selected.length}</span> selected
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">
            Update status
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-64">
          <DropdownMenuLabel>Move selected to</DropdownMenuLabel>
          {BULK_STEPS.map((step) => {
            const ahead = selected.filter((item) => canMoveTo(item, step.key));
            const unpaid = ahead.filter((item) => blockedByPayment(item, step.key, requirePaymentBeforeDelivery)).length;
            const eligible = ahead.length - unpaid;
            return (
              <DropdownMenuItem
                key={step.key}
                disabled={eligible === 0}
                onSelect={() => onApply(step)}
                className="whitespace-nowrap"
              >
                <span className="flex flex-col">
                  {step.label}
                  {unpaid > 0 && (
                    <span className="text-xs text-status-warn">{unpaid} with balance due</span>
                  )}
                </span>
                <span className="ml-auto pl-4 font-mono text-xs text-muted-foreground">
                  {eligible}/{selected.length}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="sm" onClick={onClear}>
        <X aria-hidden="true" />
        Clear selection
      </Button>
    </div>
  );
}
