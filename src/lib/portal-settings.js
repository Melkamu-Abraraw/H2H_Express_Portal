// Business-wide settings, stored in the database and shared by everyone. Used on both sides:
// the server validates with these rules and the browser falls back to the defaults while loading.

export const DEFAULT_SETTINGS = {
  business: {
    name: "H2H Express",
    phone: "",
    email: "",
    website: "",
  },
  // Packages waiting longer than this at pickup are flagged on the packages page.
  pickupReminderDays: 3,
  // A fixed business rule (the server enforces it when marking packages delivered).
  requirePaymentBeforeDelivery: true,
  // Which status emails customers get (sender and receiver, when they gave an email).
  customerEmails: { departed: true, pickup: true, delivered: true, lost: true },
};

export const CUSTOMER_EMAIL_STEPS = ["departed", "pickup", "delivered", "lost"];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class InvalidSetting extends Error {
  constructor(message, field) {
    super(message);
    this.field = field;
  }
}

function text(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Fills in anything missing from a stored document.
export function withDefaults(saved = {}) {
  return {
    business: { ...DEFAULT_SETTINGS.business, ...saved.business },
    pickupReminderDays: saved.pickupReminderDays ?? DEFAULT_SETTINGS.pickupReminderDays,
    requirePaymentBeforeDelivery: true,
    customerEmails: { ...DEFAULT_SETTINGS.customerEmails, ...saved.customerEmails },
  };
}

// Validates a change from the Settings page; only the keys given are returned.
export function parseSettings(body) {
  const out = {};
  if (body?.business !== undefined) {
    const business = {
      name: text(body.business?.name, 120),
      phone: text(body.business?.phone, 40),
      email: text(body.business?.email, 200),
      website: text(body.business?.website, 300),
    };
    if (!business.name) throw new InvalidSetting("Enter your business name.", "name");
    if (business.email && !EMAIL.test(business.email)) throw new InvalidSetting("Enter a valid email address.", "email");
    if (business.website && !URL.canParse(business.website)) {
      throw new InvalidSetting("Enter a full address, e.g. https://h2hexpress.com", "website");
    }
    out.business = business;
  }
  if (body?.pickupReminderDays !== undefined) {
    const days = Number(body.pickupReminderDays);
    if (!Number.isInteger(days) || days < 1 || days > 60) {
      throw new InvalidSetting("Enter a whole number of days from 1 to 60.", "pickupReminderDays");
    }
    out.pickupReminderDays = days;
  }
  if (body?.customerEmails !== undefined) {
    out.customerEmails = Object.fromEntries(
      CUSTOMER_EMAIL_STEPS.map((step) => [step, body.customerEmails?.[step] !== false]),
    );
  }
  return out;
}
