export const packageViews = [
  { slug: "received", label: "Received", status: "Received" },
  { slug: "in-transit", label: "In transit", status: "In transit" },
  { slug: "pickup", label: "Pickup", status: "Ready for pickup" },
  { slug: "delivered", label: "Delivered", status: "Delivered" },
];

export const statusDots = {
  Received: "bg-status-received",
  "In transit": "bg-status-transit",
  "Ready for pickup": "bg-status-pickup",
  Delivered: "bg-status-good",
};

// Tinted pills for compact lists (e.g. the customer card).
export const statusPills = {
  Received: "bg-status-received/15 text-status-received",
  "In transit": "bg-status-transit/15 text-status-transit",
  "Ready for pickup": "bg-status-pickup/15 text-status-pickup",
  Delivered: "bg-status-good/15 text-status-good",
};
