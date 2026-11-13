"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Bell, Inbox, Package, UserPlus } from "lucide-react";
import { useStaff } from "@/components/admin/staff-store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// What this browser has already dealt with. Notifications start from the first visit, so a
// long history of old packages and existing staff never floods the list.
const STORAGE_KEY = "h2h-notifications";
const MAX_DONE = 300;

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Private windows can refuse storage; the list still works until the page closes.
  }
}

async function getJson(url) {
  const result = await (await fetch(url, { cache: "no-store" })).json();
  if (!result.success) throw new Error(result.error);
  return result;
}

const KINDS = {
  request: { icon: Inbox, href: "/admin/requests" },
  package: { icon: Package, href: "/admin/packages" },
  staff: { icon: UserPlus, href: "/admin/staff" },
};

export function NotificationsMenu() {
  const staff = useStaff();
  const staffRef = useRef(staff);
  useEffect(() => {
    staffRef.current = staff;
  });
  const [store, setStore] = useState(null);
  const [data, setData] = useState({ requests: [], packages: [] });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function load() {
      Promise.all([getJson("/api/requests"), getJson("/api/packages?recent=1")])
        .then(([requests, packages]) => {
          if (cancelled) return;
          let current = readStore();
          if (!current) {
            current = {
              baseline: new Date().toISOString(),
              staffIds: staffRef.current.map((member) => member.id),
              done: [],
            };
            writeStore(current);
          }
          setStore(current);
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
  }, []);

  const todos = [];
  if (store) {
    const done = new Set(store.done);
    const known = new Set(store.staffIds);
    // Requests stay on the list until someone registers or rejects them.
    for (const request of data.requests) {
      todos.push({
        id: `req:${request.code}`,
        kind: "request",
        title: `Review request ${request.code}`,
        detail: `${request.sender.name} → ${request.receiver.name}`,
        time: request.createdAt,
        manual: false,
      });
    }
    for (const pkg of data.packages) {
      if (pkg.createdAt <= store.baseline || done.has(`pkg:${pkg.tracking}`)) continue;
      todos.push({
        id: `pkg:${pkg.tracking}`,
        kind: "package",
        title: `New package ${pkg.tracking}`,
        detail: `${pkg.sender} → ${pkg.receiver}${pkg.cashier ? ` · by ${pkg.cashier}` : ""}`,
        time: pkg.createdAt,
        manual: true,
      });
    }
    for (const member of staff) {
      if (known.has(member.id) || done.has(`staff:${member.id}`)) continue;
      todos.push({
        id: `staff:${member.id}`,
        kind: "staff",
        title: `New staff: ${member.name}`,
        detail: member.role,
        time: member.lastActive,
        manual: true,
      });
    }
    todos.sort((a, b) => new Date(b.time) - new Date(a.time));
  }

  function markDone(ids) {
    const next = { ...store, done: [...store.done, ...ids].slice(-MAX_DONE) };
    writeStore(next);
    setStore(next);
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
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">To do{todos.length > 0 && ` · ${todos.length}`}</p>
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
              const { icon: Icon, href } = KINDS[todo.kind];
              return (
                <li key={todo.id} className="flex items-start gap-3 px-4 py-3">
                  {todo.manual ? (
                    <Checkbox
                      className="mt-1"
                      aria-label={`Mark done: ${todo.title}`}
                      onCheckedChange={() => markDone([todo.id])}
                    />
                  ) : (
                    <Icon className="mt-1 size-4 shrink-0 text-brand-dark" aria-hidden="true" />
                  )}
                  <Link href={href} onClick={() => setOpen(false)} className="grid min-w-0 flex-1 gap-0.5 text-sm">
                    <span className="font-medium">{todo.title}</span>
                    <span className="truncate text-muted-foreground">{todo.detail}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(todo.time), { addSuffix: true })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
