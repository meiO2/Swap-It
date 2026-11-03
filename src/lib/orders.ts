import { couriers } from "@/data/couriers";
import { savedAddresses } from "@/data/addresses";
import { swapHubs } from "@/data/mock";

export const SHOW_DEMO_CONTROLS = true;

export type DeliveryMethod = "courier" | "pickup";
export type OrderStatus =
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
  items: Array<{ productId: string; productValue: number; quantity: number }>;
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
  if (order.status === "QC review" || order.status === "Not eligible" || order.qcStatus === "pending") return 1;
  if (order.status === "Processing") return 1;
  if (order.status === "Shipped") return 2;
  if (order.status === "On the way") return 3;
  if (order.status === "Out for delivery") return 4;
  if (order.status === "Ready for pickup") return 2;
  if (order.status === "Delivered" || order.status === "Completed") return order.delivery?.method === "pickup" ? 3 : 5;
  if (order.status === "Picked up") return 3;
  return -1;
}

function entryIndexForStatus(order: Pick<OrderShape, "delivery" | "status">, status: OrderStatus) {
  if (order.delivery?.method === "pickup") {
    return status === "Ready for pickup" ? 2 : status === "Picked up" || status === "Completed" ? 3 : 1;
  }
  const indices: Partial<Record<OrderStatus, number>> = {
    Processing: 1, "QC review": 1, "Not eligible": 1, Shipped: 2, "On the way": 3,
    "Out for delivery": 4, Delivered: 5, Completed: 5,
  };
  return indices[status] ?? 1;
}

export function createDemoOrders(): OrderShape[] {
  const courier = couriers[0];
  const address = savedAddresses[0];
  const hub = swapHubs[0];
  const make = (
    id: string,
    createdAt: string,
    status: OrderStatus,
    method: DeliveryMethod,
    options: { qcStatus?: OrderShape["qcStatus"]; progress?: number; decisionDays?: number; estimatedArrival?: string } = {},
  ): OrderShape => {
    const delivery: OrderDelivery = method === "courier"
      ? { method, courier, address, trackingNumber: `SCP${id}ID` }
      : { method, hub, pickupCode: `SWP-PICK-${id}` };
    const pointValue = 210000;
    const shippingFee = method === "courier" ? courier.fee : 0;
    const index = entryIndexForStatus({ delivery, status }, status);
    const timeline = buildTimeline(method, createdAt, index);
    const events: OrderTrackingEvent[] = timeline.filter((item) => item.at).map((item, i) => ({
      id: `${id}-event-${i}`,
      at: item.at!,
      title: item.label,
      location: i < 2 ? hub.name : method === "pickup" ? hub.address : "Tangerang sorting center",
    }));
    const routeEstimate = estimateArrival(createdAt, courier.minDays, courier.maxDays);
    return {
      id, items: [{ productId: "denim-jacket", productValue: pointValue, quantity: 1 }],
      productValue: pointValue, shippingFee, serviceFee: 5000, gpUsed: 20000,
      moneyPaid: pointValue - 20000 + shippingFee + 5000, status, createdAt,
      rewardGranted: status === "Delivered" || status === "Picked up" || status === "Completed",
      delivery, timeline, trackingEvents: events,
      progress: options.progress ?? Math.min(1, Math.max(0, index / (method === "courier" ? 5 : 3))),
      estimatedArrival: options.estimatedArrival ?? routeEstimate.to,
      pickupDeadline: dateOnly(addDays(new Date(createdAt), 7)),
      qcStatus: options.qcStatus ?? (status === "Processing" ? "pending" : "passed"),
      qcDecisionDeadline: options.decisionDays ? addDays(new Date(createdAt), options.decisionDays).toISOString() : undefined,
      rewardEligible: true,
    };
  };
  return [
    make("031430", "2026-10-29T08:24:00.000Z", "On the way", "courier", { progress: 0.62, estimatedArrival: "2026-10-30" }),
    make("031429", "2026-10-30T00:15:00.000Z", "Processing", "courier", { qcStatus: "pending" }),
    make("031428", "2026-10-28T07:10:00.000Z", "Ready for pickup", "pickup"),
    make("031427", "2026-10-25T02:20:00.000Z", "Delivered", "courier", { progress: 1 }),
    make("031426", "2026-10-24T05:30:00.000Z", "Picked up", "pickup", { progress: 1 }),
    make("031425", "2026-10-22T11:00:00.000Z", "Cancelled", "courier"),
    make("031424", "2026-10-29T09:00:00.000Z", "QC review", "pickup", { qcStatus: "rejected", decisionDays: 3 }),
  ];
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
