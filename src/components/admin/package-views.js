export const packageViews = [
  { slug: "in-transit", label: "In transit", status: "In transit" },
  { slug: "pickup", label: "Pickup", status: "Ready for pickup" },
  { slug: "delivered", label: "Delivered", status: "Delivered" },
];

export const statusDots = {
  "In transit": "bg-brand",
  "Ready for pickup": "bg-foreground",
  Delivered: "bg-status-good",
};

// Tinted pills for compact lists (e.g. the customer card).
export const statusPills = {
  "In transit": "bg-brand/20 text-foreground",
  "Ready for pickup": "bg-chart-5/15 text-chart-5",
  Delivered: "bg-status-good/15 text-status-good",
};
