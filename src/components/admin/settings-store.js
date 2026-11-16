"use client";

import { accountRequest } from "@/components/admin/profile-store";
import { applyConfig, json, useConfig } from "@/components/admin/config-store";

// Business settings, shared by everyone and stored on the server (see /api/settings).
export { DEFAULT_SETTINGS } from "@/lib/portal-settings";

export function useSettings() {
  return useConfig().settings;
}

// Saves { business?, pickupReminderDays? }. Rejects with the server's message (and `field`).
export async function saveSettings(changes) {
  const body = await accountRequest("/api/settings", json("PUT", changes));
  applyConfig({ settings: body.settings });
  return body.settings;
}
