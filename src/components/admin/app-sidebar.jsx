"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { manageNav, mainNav } from "@/components/admin/nav-items";
import { CURRENT_USER } from "@/components/admin/current-user";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const badgeTones = {
  brand: "bg-foreground/10 text-brand-dark dark:text-brand",
  alert: "bg-foreground/10 text-red-700 dark:text-red-500",
  // Golden yellow text, for things waiting for staff.
  new: "bg-foreground/10 text-brand-dark dark:text-brand",
};

function isInSection(pathname, href) {
  return (
    pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`))
  );
}

function NavButton({ item: { label, href, icon: Icon, badge }, pathname }) {
  return (
    <SidebarMenuButton
      asChild
      isActive={isInSection(pathname, href)}
      tooltip={label}
      className="relative h-9 data-active:before:absolute data-active:before:inset-y-1.5 data-active:before:left-0 data-active:before:w-[3px] data-active:before:rounded-full data-active:before:bg-sidebar-primary"
    >
      <Link href={href}>
        <Icon />
        <span>{label}</span>
        {badge && (
          <span
            className={`inline-flex -translate-y-1 items-center gap-px rounded-full px-1.5 py-0.5 font-mono ${badge.plus ? "text-[11px]" : "text-[14px]"} leading-none font-bold group-data-[collapsible=icon]:hidden ${badgeTones[badge.tone]}`}
          >
            {badge.plus && (
              <Plus
                className="size-[8px]"
                strokeWidth={3.5}
                aria-hidden="true"
              />
            )}
            {badge.count}
          </span>
        )}
      </Link>
    </SidebarMenuButton>
  );
}

function CollapsibleNavItem({ item, pathname }) {
  // Follows the current page until the user opens or closes it themselves.
  const [userOpen, setUserOpen] = useState(null);
  const open = userOpen ?? isInSection(pathname, item.href);

  return (
    <Collapsible asChild open={open} onOpenChange={setUserOpen}>
      <SidebarMenuItem>
        <NavButton item={item} pathname={pathname} />
        <CollapsibleTrigger asChild>
          <SidebarMenuAction
            aria-label={`${open ? "Collapse" : "Expand"} ${item.label}`}
            className="top-2 data-[state=open]:rotate-90"
          >
            <ChevronRight />
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="border-l-2 border-brand/40">
            {item.children.map((child) => (
              <SidebarMenuSubItem key={child.href}>
                <SidebarMenuSubButton
                  asChild
                  isActive={pathname === child.href}
                  className="data-active:bg-sidebar-accent/50"
                >
                  <Link href={child.href}>
                    <span>{child.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function NavGroup({ items, pathname }) {
  return (
    <SidebarMenu className="gap-1">
      {items.map((item) =>
        item.children ? (
          <CollapsibleNavItem key={item.href} item={item} pathname={pathname} />
        ) : (
          <SidebarMenuItem key={item.href}>
            <NavButton item={item} pathname={pathname} />
          </SidebarMenuItem>
        ),
      )}
    </SidebarMenu>
  );
}

// How many public requests are waiting for review; refreshed on every page change and every 15s.
function usePendingRequests(pathname) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/requests?count=1", { cache: "no-store" })
        .then((response) => response.json())
        .then(
          (result) => !cancelled && result.success && setCount(result.count),
        )
        .catch(() => {});
    }
    load();
    const timer = setInterval(
      () => document.visibilityState === "visible" && load(),
      15000,
    );
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pathname]);
  return count;
}

export function AppSidebar() {
  const pathname = usePathname();
  const pending = usePendingRequests(pathname);
  const main = mainNav.map((item) =>
    item.href === "/admin/requests" && pending > 0
      ? { ...item, badge: { count: pending, tone: "new", plus: true } }
      : item,
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 p-1 group-data-[collapsible=icon]:p-0">
          <Image
            src="/images/logos/h2h_mark.png"
            alt="H2H Express logo"
            width={195}
            height={138}
            loading="eager"
            className="h-auto w-8 shrink-0 dark:hidden group-data-[collapsible=icon]:w-7"
          />
          <Image
            src="/images/logos/logo_header.png"
            alt="H2H Express logo"
            width={463}
            height={259}
            loading="eager"
            className="hidden h-auto w-8 shrink-0 dark:block group-data-[collapsible=icon]:w-7"
          />
          <div className="grid leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold text-foreground">
              <span className="text-brand">H2H</span> Express
            </span>
            <span className="truncate text-xs text-muted-foreground">
              Delivery
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <NavGroup items={main} pathname={pathname} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavGroup items={manageNav} pathname={pathname} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="relative isolate flex min-h-28 items-end gap-2.5 overflow-hidden rounded-lg p-2.5 group-data-[collapsible=icon]:min-h-0 group-data-[collapsible=icon]:overflow-visible group-data-[collapsible=icon]:p-0">
          <div className="absolute inset-0 -z-10 group-data-[collapsible=icon]:hidden">
            <Image
              src="/images/truck%20image_dark.png"
              alt=""
              fill
              sizes="240px"
              loading="eager"
              className="object-cover object-[50%_55%] dark:hidden"
            />
            <Image
              src="/images/truck%20image_light.png"
              alt=""
              fill
              sizes="240px"
              loading="eager"
              className="hidden object-cover object-[50%_55%] dark:block"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/35 to-transparent" />
          </div>
          <Avatar className="size-8">
            <AvatarFallback className="text-xs font-medium">
              {CURRENT_USER.initials}
            </AvatarFallback>
          </Avatar>
          <div className="grid leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium text-white">
              {CURRENT_USER.name}
            </span>
            <span className="truncate text-xs text-white/85">
              {CURRENT_USER.title}
            </span>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
