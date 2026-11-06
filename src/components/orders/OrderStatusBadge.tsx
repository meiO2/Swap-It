import { getOrderStatusLabel, type OrderShape } from "@/lib/orders";

const colors: Record<string, string> = {
  PENDING_PAYMENT: "bg-warning/15 text-warning",
  PAID: "bg-primary/10 text-primary",
  PROCESSING: "bg-warning/15 text-warning",
  SHIPPED: "bg-info/15 text-info",
  DELIVERED: "bg-success/15 text-success",
  COMPLETED: "bg-success/15 text-success",
  CANCELLED: "bg-danger/10 text-danger",
  EXPIRED: "bg-danger/10 text-danger",
  REFUNDED: "bg-danger/10 text-danger",
  Processing: "bg-warning/15 text-warning",
  "QC review": "bg-danger/10 text-danger",
  "Not eligible": "bg-danger/10 text-danger",
  Shipped: "bg-info/15 text-info",
  "On the way": "bg-info/15 text-info",
  "Out for delivery": "bg-info/15 text-info",
  "Ready for pickup": "bg-primary/10 text-primary",
  Delivered: "bg-success/15 text-success",
  "Picked up": "bg-success/15 text-success",
  Completed: "bg-success/15 text-success",
  Cancelled: "bg-danger/10 text-danger",
};

export default function OrderStatusBadge({ order }: { order: OrderShape }) {
  const label = getOrderStatusLabel(order);
  const style = order.status === "QC review" && order.qcStatus === "rejected" ? colors["QC review"] : colors[order.status] ?? "bg-ink-muted/10 text-ink-muted";
  return <span aria-live="polite" className={`inline-flex items-center rounded-full px-3 py-1.5 text-[10px] font-semibold ${style}`}>{label}</span>;
}
