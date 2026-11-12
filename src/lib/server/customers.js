import { createHash } from "node:crypto";
import { getDb } from "@/lib/server/mongodb";

// Customers aren't stored separately yet: they're built from the packages people send and
// receive. The same name with the same phone number is one person; without a phone, the name.
const FIELDS = {
  _id: 0,
  tracking: 1,
  route: 1,
  from: 1,
  to: 1,
  currency: 1,
  status: 1,
  charge: 1,
  amountPaid: 1,
  senderContact: 1,
  receiverContact: 1,
  createdAt: 1,
  date: 1,
};

// "+251 911 234567", "251911234567" and "0911 234567" are the same Ethiopian number;
// "+1 416 555 0100" and "416-555-0100" the same Canadian one.
export function normalizePhone(phone) {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith("251")) return digits.slice(3);
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

// Ignores capitals, extra spaces and punctuation: "Abel  Tesfaye." = "abel tesfaye".
export function normalizeName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Same name and same phone = same customer; their new packages add to their activity.
function personKey(contact) {
  const name = normalizeName(contact?.name);
  const phone = normalizePhone(contact?.phone);
  return phone.length >= 6 ? `tel:${phone}|${name}` : `name:${name}`;
}

// Stable, opaque id so links keep working and phone numbers don't end up in URLs.
function customerId(key) {
  return `CUS-${createHash("sha1").update(key).digest("hex").slice(0, 8).toUpperCase()}`;
}

function addTotal(totals, currency, amount) {
  if (amount > 0) totals.set(currency, Math.round(((totals.get(currency) ?? 0) + amount) * 100) / 100);
}

export async function listCustomers() {
  const db = await getDb();
  const packages = await db
    .collection("packages")
    .find({}, { projection: FIELDS })
    .sort({ createdAt: 1 })
    .toArray();

  const people = new Map();
  function person(contact, country, date) {
    const key = personKey(contact);
    if (!people.has(key)) {
      people.set(key, {
        id: customerId(key),
        type: "Customer",
        name: contact.name,
        phone: contact.phone ?? "",
        email: contact.email ?? "",
        address: contact.address ?? "",
        city: contact.address ?? "",
        country,
        customerSince: date,
        lastActive: date,
        sent: 0,
        received: 0,
        dues: new Map(),
        spent: new Map(),
        receivers: new Map(),
        recent: [],
        notes: "",
      });
    }
    const entry = people.get(key);
    // The latest package has the freshest name, email and address.
    if (date >= entry.lastActive) {
      entry.lastActive = date;
      entry.name = contact.name || entry.name;
      entry.email = contact.email || entry.email;
      entry.address = contact.address || entry.address;
      entry.city = entry.address;
      entry.country = country || entry.country;
    }
    return entry;
  }

  for (const pkg of packages) {
    if (!pkg.senderContact || !pkg.receiverContact) continue;
    const date = pkg.createdAt ?? pkg.date;
    const sender = person(pkg.senderContact, pkg.from, date);
    sender.sent += 1;
    addTotal(sender.dues, pkg.currency, Math.max(0, pkg.charge - pkg.amountPaid));
    addTotal(sender.spent, pkg.currency, pkg.amountPaid);
    sender.recent.push({ tracking: pkg.tracking, status: pkg.status, date });

    const receiverKey = personKey(pkg.receiverContact);
    const saved = sender.receivers.get(receiverKey) ?? {
      name: pkg.receiverContact.name,
      route: pkg.route,
      country: pkg.to,
      phone: pkg.receiverContact.phone ?? "",
      email: pkg.receiverContact.email ?? "",
      city: pkg.receiverContact.address ?? "",
      count: 0,
    };
    saved.count += 1;
    saved.route = pkg.route;
    sender.receivers.set(receiverKey, saved);

    person(pkg.receiverContact, pkg.to, date).received += 1;
  }

  return [...people.values()]
    .map(({ dues, spent, receivers, recent, ...rest }) => ({
      ...rest,
      dues: [...dues.entries()],
      spent: [...spent.entries()],
      savedReceivers: [...receivers.values()].sort((a, b) => b.count - a.count),
      recentPackages: recent
        .sort((a, b) => b.date - a.date)
        .slice(0, 3)
        .map(({ tracking, status }) => ({ tracking, status })),
    }))
    .sort((a, b) => b.lastActive - a.lastActive);
}

// What the registration form needs to start a package for an existing customer.
export async function customerPrefill(id, receiverName) {
  if (!id) return null;
  const customer = (await listCustomers()).find((person) => person.id === id);
  if (!customer) return null;
  const receiver = customer.savedReceivers.find((saved) => saved.name === receiverName) ?? null;
  return {
    customerId: customer.id,
    sender: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
    },
    savedReceivers: customer.savedReceivers.map(({ name, phone, email, city, route }) => ({
      name,
      phone,
      email,
      address: city,
      route,
    })),
    receiverName: receiver?.name ?? null,
    direction: receiver?.route ?? customer.savedReceivers[0]?.route ?? null,
  };
}
