"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// The browser side of real-time chat (Ably). One connection per tab, started by
// <RealtimeConnection> in the sidebar so it lives on every admin page. Everything here quietly
// does nothing when the server has no Ably key: chat then relies on polling.

const TYPING_EVERY = 3000;
const TYPING_SHOWN = 5000;

let clientPromise;
let started = "";
const store = { connected: false, online: new Set() };
const storeListeners = new Set();
const inboxListeners = new Set();

function emit() {
  storeListeners.forEach((listener) => listener());
}

function setStore(changes) {
  Object.assign(store, changes);
  snapshot = { ...store };
  emit();
}

let snapshot = { ...store };
const SERVER = snapshot;

async function token() {
  const body = await (await fetch("/api/chat/realtime", { cache: "no-store" })).json();
  if (!body.success || !body.enabled) throw new Error("Real-time chat is off");
  return body.tokenRequest;
}

// Resolves to the Ably client, or null when real-time isn't set up.
function client() {
  clientPromise ??= (async () => {
    let first;
    try {
      first = await token();
    } catch {
      return null;
    }
    // The device package: required for accounts billed per monthly active user.
    const { createClient } = await import("@ably/pubsub-device");
    const realtime = createClient({
      authCallback: (params, callback) => {
        if (first) {
          const ready = first;
          first = null;
          callback(null, ready);
          return;
        }
        token().then((request) => callback(null, request), (error) => callback(error.message, null));
      },
      // Our own typing signals don't need to come back to us.
      echoMessages: false,
    });
    realtime.connection.on((change) => setStore({ connected: change.current === "connected" }));
    return realtime;
  })().catch(() => null);
  return clientPromise;
}

// Opens the connection for the signed-in person: their inbox and staff presence.
async function start(userId) {
  if (started === userId) return;
  started = userId;
  const realtime = await client();
  if (!realtime) return;

  realtime.channels.get(`user:${userId}`).subscribe("chat", (message) => {
    // A new conversation they're in: renew the pass so it covers it.
    if (message.data?.type === "conversation") realtime.auth.authorize().catch(() => {});
    inboxListeners.forEach((listener) => listener(message.data));
  });

  const presence = realtime.channels.get("presence:staff").presence;
  const refresh = () =>
    presence
      .get()
      .then((members) => setStore({ online: new Set(members.map((member) => member.clientId)) }))
      .catch(() => {});
  presence.subscribe(refresh);
  await presence.enter().catch(() => {});
  refresh();
}

// Mounted once in the admin sidebar.
export function RealtimeConnection({ userId, enabled }) {
  useEffect(() => {
    if (enabled && userId) start(userId);
  }, [enabled, userId]);
  return null;
}

function subscribeStore(listener) {
  storeListeners.add(listener);
  return () => storeListeners.delete(listener);
}

function useStore() {
  return useSyncExternalStore(subscribeStore, () => snapshot, () => SERVER);
}

// True while connected to Ably, so screens can poll less often.
export function useRealtimeStatus() {
  return useStore().connected;
}

// Ids of people who have the portal open.
export function useOnline() {
  return useStore().online;
}

// Calls `handler({ type, conversationId, messageId })` for each signal in the person's inbox.
export function useInboxEvents(handler) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const listener = (data) => latest.current(data);
    inboxListeners.add(listener);
    return () => inboxListeners.delete(listener);
  }, []);
}

// Who's typing in a conversation, and a function to say "I'm typing" (sent at most every 3s).
export function useTyping(conversationId, name, selfId) {
  const [typing, setTyping] = useState({});
  const lastSent = useRef(0);
  const channelRef = useRef(null);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    let channel;
    const listener = (message) => {
      // The same person typing in another of their tabs isn't news.
      if (message.clientId === selfId) return;
      setTyping((current) => {
        const next = { ...current };
        if (message.data?.done) delete next[message.clientId];
        else next[message.clientId] = { name: message.data?.name ?? "Someone", until: Date.now() + TYPING_SHOWN };
        return next;
      });
    };
    client().then((realtime) => {
      if (!realtime || cancelled) return;
      channel = realtime.channels.get(`chat:${conversationId}`);
      channelRef.current = channel;
      channel.subscribe("typing", listener);
    });
    // Drop names that stopped typing.
    const timer = setInterval(() => {
      setTyping((current) => {
        const now = Date.now();
        const kept = Object.entries(current).filter(([, entry]) => entry.until > now);
        return kept.length === Object.keys(current).length ? current : Object.fromEntries(kept);
      });
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      setTyping({});
      channelRef.current = null;
      if (channel) {
        channel.unsubscribe("typing", listener);
        channel.detach().catch(() => {});
      }
    };
  }, [conversationId, selfId]);

  function notify(done = false) {
    const channel = channelRef.current;
    if (!channel) return;
    const now = Date.now();
    if (!done && now - lastSent.current < TYPING_EVERY) return;
    lastSent.current = done ? 0 : now;
    channel.publish("typing", done ? { done: true } : { name }).catch(() => {});
  }

  return {
    typingNames: Object.values(typing).map((entry) => entry.name),
    notifyTyping: () => notify(false),
    stoppedTyping: () => notify(true),
  };
}
