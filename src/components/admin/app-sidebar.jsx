"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { can } from "@/lib/permissions";
import { useChatUnread } from "@/components/admin/chat-store";
import { RealtimeConnection } from "@/components/admin/realtime";
import { useProfile } from "@/components/admin/profile-store";
import { SidebarAccount } from "@/components/admin/sidebar-account";
import { manageNav, mainNav, utilityNav } from "@/components/admin/nav-items";
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
  // Solid yellow with dark text, for things waiting for staff.
  new: "bg-brand text-black",
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
          // Same 20px column as the chevron on expandable items, so the two line up.
          <span
            className={`-mr-1 ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[11px] leading-none font-bold group-data-[collapsible=icon]:hidden ${badgeTones[badge.tone]}`}
          >
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
function usePendingRequests(pathname, enabled) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
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
  }, [pathname, enabled]);
  return enabled ? count : 0;
}

export function AppSidebar() {
  const pathname = usePathname();
  const profile = useProfile();
  const allowed = (items) => items.filter((item) => can(profile, item.permission));
  const pending = usePendingRequests(pathname, can(profile, "requests.view"));
  const unread = useChatUnread(can(profile, "chat.use"), pathname);
  const badges = { "/admin/requests": pending, "/admin/chat": unread };
  const withBadges = (items) =>
    allowed(items).map((item) =>
      badges[item.href] > 0
        ? { ...item, badge: { count: badges[item.href] > 99 ? "99+" : badges[item.href], tone: "new" } }
        : item,
    );
  const main = withBadges(mainNav);
  const manage = allowed(manageNav);
  const utility = withBadges(utilityNav);

  return (
    <Sidebar collapsible="icon">
      {/* One real-time connection per tab: inbox signals and who's online. */}
      <RealtimeConnection userId={profile.id} enabled={can(profile, "chat.use")} />
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
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavGroup items={main} pathname={pathname} />
          </SidebarGroupContent>
        </SidebarGroup>
        {manage.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Manage</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavGroup items={manage} pathname={pathname} />
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        {utility.length > 0 && <NavGroup items={utility} pathname={pathname} />}
        <SidebarAccount />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
