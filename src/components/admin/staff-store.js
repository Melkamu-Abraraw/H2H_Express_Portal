"use client";

import { useSyncExternalStore } from "react";

// Staff live in this browser until the portal has a backend (and sign-in) to store them.
const STORAGE_KEY = "h2h-staff";
const CHANGE_EVENT = "h2h-staff-change";

export const ROLES = [
  {
    value: "Owner",
    description: "Everything, including staff and routes.",
  },
  {
    value: "Manager",
    description: "Packages, payments, customers and routes. Can't manage staff.",
  },
  {
    value: "Front desk",
    description: "Registers packages, records payments and looks up customers.",
  },
  {
    value: "Warehouse",
    description: "Updates package tracking steps only.",
  },
];

// Placeholder staff: replace with real accounts when the backend exists.
// Fictional numbers (555-01xx is reserved for fiction in North America).
const SAMPLE_STAFF = [
  ["Abebe Girma", "Owner", "HEAD", "+1 555-0160", [2026, 10, 10, 9, 12]],
  ["Hiwot Mekonnen", "Manager", "HEAD", "+1 555-0161", [2026, 10, 10, 8, 40]],
  ["Daniel Kato", "Front desk", "OSSI", "+1 555-0162", [2026, 10, 9, 17, 5]],
  ["Sara Tesfaye", "Front desk", "ADD", "+251 11 555 0163", [2026, 10, 10, 11, 30]],
  ["Yared Bekele", "Warehouse", "HEAD", "+1 555-0164", [2026, 10, 8, 14, 20]],
  ["Lulit Haile", "Front desk", "HEAD", "+1 555-0165", [2026, 9, 21, 10, 0], false],
].map(([name, role, branch, phone, lastActive, active = true], index) => ({
  id: `STF-${String(index + 1).padStart(3, "0")}`,
  name,
  email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
  phone,
  role,
  branch,
  active,
  lastActive: new Date(...lastActive).toISOString(),
}));

let cachedRaw;
let cachedStaff = SAMPLE_STAFF;

function readRaw() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parse(raw) {
  if (raw === cachedRaw) return cachedStaff;
  cachedRaw = raw;
  try {
    const saved = raw ? JSON.parse(raw) : null;
    cachedStaff = Array.isArray(saved) ? saved : SAMPLE_STAFF;
  } catch {
    cachedStaff = SAMPLE_STAFF;
  }
  return cachedStaff;
}

function subscribe(onChange) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useStaff() {
  return parse(useSyncExternalStore(subscribe, readRaw, () => null));
}

function write(change) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(change(parse(readRaw()))));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function nextId(staff) {
  const highest = Math.max(0, ...staff.map((member) => Number(member.id.slice(4)) || 0));
  return `STF-${String(highest + 1).padStart(3, "0")}`;
}

// Adds a new member when `member.id` is missing, otherwise updates that member.
export function saveStaffMember(member) {
  write((staff) =>
    member.id
      ? staff.map((current) => (current.id === member.id ? { ...current, ...member } : current))
      : [...staff, { ...member, id: nextId(staff), active: true, lastActive: null }],
  );
}

export function setStaffActive(id, active) {
  write((staff) => staff.map((member) => (member.id === id ? { ...member, active } : member)));
}

export function removeStaffMember(id) {
  write((staff) => staff.filter((member) => member.id !== id));
}

export function resetStaff() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
