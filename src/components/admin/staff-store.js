"use client";

import { useEffect, useSyncExternalStore } from "react";
import { accountRequest } from "@/components/admin/profile-store";

// The team, loaded from /api/staff (owners only) and shared by the Staff page and the
// notifications menu. Changes go through the API, which returns the saved member.
let state = { status: "idle", staff: [], error: "" };
let request;
const listeners = new Set();

function set(changes) {
  state = { ...state, ...changes };
  listeners.forEach((listener) => listener());
}

function load() {
  request ??= accountRequest("/api/staff")
    .then((body) => set({ status: "ready", staff: body.staff, error: "" }))
    .catch((error) => {
      request = undefined;
      set({ status: "error", error: error.message });
    });
  return request;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const SERVER = { status: "idle", staff: [], error: "" };

// `enabled`: false for people who can't manage staff, so nothing is requested for them.
export function useStaff(enabled = true) {
  useEffect(() => {
    if (enabled) load();
  }, [enabled]);
  const snapshot = useSyncExternalStore(subscribe, () => state, () => SERVER);
  return enabled ? snapshot : SERVER;
}

export function reloadStaff() {
  request = undefined;
  return load();
}

function json(method, body) {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function upsert(member) {
  const exists = state.staff.some((current) => current.id === member.id);
  set({
    staff: exists
      ? state.staff.map((current) => (current.id === member.id ? member : current))
      : [...state.staff, member],
  });
}

// Adds someone and emails their invitation. Resolves to { member, invite: { email, link? } }.
export async function inviteStaff(input) {
  const body = await accountRequest("/api/staff", json("POST", input));
  upsert(body.member);
  return body;
}

export async function updateStaff(id, changes) {
  const body = await accountRequest(`/api/staff/${id}`, json("PATCH", changes));
  upsert(body.member);
  return body;
}

export async function resendInvite(id) {
  const body = await accountRequest(`/api/staff/${id}/invite`, { method: "POST" });
  upsert(body.member);
  return body;
}

export async function removeStaff(id) {
  await accountRequest(`/api/staff/${id}`, { method: "DELETE" });
  set({ staff: state.staff.filter((member) => member.id !== id) });
}
