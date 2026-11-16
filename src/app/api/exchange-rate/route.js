import { requireAccess } from "@/lib/server/auth";
import { getDb } from "@/lib/server/mongodb";
import { getExchangeRates } from "@/lib/server/exchange";
import { syncPackagePosts } from "@/lib/server/telegram";

// GET /api/exchange-rate: { rates: { ETB, UGX } }, local money per 1 CAD, each null if not set yet.
export async function GET() {
  const access = await requireAccess();
  if (access.denied) return access.denied;
  try {
    return Response.json({ success: true, rates: await getExchangeRates(await getDb()) });
  } catch (error) {
    console.error("Loading exchange rate failed", error);
    return Response.json({ success: false, error: "Couldn't load the exchange rate" }, { status: 500 });
  }
}

// PUT /api/exchange-rate: the owner sets local money per 1 CAD. Body: { etb?, ugx? } (omit one to keep it)
export async function PUT(request) {
  const access = await requireAccess("exchange.manage");
  if (access.denied) return access.denied;
  const body = await request.json().catch(() => null);
  const set = {};
  for (const [key, field] of [["etb", "cadToEtb"], ["ugx", "cadToUgx"]]) {
    if (body?.[key] === undefined) continue;
    const rate = Math.round(Number(body[key]) * 10000) / 10000;
    if (!(rate > 0) || rate > 10000000) {
      return Response.json({ success: false, error: "Enter a rate above zero" }, { status: 400 });
    }
    set[field] = rate;
  }
  if (!Object.keys(set).length) {
    return Response.json({ success: false, error: "Enter a rate above zero" }, { status: 400 });
  }
  try {
    const db = await getDb();
    await db
      .collection("settings")
      .updateOne({ _id: "exchange" }, { $set: { ...set, updatedAt: new Date() } }, { upsert: true });
    // Open packages with a balance show local money in Telegram, so refresh those posts.
    const open = await db
      .collection("packages")
      .find({ $expr: { $lt: ["$amountPaid", "$charge"] }, "telegram.messageId": { $exists: true } })
      .project({ tracking: 1 })
      .limit(100)
      .toArray();
    await syncPackagePosts(db, open.map((pkg) => pkg.tracking));
    return Response.json({ success: true, rates: await getExchangeRates(db) });
  } catch (error) {
    console.error("Saving exchange rate failed", error);
    return Response.json({ success: false, error: "Couldn't save the exchange rate" }, { status: 500 });
  }
}
