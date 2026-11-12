import { connection } from "next/server";
import { publicTracking, toPublicTracking } from "@/components/tracking/public-tracking";
import { getDb } from "@/lib/server/mongodb";

// Only the fields the public page needs; contact details and amounts never leave the database.
const PUBLIC_FIELDS = {
  _id: 0,
  tracking: 1,
  route: 1,
  from: 1,
  to: 1,
  receiver: 1,
  events: 1,
  weight: 1,
  charge: 1,
  amountPaid: 1,
};

export async function findPublicTracking(number) {
  const tracking = String(number).trim().toUpperCase();
  const sample = publicTracking(tracking);
  if (sample) return sample;
  if (!/^H2H-[A-Z0-9]{2,12}-\d{6}$/.test(tracking)) return null;
  // Real packages change, so look them up when the page is requested, never at build time.
  await connection();

  const db = await getDb();
  const pkg = await db.collection("packages").findOne({ tracking }, { projection: PUBLIC_FIELDS });
  return pkg ? toPublicTracking(pkg) : null;
}
