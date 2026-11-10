import type { OrderStatus } from "@/store/useSwapStore";

type Status = OrderStatus | "Submitted" | "Sorting" | "Passed" | "Not Eligible" | "Unsold" | "Accepted" | "Proposed";

const styles: Record<Status, string> = {
  PENDING_PAYMENT: "bg-warning/15 text-warning",
  PAID: "bg-info/15 text-info",
  AWAITING_SELLER_HANDOVER: "bg-warning/15 text-warning",
  RECEIVED: "bg-warning/15 text-warning",
  QC_IN_PROGRESS: "bg-warning/15 text-warning",
  AWAITING_BUYER_CONFIRMATION: "bg-warning/15 text-warning",
  PROCESSING: "bg-info/15 text-info",
  SHIPPED: "bg-primary-soft/20 text-primary-dark",
  DELIVERED: "bg-success/15 text-success",
  COMPLETED: "bg-success/15 text-success",
  CANCELLED: "bg-danger/15 text-danger",
  EXPIRED: "bg-ink-muted/15 text-ink-muted",
  REFUNDED: "bg-warning/15 text-warning",
  Processing: "bg-info/15 text-info",
  Shipped: "bg-primary-soft/20 text-primary-dark",
  "On the way": "bg-info/15 text-info",
  "Out for delivery": "bg-info/15 text-info",
  "Ready for pickup": "bg-primary/10 text-primary",
  Delivered: "bg-success/15 text-success",
  "Picked up": "bg-success/15 text-success",
  "Not eligible": "bg-danger/15 text-danger",
  Completed: "bg-success/15 text-success",
  Cancelled: "bg-danger/15 text-danger",
  "QC review": "bg-warning/15 text-warning",
  Submitted: "bg-info/15 text-info",
  Sorting: "bg-warning/15 text-warning",
  Passed: "bg-success/15 text-success",
  "Not Eligible": "bg-danger/15 text-danger",
  Unsold: "bg-ink-muted/15 text-ink-muted",
  Accepted: "bg-success/15 text-success",
  Proposed: "bg-info/15 text-info",
};

export default function StatusBadge({ status }: { status: Status }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${styles[status]}`}>{status}</span>;
}
