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
    // Bags: one document per physical bag; a package's `bag` field marks the active bag it's in.
    db.collection("bags").createIndex({ code: 1 }, { unique: true }),
    db.collection("bags").createIndex({ status: 1, createdAt: -1 }),
    db.collection("bags").createIndex({ "origin.code": 1, createdAt: -1 }),
    db.collection("bags").createIndex({ "destination.code": 1, status: 1 }),
    db.collection("bags").createIndex({ "items.tracking": 1 }),
    db.collection("packages").createIndex({ "bag.code": 1 }, { sparse: true }),
    db.collection("bag_exceptions").createIndex({ bagCode: 1, createdAt: 1 }),
    db.collection("bag_exceptions").createIndex({ status: 1, createdAt: -1 }),
  ]);
  await closeOldLostPackages(db).catch((error) => console.error("Fixing lost packages failed", error));
  return db;
}

// Packages closed as lost before "Lost" became a final status only got a history line, so they
// still showed In transit. Gives them the Lost status, dated when they were closed. Does nothing
// once they're fixed, so it's safe to run on every start.
async function closeOldLostPackages(db) {
  const lostEntry = { $last: { $filter: { input: "$history", cond: { $eq: ["$$this.type", "lost"] } } } };
  const { modifiedCount } = await db.collection("packages").updateMany(
    {
      "history.type": "lost",
      exception: { $exists: false },
      $expr: { $not: { $in: [{ $arrayElemAt: ["$events.step", -1] }, ["lost", "damaged", "delivered"]] } },
    },
    [
      { $set: { lostEntry } },
      {
        $set: {
          status: "Lost",
          date: "$lostEntry.at",
          events: {
            $concatArrays: ["$events", [{ step: "lost", date: "$lostEntry.at", by: "$lostEntry.by", bag: "$lostEntry.bag" }]],
          },
        },
      },
      { $unset: "lostEntry" },
    ],
  );
  if (modifiedCount) console.log(`Marked ${modifiedCount} package(s) closed as lost earlier as Lost`);
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
