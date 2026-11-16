// Special handling a package can be flagged with when it is registered. These show as issue
// alerts on the dashboard until the package is delivered, and on its Telegram card.
export const HANDLING = [
  { key: "very-urgent", label: "Very urgent", severity: "critical" },
  { key: "urgent", label: "Urgent", severity: "critical" },
  { key: "rush", label: "Rush", severity: "warning" },
  { key: "fragile", label: "Fragile", severity: "warning" },
  { key: "special-care", label: "Special care", severity: "warning" },
];

const KEYS = new Set(HANDLING.map((item) => item.key));

// Cleans untrusted input into { flags, rushBy } or null. A rush needs a "YYYY-MM-DD" deadline.
export function parseHandling(value) {
  const flags = HANDLING.map((item) => item.key).filter((key) => Array.isArray(value?.flags) && value.flags.includes(key) && KEYS.has(key));
  if (!flags.length) return null;
  const rushBy = flags.includes("rush") && /^\d{4}-\d{2}-\d{2}$/.test(value?.rushBy ?? "") ? value.rushBy : "";
  return { flags, rushBy };
}

export function handlingLabels(handling) {
  if (!handling?.flags?.length) return [];
  return HANDLING.filter((item) => handling.flags.includes(item.key)).map((item) =>
    item.key === "rush" && handling.rushBy ? `Rush (by ${handling.rushBy})` : item.label,
  );
}
