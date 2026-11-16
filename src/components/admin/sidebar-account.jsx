"use client";

import Link from "next/link";
import { EllipsisVertical, LogOut, UserRound } from "lucide-react";
import { signOut, useProfile } from "@/components/admin/profile-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// The signed-in person at the bottom of the sidebar: avatar, name and role, with Profile and
// Sign out in a menu. Collapses to just the avatar when the sidebar is icon-only.
export function SidebarAccount() {
  const user = useProfile();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu, ${user.name}`}
          className="flex w-full items-center gap-2.5 rounded-lg border bg-sidebar p-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:p-0"
        >
          <Avatar className="size-9 shrink-0 group-data-[collapsible=icon]:size-8">
            {user.photo && <AvatarImage src={user.photo} alt="" className="object-top" />}
            <AvatarFallback className="bg-neutral-900 text-sm font-semibold text-brand">
              {user.initials}
            </AvatarFallback>
          </Avatar>
          <span className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold text-sidebar-foreground">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.title}</span>
          </span>
          <EllipsisVertical
            className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/admin/account">
            <UserRound />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={signOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
