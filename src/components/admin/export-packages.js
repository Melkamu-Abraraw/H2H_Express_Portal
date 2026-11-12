import { format } from "date-fns";
import { balanceDue, currencyOf } from "@/components/admin/package-payments";
import { trackingSteps } from "@/components/admin/package-tracking";
import { packageCountries } from "@/components/admin/shipping-routes";

const COLUMNS = [
  ["Tracking #", (item) => item.tracking],
  ["Sender", (item) => item.sender],
  ["Receiver", (item) => item.receiver],
  ["From", (item) => packageCountries(item).from.name],
  ["To", (item) => packageCountries(item).to.name],
  ["Status", (item) => item.status],
  [
    "Current step",
    (item) =>
      trackingSteps(item.route).find((step) => step.key === item.events.at(-1).step)?.label ?? "",
  ],
  ["Payment", (item) => item.payment],
  ["Charge", (item) => item.charge.toFixed(2)],
  ["Amount paid", (item) => item.amountPaid.toFixed(2)],
  ["Balance due", (item) => balanceDue(item).toFixed(2)],
  ["Currency", (item) => currencyOf(item)],
  ["Weight (kg)", (item) => item.weight.toFixed(1)],
  ["Updated", (item) => format(item.date, "yyyy-MM-dd HH:mm")],
];

function cell(value) {
  const text = String(value ?? "");
  // Quote fields with separators, and neutralise leading formula characters for spreadsheets.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

// Downloads rows as a CSV file. `columns` is a list of [header, valueOf(row)] pairs.
export function downloadCsv(name, columns, rows) {
  const lines = [
    columns.map(([header]) => cell(header)).join(","),
    ...rows.map((item) => columns.map(([, value]) => cell(value(item))).join(",")),
  ];
  // The BOM lets Excel detect UTF-8 so names and arrows display correctly.
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `h2h-${name}-${format(new Date(), "yyyy-MM-dd")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadPackagesCsv(rows) {
  downloadCsv("packages", COLUMNS, rows);
}
