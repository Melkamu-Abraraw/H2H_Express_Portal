"use client";

import { useEffect, useSyncExternalStore } from "react";

// The signed-in user, loaded once from /api/account and shared by every component that shows
// them. Edits go through the account API, which returns the updated user for this store.
const EMPTY = { id: "", name: "", email: "", role: "", title: "", photo: "" };

let state = { loaded: false, user: EMPTY };
let request;
const listeners = new Set();

export function initialsOf(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)[0] : (parts[0]?.[1] ?? ""))).toUpperCase();
}

function derive(user, loaded) {
  return { ...user, loaded, firstName: user.name.trim().split(/\s+/)[0] ?? "", initials: initialsOf(user.name) };
}

let snapshot = derive(EMPTY, false);
const SERVER = snapshot;

function emit() {
  snapshot = derive(state.user, state.loaded);
  listeners.forEach((listener) => listener());
}

export function setProfile(user) {
  state = { loaded: true, user: { ...EMPTY, ...user } };
  emit();
}

function toLogin() {
  const next = window.location.pathname + window.location.search;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

// Sends a request to the account API; a 401 means the session ended, so go back to sign in.
export async function accountRequest(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) {
    toLogin();
    throw new Error("Your session ended. Sign in again.");
  }
  if (!response.ok || !body.success) {
    const error = new Error(body.error || "Something went wrong. Try again.");
    error.field = body.field;
    throw error;
  }
  if (body.user) setProfile(body.user);
  return body;
}

function load() {
  request ??= accountRequest("/api/account").catch(() => {
    // Let a later mount try again.
    request = undefined;
  });
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useProfile() {
  useEffect(load, []);
  return useSyncExternalStore(subscribe, () => snapshot, () => SERVER);
}

export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  state = { loaded: false, user: EMPTY };
  request = undefined;
  emit();
  // A full load so no signed-in page stays in the router cache.
  window.location.assign("/login");
}

const PHOTO_MAX = 512;

// Shrinks the chosen image before upload. It is not cropped here: the avatar crops it when
// shown, favouring the top so faces in portrait photos aren't cut off.
export async function photoFromFile(file) {
  if (!file?.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That image couldn't be read.");
  });
  const scale = Math.min(1, PHOTO_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("That image couldn't be read."))), "image/jpeg", 0.85),
  );
}

export function uploadPhoto(blob) {
  const form = new FormData();
  form.append("photo", blob, "photo.jpg");
  return accountRequest("/api/account/photo", { method: "POST", body: form });
}

export function removePhoto() {
  return accountRequest("/api/account/photo", { method: "DELETE" });
}

export function saveName(name) {
  return accountRequest("/api/account", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function changePassword(currentPassword, newPassword) {
  return accountRequest("/api/account/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
