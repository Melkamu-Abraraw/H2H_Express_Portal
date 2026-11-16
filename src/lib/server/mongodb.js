import { MongoClient } from "mongodb";

// One client per server process; in dev the module reloads, so keep it on globalThis.
const cache = globalThis;

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  const client = await new MongoClient(uri).connect();
  const db = client.db(process.env.MONGODB_DB || "h2h-express");
  await Promise.all([
    db.collection("packages").createIndex({ tracking: 1 }, { unique: true }),
    db.collection("packages").createIndex({ createdAt: -1 }),
    db.collection("payments").createIndex({ receiptNo: 1 }, { unique: true }),
    db.collection("payments").createIndex({ tracking: 1 }),
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("users").createIndex({ "invite.tokenHash": 1 }, { sparse: true }),
    db.collection("sessions").createIndex({ userId: 1 }),
    // MongoDB deletes each session once its expiresAt has passed.
    db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("conversations").createIndex({ key: 1 }, { unique: true }),
    db.collection("messages").createIndex({ conversationId: 1, _id: -1 }),
    db.collection("chat_reads").createIndex({ userId: 1, conversationId: 1 }, { unique: true }),
  ]);
  return db;
}

export function getDb() {
  cache.h2hDb ??= connect().catch((error) => {
    // Let the next request try again instead of caching the failure.
    cache.h2hDb = undefined;
    throw error;
  });
  return cache.h2hDb;
}

// Atomic counter, so two desks registering at once never get the same number.
export async function nextSequence(db, name) {
  const counter = await db
    .collection("counters")
    .findOneAndUpdate(
      { _id: name },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  return counter.seq;
}
