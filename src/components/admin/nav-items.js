import {
  CreditCard,
  ShoppingBag,
  House,
  Inbox,
  MapPin,
  MessagesSquare,
  Package,
  Settings,
  UserCog,
  Users,
} from "lucide-react";
import { packageViews } from "@/components/admin/package-views";

// Each item names the permission (see src/lib/permissions.js) needed to see it.
export const mainNav = [
  { label: "Dashboard", href: "/admin", icon: House, permission: "dashboard" },
  {
    label: "Packages",
    href: "/admin/packages",
    icon: Package,
    permission: "packages.view",
    children: [
      { label: "All packages", href: "/admin/packages" },
      ...packageViews.map(({ label, slug }) => ({
        label,
        href: `/admin/packages/${slug}`,
      })),
    ],
  },
  { label: "Requests", href: "/admin/requests", icon: Inbox, permission: "requests.view" },
  { label: "Customers", href: "/admin/customers", icon: Users, permission: "customers.view" },
  {
    label: "Bags",
    href: "/admin/bags",
    icon: ShoppingBag,
    permission: "bags.view",
    children: [
      { label: "All bags", href: "/admin/bags" },
      { label: "Incoming", href: "/admin/bags/incoming" },
      { label: "Reports", href: "/admin/bags/reports", permission: "bags.reports" },
    ],
  },
  {
    label: "Payments",
    href: "/admin/payments",
    icon: CreditCard,
    permission: "payments.view",
  },
];

export const manageNav = [
  { label: "Routes", href: "/admin/routes", icon: MapPin, permission: "routes.manage" },
  { label: "Staff", href: "/admin/staff", icon: UserCog, permission: "staff.manage" },
];

// A utility rather than a daily destination, so it sits at the bottom of the sidebar.
export const utilityNav = [
  { label: "Chat", href: "/admin/chat", icon: MessagesSquare, permission: "chat.use" },
  { label: "Settings", href: "/admin/settings", icon: Settings, permission: "settings.view" },
];
