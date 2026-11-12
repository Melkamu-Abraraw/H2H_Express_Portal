"use client";

import { useState, useSyncExternalStore } from "react";
import { format, isSameDay, isSameYear, startOfMonth, subDays } from "date-fns";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const noSubscribe = () => () => {};

// Today's date only exists on the client; the prerendered HTML gets null.
export function useToday() {
  const key = useSyncExternalStore(
    noSubscribe,
    () => format(new Date(), "yyyy-MM-dd"),
    () => null,
  );
  return key ? new Date(`${key}T00:00:00`) : null;
}

export const PRESETS = [
  { label: "Today", range: (today) => ({ from: today, to: today }) },
  { label: "Last 7 days", range: (today) => ({ from: subDays(today, 6), to: today }) },
  { label: "Last 30 days", range: (today) => ({ from: subDays(today, 29), to: today }) },
  { label: "This month", range: (today) => ({ from: startOfMonth(today), to: today }) },
  { label: "All time", range: () => null },
];

export function formatRange(range) {
  if (!range?.from) return "All time";
  const to = range.to ?? range.from;
  const withYear = !isSameYear(range.from, to) || !isSameYear(range.from, new Date());
  const pattern = withYear ? "MMM d, yyyy" : "MMM d";
  if (isSameDay(range.from, to)) return format(range.from, pattern);
  return `${format(range.from, pattern)} – ${format(to, pattern)}`;
}

export function DateRangePicker({ value, onChange, today, placeholder = "This month" }) {
  const [open, setOpen] = useState(false);

  function pick(range) {
    onChange(range);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start font-normal sm:w-auto">
          <CalendarDays className="text-muted-foreground" aria-hidden="true" />
          <span>{today || value ? formatRange(value) : placeholder}</span>
          <ChevronDown className="ml-auto text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto flex-col p-0 sm:flex-row">
        <div className="flex flex-wrap gap-1 border-b p-2 sm:flex-col sm:border-r sm:border-b-0">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              size="sm"
              className="justify-start"
              disabled={!today}
              onClick={() => pick(preset.range(today))}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <Calendar
          mode="range"
          numberOfMonths={1}
          defaultMonth={value?.to ?? today ?? undefined}
          selected={value ?? undefined}
          onSelect={(range) => onChange(range ?? null)}
          disabled={today ? { after: today } : undefined}
        />
      </PopoverContent>
    </Popover>
  );
}
