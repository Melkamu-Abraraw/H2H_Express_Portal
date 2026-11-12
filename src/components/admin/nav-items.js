import {
  CreditCard,
  FileText,
  House,
  Inbox,
  MapPin,
  Package,
  Settings,
  UserCog,
  Users,
} from "lucide-react";
import { packageViews } from "@/components/admin/package-views";

export const mainNav = [
  { label: "Dashboard", href: "/admin", icon: House },
  {
    label: "Packages",
    href: "/admin/packages",
    icon: Package,
    children: [
      { label: "All packages", href: "/admin/packages" },
      ...packageViews.map(({ label, slug }) => ({
        label,
        href: `/admin/packages/${slug}`,
      })),
    ],
  },
  { label: "Requests", href: "/admin/requests", icon: Inbox },
  { label: "Customers", href: "/admin/customers", icon: Users },
  // { label: "Manifests", href: "/admin/manifests", icon: FileText },
  {
    label: "Payments",
    href: "/admin/payments",
    icon: CreditCard,
  },
];

export const manageNav = [
  { label: "Routes", href: "/admin/routes", icon: MapPin },
  { label: "Staff", href: "/admin/staff", icon: UserCog },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];
