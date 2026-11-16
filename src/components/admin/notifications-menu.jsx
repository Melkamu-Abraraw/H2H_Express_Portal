"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check, Inbox, Package, UserPlus } from "lucide-react";
import { can, roleLabel } from "@/lib/permissions";
import { useProfile } from "@/components/admin/profile-store";
import { useStaff } from "@/components/admin/staff-store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// What each person has already dealt with is kept on their account (/api/notifications), so it
// follows them between devices. The list starts from their first visit, so a long history of
// old packages and existing staff never floods it.

async function getJson(url) {
  const result = await (await fetch(url, { cache: "no-store" })).json();
  if (!result.success) throw new Error(result.error);
  return result;
}

// "< 1 min ago", "5 min ago", "3 h ago", "2 d ago": short, so it never crowds the row.
function ago(time) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(time)) / 60000));
  if (minutes < 1) return "< 1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h ago`;
  return `${Math.floor(minutes / 1440)} d ago`;
}

const KINDS = {
  request: { icon: Inbox, href: "/admin/requests", label: "Needs review" },
  package: { icon: Package, href: "/admin/packages", label: "New package" },
  staff: { icon: UserPlus, href: "/admin/staff", label: "New staff" },
};

// "Canada → Ethiopia · Express · 2 items": the facts staff need before opening it.
function facts({ from, to, shipping, items }) {
  return [
    from && to && `${from} → ${to}`,
    shipping && (shipping === "express" ? "Express" : "Normal"),
    items && `${items} ${items === 1 ? "item" : "items"}`,
  ].filter(Boolean);
}

export function NotificationsMenu() {
  const profile = useProfile();
  const seeRequests = can(profile, "requests.view");
  const seePackages = can(profile, "packages.view");
  // Only owners can see the team, so only they hear about new staff.
  const { staff } = useStaff(can(profile, "staff.manage"));
  const [store, setStore] = useState(null);
  const [data, setData] = useState({ requests: [], packages: [] });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!profile.loaded) return;
    let cancelled = false;
    function load() {
      Promise.all([
        seeRequests ? getJson("/api/requests") : { requests: [] },
        seePackages ? getJson("/api/packages?recent=1") : { packages: [] },
        getJson("/api/notifications"),
      ])
        .then(([requests, packages, state]) => {
          if (cancelled) return;
          // Done items are only read once; after that this browser's copy is the latest.
          setStore((current) => current ?? { baseline: state.baseline, done: state.done });
          setData({ requests: requests.requests, packages: packages.packages });
        })
        .catch(() => {});
    }
    load();
    const timer = setInterval(() => document.visibilityState === "visible" && load(), 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [profile.loaded, seeRequests, seePackages]);

  const todos = [];
  if (store) {
    const done = new Set(store.done);
    // Requests stay on the list until someone registers or rejects them.
    for (const request of data.requests) {
      todos.push({
        id: `req:${request.code}`,
        kind: "request",
        title: `${request.sender.name} → ${request.receiver.name}`,
        ref: request.code,
        facts: facts({ from: request.from, to: request.to, shipping: request.shipping, items: request.items?.length }),
        time: request.createdAt,
        manual: false,
      });
    }
    for (const pkg of data.packages) {
      if (pkg.createdAt <= store.baseline || done.has(`pkg:${pkg.tracking}`)) continue;
      todos.push({
        id: `pkg:${pkg.tracking}`,
        kind: "package",
        title: `${pkg.sender} → ${pkg.receiver}`,
        ref: pkg.tracking,
        facts: [...facts(pkg), pkg.cashier && `by ${pkg.cashier}`].filter(Boolean),
        time: pkg.createdAt,
        manual: true,
      });
    }
    for (const member of staff) {
      if (!member.createdAt || member.createdAt <= store.baseline || done.has(`staff:${member.id}`)) continue;
      todos.push({
        id: `staff:${member.id}`,
        kind: "staff",
        title: member.name,
        ref: member.email,
        facts: [roleLabel(member.role), member.status === "active" ? "Activated" : "Invited"],
        time: member.createdAt,
        manual: true,
      });
    }
    todos.sort((a, b) => new Date(b.time) - new Date(a.time));
  }

  function markDone(ids) {
    setStore((current) => ({ ...current, done: [...current.done, ...ids] }));
    fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: ids }),
    }).catch(() => {});
  }

  const manual = todos.filter((todo) => todo.manual);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative"
          aria-label={todos.length ? `Notifications, ${todos.length} to do` : "Notifications"}
        >
          <Bell />
          {todos.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 font-mono text-[10px] leading-4 font-bold text-black">
              {todos.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 sm:w-96">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            Notifications
            {todos.length > 0 && (
              <span className="rounded-full bg-brand/20 px-1.5 py-0.5 font-mono text-[11px] leading-none text-brand-dark dark:text-brand">
                {todos.length}
              </span>
            )}
          </p>
          {manual.length > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => markDone(manual.map((todo) => todo.id))}
            >
              Mark all done
            </button>
          )}
        </div>
        {todos.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            You&apos;re all caught up. New requests, packages and staff appear here.
          </p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {todos.map((todo) => {
              const { icon: Icon, href, label } = KINDS[todo.kind];
              return (
                <li key={todo.id} className="group relative flex items-start gap-3 px-4 py-2.5 hover:bg-muted/50">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-brand/15 text-brand-dark dark:text-brand">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <Link href={href} onClick={() => setOpen(false)} className="grid min-w-0 flex-1 gap-0.5 text-sm">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-brand-dark dark:text-brand">{label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {ago(todo.time)}
                      </span>
                    </span>
                    <span className="truncate font-medium">{todo.title}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      <span className="font-mono">{todo.ref}</span>
                      {todo.facts.map((fact) => ` · ${fact}`).join("")}
                    </span>
                  </Link>
                  {todo.manual && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Mark done: ${todo.title}`}
                          className="mt-0.5 grid size-7 shrink-0 place-items-center text-muted-foreground transition hover:scale-125 hover:text-status-good active:scale-95 focus-visible:text-status-good focus-visible:outline-none"
                          onClick={() => markDone([todo.id])}
                        >
                          <Check className="size-4" aria-hidden="true" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" sideOffset={6}>
                        Mark as done
                      </TooltipContent>
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
