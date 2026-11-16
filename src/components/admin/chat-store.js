"use client";

import { useEffect, useState } from "react";
import { accountRequest } from "@/components/admin/profile-store";
import { useInboxEvents, useRealtimeStatus } from "@/components/admin/realtime";

// Staff chat: requests to /api/chat, plus the unread count shown on the sidebar. Messages live
// in the database; open screens poll for new ones.

const listeners = new Set();

// Tells the sidebar badge to recount now (after reading or sending), instead of on its next poll.
export function notifyChatChanged() {
  listeners.forEach((listener) => listener());
}

// Unread messages across every conversation, refreshed on page change, when a message signal
// arrives, when the chat page reports a change, and on a timer (15s, or 60s while real-time
// is connected and the timer is only a backup).
export function useChatUnread(enabled, pathname) {
  const [count, setCount] = useState(0);
  const live = useRealtimeStatus();
  useInboxEvents((event) => event?.type === "message" && notifyChatChanged());
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    function load() {
      fetch("/api/chat/unread", { cache: "no-store" })
        .then((response) => response.json())
        .then((result) => !cancelled && result.success && setCount(result.count))
        .catch(() => {});
    }
    load();
    listeners.add(load);
    const timer = setInterval(() => document.visibilityState === "visible" && load(), live ? 60000 : 15000);
    return () => {
      cancelled = true;
      listeners.delete(load);
      clearInterval(timer);
    };
  }, [enabled, pathname, live]);
  return enabled ? count : 0;
}

export function loadChat() {
  return accountRequest("/api/chat", { cache: "no-store" });
}

export async function openDirect(userId) {
  const body = await accountRequest("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  return body.id;
}

export function loadMessages(conversationId, { after, before, q } = {}) {
  const query = new URLSearchParams();
  if (after) query.set("after", after);
  if (before) query.set("before", before);
  if (q) query.set("q", q);
  return accountRequest(`/api/chat/${conversationId}/messages?${query}`, { cache: "no-store" });
}

export async function sendChatMessage(conversationId, text, photos = []) {
  const body = await accountRequest(`/api/chat/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, photos }),
  });
  notifyChatChanged();
  return body.message;
}

export async function markConversationRead(conversationId) {
  await accountRequest(`/api/chat/${conversationId}/read`, { method: "POST" }).catch(() => {});
  notifyChatChanged();
}

export async function setConversationMuted(conversationId, muted) {
  await accountRequest(`/api/chat/${conversationId}/mute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ muted }),
  });
  notifyChatChanged();
}
