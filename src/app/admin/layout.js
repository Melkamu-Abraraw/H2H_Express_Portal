import { AppSidebar } from "@/components/admin/app-sidebar";
import { HeaderSearch } from "@/components/admin/header-search";
import { NotificationsMenu } from "@/components/admin/notifications-menu";
import { RegisterPackageButton } from "@/components/admin/register-package-button";
import { RouteTransition } from "@/components/route-transition";
import { ThemeToggle } from "@/components/admin/theme-toggle";
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
          <HeaderSearch />
          <RegisterPackageButton />
          <div className="ml-auto flex items-center gap-2">
            <NotificationsMenu />
            <ThemeToggle />
          </div>
          <RouteTransition />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
