// The owner's rates: how much local money one Canadian dollar buys. One document in settings.
export async function getExchangeRates(db) {
  const doc = await db.collection("settings").findOne({ _id: "exchange" });
  return {
    ETB: doc?.cadToEtb > 0 ? doc.cadToEtb : null,
    UGX: doc?.cadToUgx > 0 ? doc.cadToUgx : null,
  };
}

// Birr per CAD only (kept for callers that need just that).
export async function getExchangeRate(db) {
  return (await getExchangeRates(db)).ETB;
}
