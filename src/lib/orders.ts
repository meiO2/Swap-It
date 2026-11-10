export type DeliveryMethod = "courier" | "pickup";
export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "RECEIVED"
  | "AWAITING_SELLER_HANDOVER"
  | "QC_IN_PROGRESS"
  | "AWAITING_BUYER_CONFIRMATION"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED"
  | "Processing"
  | "Shipped"
  | "On the way"
  | "Out for delivery"
  | "Ready for pickup"
  | "Delivered"
  | "Picked up"
  | "Completed"
  | "Cancelled"
  | "Not eligible"
  | "QC review";
export type OrderTimelineEntry = { key: string; label: string; at: string | null };
export type OrderTrackingEvent = { id: string; at: string; title: string; location: string };
export type OrderDelivery = {
  method: DeliveryMethod;
  courier?: { id: string; name: string; fee: number; minDays: number; maxDays: number };
  address?: import("@/data/addresses").SavedAddress;
  hub?: { id: string; name: string; address: string; distance: string; openingHours: string; position: [number, number] };
  trackingNumber?: string;
  pickupCode?: string;
};

export type OrderShape = {
  id: string;
  items: Array<{
    productId: string;
    productValue: number;
    quantity: number;
    qcStatus?: string;
    qcDecisionDeadline?: string;
    qcAssessment?: {
      category?: string;
      answers?: Array<{ criterionId: string; optionId: string }>;
      decision?: string;
      notes?: string;
      evidenceUrls?: string[];
    };
  }>;
  subtotal?: number;
  totalAmount?: number;
  deliveryMethod?: DeliveryMethod;
  productValue: number;
  shippingFee: number;
  serviceFee: number;
  gpUsed: number;
  moneyPaid: number;
  status: OrderStatus;
  createdAt: string;
  rewardGranted: boolean;
  delivery?: OrderDelivery;
  timeline?: OrderTimelineEntry[];
  trackingEvents?: OrderTrackingEvent[];
  progress?: number;
  estimatedArrival?: string;
  pickupDeadline?: string;
  qcStatus?: "pending" | "passed" | "rejected";
  qcDecisionDeadline?: string;
  sellerRetrievalDeadline?: string;
  sellerOutcome?: "Pending" | "Retrieved" | "Revamp";
  rewardEligible?: boolean;
};

export type CheckoutOrderInput = {
  items: OrderShape["items"];
  productValue: number;
  shippingFee: number;
  serviceFee: number;
  gpUsed: number;
  delivery: OrderDelivery;
};

export const courierTimelineLabels = [
  "Order confirmed",
  "Quality check & packing at Swap Hub",
  "Package picked up by courier",
  "On the way to your city",
  "Out for delivery",
  "Delivered",
];
export const pickupTimelineLabels = [
  "Order confirmed",
  "Quality check & packing at Swap Hub",
  "Ready for pickup at Swap Hub",
  "Picked up",
];

export function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function dateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateTime(date: string) {
  return new Intl.DateTimeFormat("en-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(date));
}

export function formatOrderDate(date: string) {
  return new Intl.DateTimeFormat("en-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date));
}

export function buildTimeline(method: DeliveryMethod, createdAt: string, lastCompleted = 0): OrderTimelineEntry[] {
  const labels = method === "courier" ? courierTimelineLabels : pickupTimelineLabels;
  const baseTime = Date.parse(createdAt);
  return labels.map((label, index) => ({
    key: index === 1 ? "quality-check" : `step-${index}`,
    label,
    at: index === 0 || index <= lastCompleted
      ? new Date(baseTime + (index === 0 ? 0 : index * 60 * 60 * 1000)).toISOString()
      : null,
  }));
}

export function generateOrderId(existing: string[] = []) {
  let id = "";
  do {
    id = String(Math.floor(100000 + Math.random() * 900000));
  } while (existing.includes(id));
  return id;
}

export function generateTrackingNumber(prefix: string) {
  return `${prefix}${Date.now().toString().slice(-9)}ID`;
}

export function generatePickupCode() {
  return `SWP-PICK-${Math.floor(100000 + Math.random() * 900000)}`;
}

export function estimateArrival(createdAt: string, minDays: number, maxDays: number) {
  const created = new Date(createdAt);
  return { from: dateOnly(addDays(created, minDays)), to: dateOnly(addDays(created, maxDays)) };
}

export function getCurrentTimelineIndex(order: OrderShape) {
  if (
    order.status === "QC review" ||
    order.status === "Not eligible" ||
    order.status === "RECEIVED" ||
    order.status === "QC_IN_PROGRESS" ||
    order.status === "AWAITING_BUYER_CONFIRMATION" ||
    order.qcStatus === "pending"
  ) return 1;
  if (order.status === "PROCESSING" || order.status === "Processing") return 2;
  if (order.status === "SHIPPED" || order.status === "Shipped") return 3;
  if (order.status === "On the way") return 3;
  if (order.status === "Out for delivery") return 4;
  if (order.status === "Ready for pickup") return 2;
  if (
    order.status === "DELIVERED" ||
    order.status === "COMPLETED" ||
    order.status === "Delivered" ||
    order.status === "Completed"
  ) return order.delivery?.method === "pickup" ? 3 : 5;
  if (order.status === "Picked up") return 3;
  return -1;
}

export function createTrackingEvent(order: OrderShape, title: string, at = new Date()) {
  return {
    id: `${order.id}-event-${at.getTime()}`,
    at: at.toISOString(),
    title,
    location: order.delivery?.method === "pickup" ? order.delivery.hub?.address ?? "Swap Hub" : "Tangerang sorting center",
  };
}

export function getOrderStatusLabel(order: OrderShape) {
  if (order.status === "QC review" && order.qcStatus === "rejected") return "Action needed";
  if (order.status === "Shipped") return "Package picked up";
  if (order.status === "Delivered" || order.status === "Picked up") return order.status;
  if (order.status === "Completed") return order.delivery?.method === "pickup" ? "Picked up" : "Delivered";
  return order.status;
}
