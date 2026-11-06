"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { calculatePurchaseReward, createPointBatch, getAvailablePointBalance, spendPointsFEFOAt, type PointBatch } from "@/lib/gp";
import { getExpiryDate } from "@/lib/hub";
import {
  buildTimeline,
  createTrackingEvent,
  estimateArrival,
  generateOrderId,
  type CheckoutOrderInput,
  type OrderShape,
} from "@/lib/orders";

export type CartItem = { productId: string; quantity: number };
export type OrderStatus = OrderShape["status"];
export type SwapOrder = OrderShape;
export type WalletTransaction = {
  id: string;
  kind: "earned" | "spent" | "refund";
  amount: number;
  label: string;
  createdAt: string;
};
export type SwapNotification = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  href: string;
  kind: "donation" | "order";
};
export type DonationReceipt = {
  id: string;
  itemCount: number;
  amount: number;
  createdAt: string;
};
export type ChatMessage = { id: number; text: string; own: boolean; time: string };
export type Listing = {
  id: string;
  title: string;
  category: string;
  size: string;
  condition: string;
  price: number;
  status: "Submitted" | "Sorting" | "Passed" | "Not Eligible" | "Unsold";
  createdAt: string;
  fulfillment: "Swap Hub drop-off" | "Pickup";
  pickupDate?: string;
  pickupChanges: number;
};

type SwapStore = {
  pointBatches: PointBatch[];
  transactions: WalletTransaction[];
  notifications: SwapNotification[];
  donationReceipts: DonationReceipt[];
  cart: CartItem[];
  orders: SwapOrder[];
  listings: Listing[];
  messagesByChat: Record<string, ChatMessage[]>;
  swapStatuses: Record<string, "Proposed" | "Accepted" | "Completed">;
  addToCart: (productId: string) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  checkout: (input: CheckoutOrderInput) => string;
  completeOrder: (id: string) => void;
  approveOrderQc: (id: string) => void;
  rejectOrderQc: (id: string) => void;
  advanceOrder: (id: string) => void;
  resetOrderDemo: (id: string) => void;
  cancelOrder: (id: string) => void;
  keepQcOrder: (id: string) => void;
  markSellerRetrieved: (id: string) => void;
  processSellerNonRetrieval: (id: string) => void;
  addPoints: (amount: number, label: string) => void;
  addDonationReward: (id: string, itemCount: number, amount: number, earnedAt: Date) => void;
  rejectQcOrder: (id: string) => void;
  addListing: (listing: Omit<Listing, "id" | "createdAt" | "status" | "pickupChanges">) => void;
  updateListingStatus: (id: string, status: Listing["status"]) => void;
  changePickupDate: (id: string, pickupDate: string) => void;
  sendChatMessage: (chatId: string, text: string) => void;
  updateSwapStatus: (chatId: string, status: "Proposed" | "Accepted" | "Completed") => void;
};

const initialPointBatches: PointBatch[] = [];

