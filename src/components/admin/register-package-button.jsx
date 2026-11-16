"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { can } from "@/lib/permissions";
import { useProfile } from "@/components/admin/profile-store";
import { Button } from "@/components/ui/button";

// Header shortcut, shown only to people whose role can register packages.
export function RegisterPackageButton() {
  const profile = useProfile();
  if (!can(profile, "packages.create")) return null;
  return (
    <Button asChild className="rounded-sm bg-foreground text-background hover:bg-foreground/85">
      <Link href="/admin/packages/new" aria-label="Register package">
        <Plus />
        <span className="hidden sm:inline">Register package</span>
      </Link>
    </Button>
  );
}
