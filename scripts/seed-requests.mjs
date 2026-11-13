// Adds sample public-form requests so the Requests page and its sidebar badge can be tried locally.
//   node --env-file=.env.local scripts/seed-requests.mjs          add 3 samples
//   node --env-file=.env.local scripts/seed-requests.mjs --clear  remove the samples again
// Samples are tagged { sample: true }, so --clear never touches real requests.
import { MongoClient } from "mongodb";

const BRANCH = {
  HEAD: { code: "HEAD", name: "Hand to Hand Express Head Office (Toronto)", address: "2017 Danforth Ave, Toronto, ON M4C 1J7" },
  ADD: { code: "ADD", name: "Hand to Hand Express Addis Ababa", address: "Bole, Alemenesh Plaza, 7th Floor, Addis Ababa, Ethiopia" },
};

const SAMPLES = [
  {
    route: "CAET", from: "Canada", to: "Ethiopia", shipping: "normal", branch: BRANCH.HEAD,
    sender: { name: "Mary Johnson", email: "mary.sample@example.com", phone: "+1 416 555 0101", address: "12 Queen St W, Toronto, ON" },
    receiver: { name: "Tigist Alemu", email: "", phone: "0911 234 567", address: "Bole, Addis Ababa" },
    items: [{ description: "Clothes", qty: 2, kg: 4.5 }, { description: "Shoes", qty: 1, kg: 1.2 }],
    notes: "Fragile: contains a gift",
  },
  {
    route: "CAUG", from: "Canada", to: "Uganda", shipping: "express", branch: BRANCH.HEAD,
    sender: { name: "David Okello", email: "david.sample@example.com", phone: "+1 647 555 0102", address: "88 Bloor St E, Toronto, ON" },
    receiver: { name: "Grace Nakato", email: "grace.sample@example.com", phone: "+256 700 123 456", address: "Kololo, Kampala" },
    items: [{ description: "Electronics", qty: 1, kg: 3 }],
    notes: "Urgent",
  },
  {
    route: "ETCA", from: "Ethiopia", to: "Canada", shipping: "normal", branch: BRANCH.ADD,
    sender: { name: "Hana Bekele", email: "hana.sample@example.com", phone: "0922 345 678", address: "Piassa, Addis Ababa" },
    receiver: { name: "Samuel Mulu", email: "", phone: "+1 905 555 0103", address: "45 King St, Mississauga, ON" },
    items: [{ description: "Coffee", qty: 3, kg: 6 }, { description: "Spices", qty: 2, kg: 2 }],
    notes: "",
  },
];

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db(process.env.MONGODB_DB || "h2h-express");
const requests = db.collection("requests");

if (process.argv.includes("--clear")) {
  const { deletedCount } = await requests.deleteMany({ sample: true });
  console.log(`Removed ${deletedCount} sample request(s).`);
} else {
  for (const [index, sample] of SAMPLES.entries()) {
    const counter = await db
      .collection("counters")
      .findOneAndUpdate({ _id: "request" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
    const code = `REQ-${String(counter.seq).padStart(6, "0")}`;
    await requests.insertOne({
      code, status: "pending", ...sample, submissionMethod: "remote", photos: [],
      sample: true,
      createdAt: new Date(Date.now() - (SAMPLES.length - index) * 25 * 60 * 1000),
    });
    console.log(`Added ${code}: ${sample.sender.name} → ${sample.receiver.name}`);
  }
}
await client.close();
