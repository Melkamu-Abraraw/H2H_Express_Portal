// Pages under Packages in the sidebar. In transit packages are followed through their bags;
// All packages can still show them (?status=In%20transit).
export const packageViews = [
  { slug: "received", label: "Received", status: "Received" },
  { slug: "pickup", label: "Ready for pickup", status: "Ready for pickup" },
  { slug: "delivered", label: "Delivered", status: "Delivered" },
];

export const statusDots = {
  Received: "bg-status-received",
  "In transit": "bg-status-transit",
  "Ready for pickup": "bg-status-pickup",
  Delivered: "bg-status-good",
  Lost: "bg-status-bad",
  Damaged: "bg-status-warn",
};

// Tinted pills for compact lists (e.g. the customer card).
export const statusPills = {
  Received: "bg-status-received/15 text-status-received",
  "In transit": "bg-status-transit/15 text-status-transit",
  "Ready for pickup": "bg-status-pickup/15 text-status-pickup",
  Delivered: "bg-status-good/15 text-status-good",
  Lost: "bg-status-bad/15 text-status-bad",
  Damaged: "bg-status-warn/15 text-status-warn",
};
