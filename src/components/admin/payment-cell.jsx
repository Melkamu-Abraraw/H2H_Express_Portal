import { formatMoney } from "@/components/admin/pricing-store";
import { balanceDue, currencyOf } from "@/components/admin/package-payments";

export function PaymentCell({ pkg }) {
  const due = balanceDue(pkg);
  const currency = currencyOf(pkg);

  if (due === 0) {
    return (
      <div className="flex flex-col leading-tight">
        <span className="font-medium">Paid</span>
        <span className="text-xs text-muted-foreground">{formatMoney(pkg.charge, currency)}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col leading-tight">
      <span className="inline-flex items-center gap-1.5 font-medium text-status-warn">
        <span className="size-2 rounded-full bg-status-warn" aria-hidden="true" />
        Pending
      </span>
      <span className="text-xs text-status-warn">{formatMoney(due, currency)} due</span>
    </div>
  );
}