export const useSwapStore = create<SwapStore>()(
  persist(
    (set, get) => ({
      pointBatches: initialPointBatches,
      transactions: [],
      notifications: [],
      donationReceipts: [],
      cart: [],
      orders: [],
      listings: [],
      messagesByChat: {},
      swapStatuses: {},
      addToCart: (productId) => set((state) => {
        const existing = state.cart.find((item) => item.productId === productId);
        return { cart: existing
          ? state.cart.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item)
          : [...state.cart, { productId, quantity: 1 }] };
      }),
      removeFromCart: (productId) => set((state) => ({ cart: state.cart.filter((item) => item.productId !== productId) })),
      clearCart: () => set({ cart: [] }),
      checkout: (input) => {
        const current = get();
        const now = new Date();
        const totalPoints = getAvailablePointBalance(current.pointBatches, now);
        if (input.gpUsed < 0 || input.gpUsed > input.productValue || input.gpUsed > totalPoints) {
          throw new RangeError("Green Points must be within the product value and available wallet balance.");
        }
        const orderId = generateOrderId(current.orders.map((order) => order.id));
        const createdAt = now.toISOString();
        const courier = input.delivery.courier;
        const routeEstimate = courier ? estimateArrival(createdAt, courier.minDays, courier.maxDays) : null;
        const order: SwapOrder = {
          id: orderId,
          ...input,
          moneyPaid: input.productValue - input.gpUsed + input.shippingFee + input.serviceFee,
          status: "Processing",
          createdAt,
          rewardGranted: false,
          timeline: buildTimeline(input.delivery.method, createdAt),
          trackingEvents: [{
            id: `${orderId}-confirmed`,
            at: createdAt,
            title: "Order confirmed",
            location: input.delivery.method === "pickup" ? input.delivery.hub?.name ?? "Swap Hub" : input.delivery.address?.city ?? "Tangerang",
          }],
          progress: 0,
          estimatedArrival: routeEstimate?.to,
          pickupDeadline: input.delivery.method === "pickup" ? new Date(new Date(createdAt).setDate(new Date(createdAt).getDate() + 7)).toISOString() : undefined,
          qcStatus: "pending",
          rewardEligible: true,
        };
        const remainingBatches = spendPointsFEFOAt(current.pointBatches, input.gpUsed, now);
        set({
          pointBatches: remainingBatches,
          transactions: input.gpUsed > 0
            ? [{ id: `tx-${Date.now()}`, kind: "spent", amount: input.gpUsed, label: `Marketplace purchase (${input.items.length} item${input.items.length === 1 ? "" : "s"})`, createdAt: order.createdAt }, ...current.transactions]
            : current.transactions,
          orders: [order, ...current.orders],
          cart: current.cart.filter((item) => !input.items.some((purchased) => purchased.productId === item.productId)),
        });
        return order.id;
      },
      completeOrder: (id) => set((state) => {
        const target = state.orders.find((order) => order.id === id);
        if (!target || target.status === "Cancelled" || target.rewardGranted) return {};
        const reward = calculatePurchaseReward(target.productValue);
        const earnsReward = target.rewardEligible !== false;
        const earnedAt = new Date();
        const batch = createPointBatch(`reward-${id}`, reward, earnedAt);
        const status = target.delivery?.method === "pickup" ? "Picked up" : "Delivered";
        return {
          orders: state.orders.map((order) => order.id === id ? { ...order, status, rewardGranted: true, progress: 1 } : order),
          pointBatches: reward > 0 && earnsReward ? [...state.pointBatches, batch] : state.pointBatches,
          transactions: reward > 0 && earnsReward
            ? [{ id: `tx-${id}`, kind: "earned", amount: reward, label: "2% completed order reward", createdAt: earnedAt.toISOString() }, ...state.transactions]
            : state.transactions,
          notifications: reward > 0 && earnsReward ? [{
            id: `notification-order-${id}`,
            title: "Order completed",
            detail: `${reward.toLocaleString("id-ID")} GP from your completed order has been added to your wallet.`,
            createdAt: earnedAt.toISOString(),
            href: `/orders/${id}`,
            kind: "order",
          }, ...state.notifications] : state.notifications,
        };
      }),
      approveOrderQc: (id) => set((state) => ({
        orders: state.orders.map((order) => {
          if (order.id !== id || order.status !== "Processing" || order.qcStatus !== "pending") return order;
          const at = new Date().toISOString();
          const status = order.delivery?.method === "pickup" ? "Ready for pickup" : "Shipped";
          const timeline = (order.timeline ?? buildTimeline(order.delivery?.method ?? "courier", order.createdAt)).map((entry) =>
            entry.key === "quality-check" ? { ...entry, at } : entry,
          );
          const statusIndex = status === "Ready for pickup" ? 2 : 2;
          const stage = timeline[statusIndex];
          return {
            ...order,
            qcStatus: "passed",
            status,
            progress: Math.max(order.progress ?? 0, order.delivery?.method === "pickup" ? 2 / 3 : 2 / 5),
            timeline: timeline.map((entry, index) => index === statusIndex ? { ...entry, at } : entry),
            trackingEvents: [...(order.trackingEvents ?? []), createTrackingEvent(order, stage?.label ?? "Quality check passed", new Date())],
          };
        }),
      })),
      rejectOrderQc: (id) => set((state) => ({
        orders: state.orders.map((order) => {
          if (order.id !== id || order.status !== "Processing" || order.qcStatus !== "pending") return order;
          const at = new Date();
          const timeline = (order.timeline ?? buildTimeline(order.delivery?.method ?? "courier", order.createdAt)).map((entry) =>
            entry.key === "quality-check" ? { ...entry, label: "Quality check: item not eligible", at: at.toISOString() } : entry,
          );
          return {
            ...order,
            status: "QC review",
            qcStatus: "rejected",
            qcDecisionDeadline: new Date(at.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            timeline,
            trackingEvents: [...(order.trackingEvents ?? []), createTrackingEvent(order, "Quality check: item not eligible", at)],
          };
        }),
      })),
      advanceOrder: (id) => {
        const order = get().orders.find((item) => item.id === id);
        if (!order) throw new RangeError("Order not found.");
        if (order.status === "Processing" && order.qcStatus === "pending") throw new RangeError("The quality check must be approved before delivery can advance.");
        if (order.status === "QC review") throw new RangeError("Resolve the quality check decision before delivery can advance.");
        if (order.status === "Cancelled" || order.status === "Not eligible" || order.status === "Delivered" || order.status === "Picked up") {
          throw new RangeError("This order has no further delivery steps.");
        }
        if (order.status === "Shipped") {
          set((state) => ({
            orders: state.orders.map((item) => {
              if (item.id !== id) return item;
              const at = new Date();
              const timeline = (item.timeline ?? buildTimeline("courier", item.createdAt)).map((entry, index) => index === 3 ? { ...entry, at: at.toISOString() } : entry);
              return { ...item, status: "On the way", progress: 0.62, timeline, trackingEvents: [...(item.trackingEvents ?? []), createTrackingEvent(item, "Package arrived at Tangerang sorting center", at)] };
            }),
          }));
          return;
        }
        if (order.status === "On the way") {
          set((state) => ({
            orders: state.orders.map((item) => {
              if (item.id !== id) return item;
              const at = new Date();
              return { ...item, status: "Out for delivery", progress: 0.88, timeline: (item.timeline ?? []).map((entry, index) => index === 4 ? { ...entry, at: at.toISOString() } : entry), trackingEvents: [...(item.trackingEvents ?? []), createTrackingEvent(item, "Out for delivery", at)] };
            }),
          }));
          return;
        }
        const finalStatus = order.delivery?.method === "pickup" ? "Picked up" : "Delivered";
        const at = new Date();
        const finalIndex = order.delivery?.method === "pickup" ? 3 : 5;
        set((state) => ({
          orders: state.orders.map((item) => item.id === id ? {
            ...item,
            status: finalStatus,
            progress: 1,
            timeline: (item.timeline ?? []).map((entry, index) => index === finalIndex ? { ...entry, at: at.toISOString() } : entry),
            trackingEvents: [...(item.trackingEvents ?? []), createTrackingEvent(item, finalStatus, at)],
          } : item),
        }));
        get().completeOrder(id);
      },
      resetOrderDemo: (id) => set((state) => ({
        orders: state.orders.map((order) => order.id === id ? {
          ...order,
          status: "Processing",
          qcStatus: "pending",
          rewardGranted: false,
          rewardEligible: true,
          progress: 0,
          qcDecisionDeadline: undefined,
          timeline: buildTimeline(order.delivery?.method ?? "courier", order.createdAt),
          trackingEvents: [{
            id: `${id}-confirmed`,
            at: order.createdAt,
            title: "Order confirmed",
            location: order.delivery?.method === "pickup" ? order.delivery.hub?.name ?? "Swap Hub" : order.delivery?.address?.city ?? "Tangerang",
          }],
        } : order),
      })),
      cancelOrder: (id) => set((state) => ({
        orders: state.orders.map((order) => order.id === id && order.status !== "Completed" ? { ...order, status: "Cancelled" } : order),
      })),
      keepQcOrder: (id) => set((state) => ({
        orders: state.orders.map((order) => {
          if (order.id !== id || order.status !== "QC review") return order;
          const at = new Date();
          const timeline = order.timeline ?? buildTimeline(order.delivery?.method ?? "courier", order.createdAt);
          const stage = timeline[2];
          return {
            ...order,
            status: order.delivery?.method === "pickup" ? "Ready for pickup" : "Shipped",
            qcStatus: "passed",
            rewardGranted: false,
            rewardEligible: false,
            progress: Math.max(order.progress ?? 0, order.delivery?.method === "pickup" ? 2 / 3 : 2 / 5),
            timeline: timeline.map((entry, index) => index === 2 ? { ...entry, at: at.toISOString() } : entry),
            trackingEvents: [...(order.trackingEvents ?? []), createTrackingEvent(order, stage?.label ?? "Quality check passed", at)],
          };
        }),
      })),
      markSellerRetrieved: (id) => {
        const order = get().orders.find((item) => item.id === id);
        if (!order?.sellerRetrievalDeadline || Date.parse(order.sellerRetrievalDeadline) <= Date.now() || order.sellerOutcome) {
          throw new RangeError("The item is no longer within its seller retrieval window.");
        }
        set((state) => ({
          orders: state.orders.map((item) => item.id === id ? { ...item, sellerOutcome: "Retrieved" } : item),
        }));
      },
      processSellerNonRetrieval: (id) => {
        const order = get().orders.find((item) => item.id === id);
        if (!order?.sellerRetrievalDeadline || Date.parse(order.sellerRetrievalDeadline) > Date.now() || order.sellerOutcome) {
          throw new RangeError("The seller retrieval window has not expired or has already been resolved.");
        }
        const earnedAt = new Date();
        const payout = Math.floor(order.productValue * 0.4);
        const batch = createPointBatch(`seller-retrieval-${id}`, payout, earnedAt);
        set((state) => ({
          orders: state.orders.map((item) => item.id === id ? { ...item, sellerOutcome: "Revamp" } : item),
          pointBatches: payout > 0 ? [...state.pointBatches, batch] : state.pointBatches,
          transactions: payout > 0 ? [{ id: `tx-seller-${id}`, kind: "earned", amount: payout, label: "Seller non-retrieval payout (40%)", createdAt: earnedAt.toISOString() }, ...state.transactions] : state.transactions,
        }));
      },
      addPoints: (amount, label) => {
        if (!Number.isFinite(amount) || amount <= 0) throw new RangeError("Points added must be greater than zero.");
        const earnedAt = new Date();
        const batch = createPointBatch(`batch-${Date.now()}`, amount, earnedAt);
        set((state) => ({
          pointBatches: [...state.pointBatches, batch],
          transactions: [{ id: `tx-${Date.now()}`, kind: "earned", amount, label, createdAt: earnedAt.toISOString() }, ...state.transactions],
        }));
      },
      addDonationReward: (id, itemCount, amount, earnedAt) => {
        if (!id || !Number.isInteger(itemCount) || itemCount < 1 || itemCount > 30 || !Number.isFinite(amount) || amount <= 0) {
          throw new RangeError("A valid donation receipt and quantity are required.");
        }
        const batchId = `donation-${id}`;
        const earnedAtIso = earnedAt.toISOString();
        const expiresAt = getExpiryDate(earnedAt).toISOString();
        set((state) => {
          if (state.donationReceipts.some((receipt) => receipt.id === id)) return {};
          return {
            donationReceipts: [...state.donationReceipts, { id, itemCount, amount, createdAt: earnedAtIso }],
            pointBatches: [...state.pointBatches, { id: batchId, remaining: amount, earnedAt: earnedAtIso, expiresAt }],
            transactions: [{ id: `tx-${batchId}`, kind: "earned", amount, label: "Donation at Swap Hub BSD", createdAt: earnedAtIso }, ...state.transactions],
            notifications: [{
              id: `notification-${batchId}`,
              title: "Donation points added",
              detail: `${amount.toLocaleString("id-ID")} GP from your Swap Hub donation are now in your wallet.`,
              createdAt: earnedAtIso,
              href: "/wallet",
              kind: "donation",
            }, ...state.notifications],
          };
        });
      },
      rejectQcOrder: (id) => set((state) => {
        const order = state.orders.find((item) => item.id === id);
        if (!order || order.status === "Cancelled" || order.status === "Completed") return {};
        const earnedAt = new Date();
        const refund = order.productValue;
        const batch = createPointBatch(`qc-refund-${id}`, refund, earnedAt);
        return {
          orders: state.orders.map((item) => item.id === id ? { ...item, status: "Cancelled" } : item),
          pointBatches: [...state.pointBatches, batch],
          transactions: [{ id: `tx-qc-${id}`, kind: "refund", amount: refund, label: "QC rejection — product value refund", createdAt: earnedAt.toISOString() }, ...state.transactions],
        };
      }),
      addListing: (listing) => {
        if (listing.fulfillment === "Pickup" && (!listing.pickupDate || Date.parse(`${listing.pickupDate}T23:59:59`) < Date.now())) {
          throw new RangeError("Choose a future pickup date.");
        }
        set((state) => ({
          listings: [{ ...listing, id: `listing-${Date.now()}`, status: "Submitted", createdAt: new Date().toISOString(), pickupChanges: 0 }, ...state.listings],
        }));
      },
      updateListingStatus: (id, status) => set((state) => ({
        listings: state.listings.map((listing) => listing.id === id ? { ...listing, status } : listing),
      })),
      changePickupDate: (id, pickupDate) => {
        const listing = get().listings.find((item) => item.id === id);
        const scheduledStart = listing?.pickupDate ? new Date(`${listing.pickupDate}T00:00:00`).getTime() : Number.NaN;
        if (!listing || listing.fulfillment !== "Pickup" || listing.pickupChanges > 0 || !Number.isFinite(scheduledStart) || scheduledStart - Date.now() < 24 * 60 * 60 * 1000) {
          throw new RangeError("A pickup schedule can only be changed once, no later than one day before pickup.");
        }
        const pickupDayEnd = pickupDate ? new Date(`${pickupDate}T23:59:59`).getTime() : Number.NaN;
        if (!Number.isFinite(pickupDayEnd) || pickupDayEnd < Date.now()) throw new RangeError("Choose a future pickup date.");
        set((state) => ({
          listings: state.listings.map((item) => item.id === id ? { ...item, pickupDate, pickupChanges: 1 } : item),
        }));
      },
      sendChatMessage: (chatId, text) => {
        const message = text.trim();
        if (!message) return;
        const existing = get().messagesByChat[chatId] ?? [];
        set((state) => ({
          messagesByChat: {
            ...state.messagesByChat,
            [chatId]: [...existing, { id: Date.now(), text: message, own: true, time: "Now" }],
          },
        }));
      },
      updateSwapStatus: (chatId, status) => set((state) => ({
        swapStatuses: { ...state.swapStatuses, [chatId]: status },
      })),
    }),
    {
      name: "swapit-prototype",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<SwapStore>;
        const savedOrders = Array.isArray(persisted.orders) ? persisted.orders : currentState.orders;
        const orders = savedOrders;
        const savedTransactions = Array.isArray(persisted.transactions) ? persisted.transactions : currentState.transactions;
        return {
          ...currentState,
          ...persisted,
          orders,
          pointBatches: [
            ...(Array.isArray(persisted.pointBatches) ? persisted.pointBatches : currentState.pointBatches),
          ],
          transactions: savedTransactions,
        };
      },
    },
  ),
);
