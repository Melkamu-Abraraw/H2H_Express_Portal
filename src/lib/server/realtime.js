// The server package marks our traffic as server-side, which accounts billed per monthly
// active user require (the plain "ably" package is refused with error 40168).
import { createHttpClient } from "@ably/pubsub-server";
import { after } from "next/server";

// Real-time signals for staff chat through Ably. Only ids, presence and typing go through
// Ably; message text stays in MongoDB and is always loaded from our own API. Without
// ABLY_API_KEY everything here is a no-op and chat falls back to polling.
//   user:<userId>         that person's inbox: "something changed in conversation X"
//   chat:<conversationId> typing signals while a conversation is open
//   presence:staff        who has the portal open

export const PRESENCE_CHANNEL = "presence:staff";
const TOKEN_TTL = 15 * 60 * 1000;
// Ably's limit for one batch publish.
const BATCH_CHANNELS = 100;

const cache = globalThis;

export function realtimeEnabled() {
  return Boolean(process.env.ABLY_API_KEY);
}

function rest() {
  cache.h2hAbly ??= createHttpClient({ key: process.env.ABLY_API_KEY });
  return cache.h2hAbly;
}

// A short-lived pass that lets this person listen only to their own inbox, the conversations
// they're allowed in, and staff presence. clientId ties typing and presence to their account.
export function tokenRequestFor(user, conversationIds) {
  const capability = {
    [`user:${user._id}`]: ["subscribe"],
    [PRESENCE_CHANNEL]: ["presence", "subscribe"],
  };
  for (const id of conversationIds) capability[`chat:${id}`] = ["subscribe", "publish"];
  return rest().auth.createTokenRequest({ clientId: String(user._id), capability, ttl: TOKEN_TTL });
}

// Tells each person's open tabs that something happened. Sent after the response, so a slow
// or unreachable Ably never delays the request; if it fails, screens catch up by polling.
export function announce(userIds, data) {
  if (!realtimeEnabled() || !userIds.length) return;
  after(async () => {
    const channels = [...new Set(userIds.map((id) => `user:${id}`))];
    const batches = [];
    for (let start = 0; start < channels.length; start += BATCH_CHANNELS) {
      batches.push({ channels: channels.slice(start, start + BATCH_CHANNELS), messages: [{ name: "chat", data }] });
    }
    try {
      await rest().batchPublish(batches);
    } catch (error) {
      console.error("Real-time announce failed", error);
    }
  });
}
