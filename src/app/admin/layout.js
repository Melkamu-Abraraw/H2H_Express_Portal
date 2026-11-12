import Link from "next/link";
import { Bell, Plus, Search } from "lucide-react";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { RouteTransition } from "@/components/route-transition";
import { ThemeToggle } from "@/components/admin/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export const metadata = {
  title: "Admin dashboard | H2H Express",
};

export default function AdminLayout({ children }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-card px-4 md:px-6">
          <SidebarTrigger aria-label="Collapse or expand sidebar" />
          <div className="relative hidden w-full max-w-xs sm:block">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Search packages, customers..."
              aria-label="Search packages and customers"
              className="pr-11 pl-8"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">
              ⌘K
            </kbd>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              asChild
              className="rounded-sm bg-foreground text-background hover:bg-foreground/85"
            >
              <Link href="/admin/packages/new" aria-label="Register package">
                <Plus />
                <span className="hidden sm:inline">Register package</span>
              </Link>
            </Button>
            <Button variant="outline" size="icon" aria-label="Notifications">
              <Bell />
            </Button>
            <ThemeToggle />
          </div>
          <RouteTransition />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
