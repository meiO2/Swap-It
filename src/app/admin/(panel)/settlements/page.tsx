"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import SellerResolutionQueue from "@/components/admin/SellerResolutionQueue";

type PopulatedUser = string | { _id?: string; name?: string; email?: string };
type PopulatedOrder = string | { _id?: string; status?: string; createdAt?: string };

type DeliveryOrder = {
  _id: string;
  buyerId: PopulatedUser;
  status: "PROCESSING" | "SHIPPED" | "READY_FOR_PICKUP";
  deliveryMethod: "courier" | "pickup";
  pickupHub?: { name?: string; address?: string };
  createdAt: string;
  courierName?: string;
  items: Array<{ name: string }>;
};

type Payable = {
  _id: string;
  sellerId: PopulatedUser;
  orderId: PopulatedOrder;
  sellerSubtotal: number;
  transactionFee: number;
  payableAmount: number;
  totalPaid: number | null;
  overpaymentReturned: number | null;
  outstandingPayable: number | null;
  overpaymentAmount: number | null;
  outstandingOverpayment: number | null;
  financialProvenance: "BASELINE_RECORDED" | "REQUIRES_REVIEW";
  status: "PENDING" | "PARTIALLY_SETTLED" | "OVERPAID" | "SETTLED" | "CANCELLED";
};

type Recovery = {
  _id: string;
  sellerId: PopulatedUser;
  orderId: PopulatedOrder;
  amountDue: number;
  amountRecovered: number;
  settledAmount: number;
  status: "OUTSTANDING" | "RECOVERED";
};

type SettlementEntry = {
  _id: string;
  sellerPayableId: string;
  sellerRecoveryId?: string;
  entryType: "SELLER_PAYMENT" | "OVERPAYMENT_RETURN" | "REFUND_RECOVERY";
  amount: number;
  reason: string;
  occurredAt: string;
  recordedAt: string;
  recordedBy: PopulatedUser;
  reference?: string;
  evidenceUrl?: string;
};

type PageInfo = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type SettlementResponse = {
  payables: Payable[];
  recoveries: Recovery[];
  ledger: SettlementEntry[];
  pagination: {
    payables: PageInfo;
    recoveries: PageInfo;
  };
};

type PayableStatusFilter = "ALL" | Payable["status"];
type RecoveryStatusFilter = "ALL" | Recovery["status"];

const PAYABLE_STATUS_FILTERS = new Set<string>([
  "ALL",
  "PENDING",
  "PARTIALLY_SETTLED",
  "OVERPAID",
  "SETTLED",
  "CANCELLED",
]);
const RECOVERY_STATUS_FILTERS = new Set<string>([
  "ALL",
  "OUTSTANDING",
  "RECOVERED",
]);

function isPayableStatusFilter(value: string): value is PayableStatusFilter {
  return PAYABLE_STATUS_FILTERS.has(value);
}

function isRecoveryStatusFilter(value: string): value is RecoveryStatusFilter {
  return RECOVERY_STATUS_FILTERS.has(value);
}

function nameOf(value: PopulatedUser) {
  return typeof value === "object" && value !== null
    ? value.name ?? value.email ?? "Seller"
    : value;
}

function idOf(value: PopulatedOrder) {
  return typeof value === "object" && value !== null ? value._id ?? "" : value;
}

function rupiah(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

function PaginationControls({
  label,
  pageInfo,
  onPageChange,
}: {
  label: string;
  pageInfo: PageInfo;
  onPageChange: (page: number) => void;
}) {
  const firstItem =
    pageInfo.total === 0 ? 0 : (pageInfo.page - 1) * pageInfo.pageSize + 1;
  const lastItem = Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.total);

  return (
    <nav
      aria-label={`${label} pagination`}
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3"
    >
      <p className="text-xs text-ink-muted">
        Showing {firstItem}–{lastItem} of {pageInfo.total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pageInfo.page <= 1}
          onClick={() => onPageChange(pageInfo.page - 1)}
          className="min-h-9 rounded-full border border-border px-3 text-xs font-semibold text-ink disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-xs text-ink-muted">
          Page {pageInfo.page} of {Math.max(pageInfo.totalPages, 1)}
        </span>
        <button
          type="button"
          disabled={pageInfo.page >= pageInfo.totalPages}
          onClick={() => onPageChange(pageInfo.page + 1)}
          className="min-h-9 rounded-full border border-border px-3 text-xs font-semibold text-ink disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </nav>
  );
}

export default function AdminSettlementsPage() {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [recoveries, setRecoveries] = useState<Recovery[]>([]);
  const [ledger, setLedger] = useState<SettlementEntry[]>([]);
  const [payablesPageInfo, setPayablesPageInfo] = useState<PageInfo>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0,
  });
  const [recoveriesPageInfo, setRecoveriesPageInfo] = useState<PageInfo>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0,
  });
  const [payablesPage, setPayablesPage] = useState(1);
  const [recoveriesPage, setRecoveriesPage] = useState(1);
  const [payablesStatus, setPayablesStatus] =
    useState<PayableStatusFilter>("ALL");
  const [recoveriesStatus, setRecoveriesStatus] =
    useState<RecoveryStatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const idempotencyKeys = useRef(new Map<string, string>());
  const loadRequestId = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        payablesPage: String(payablesPage),
        recoveriesPage: String(recoveriesPage),
        pageSize: "25",
      });
      if (payablesStatus !== "ALL") {
        params.set("payablesStatus", payablesStatus);
      }
      if (recoveriesStatus !== "ALL") {
        params.set("recoveriesStatus", recoveriesStatus);
      }
      if (search.trim()) params.set("search", search.trim());

      const [deliveryData, settlementData] = await Promise.all([
        apiRequest<DeliveryOrder[]>("/api/admin/orders"),
        apiRequest<SettlementResponse>(
          `/api/admin/settlements?${params.toString()}`,
        ),
      ]);
      if (requestId !== loadRequestId.current) return;

      setOrders(deliveryData);
      setPayables(settlementData.payables);
      setRecoveries(settlementData.recoveries);
      setLedger(settlementData.ledger);
      setPayablesPageInfo(settlementData.pagination.payables);
      setRecoveriesPageInfo(settlementData.pagination.recoveries);
      setPayablesPage(settlementData.pagination.payables.page);
      setRecoveriesPage(settlementData.pagination.recoveries.page);
      setHasLoaded(true);
    } catch (cause) {
      if (requestId === loadRequestId.current) {
        setError(cause instanceof Error ? cause.message : "Could not load settlements.");
      }
    } finally {
      if (requestId === loadRequestId.current) {
        setLoading(false);
        setHasLoaded(true);
      }
    }
  }, [
    payablesPage,
    recoveriesPage,
    payablesStatus,
    recoveriesStatus,
    search,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function updateDelivery(order: DeliveryOrder, action: "SHIPPED" | "DELIVERED" | "READY_FOR_PICKUP" | "PICKED_UP") {
    const confirmed = window.confirm(
      action === "SHIPPED"
        ? "Record this QC-cleared order as shipped?"
        : action === "READY_FOR_PICKUP"
          ? `Confirm all items are physically available for pickup at ${order.pickupHub?.name ?? "the selected hub"}?`
          : action === "PICKED_UP"
            ? "Confirm the buyer has collected all items at the selected hub?"
            : "Record this previously shipped order as delivered?",
    );
    if (!confirmed) return;
    setBusy(order._id);
    setError("");
    try {
      await apiRequest("/api/admin/orders", {
        method: "POST",
        body: JSON.stringify({ orderId: order._id, action }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update delivery status.");
    } finally {
      setBusy("");
    }
  }

  function getIdempotencyKey(key: string) {
    let value = idempotencyKeys.current.get(key);
    if (!value) {
      value = window.crypto.randomUUID();
      idempotencyKeys.current.set(key, value);
    }
    return value;
  }

  function paymentDate() {
    const value = window.prompt("Date of the actual transfer (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
    if (value === null) return null;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      setError("Enter a valid transfer date in YYYY-MM-DD format.");
      return null;
    }
    return parsed.toISOString();
  }

  function evidenceUrl() {
    const value = window.prompt("Optional proof image URL (uploaded evidence):") ?? "";
    return value.trim();
  }

  async function recordPayment(payable: Payable) {
    if (payable.totalPaid === null || payable.overpaymentReturned === null || payable.outstandingPayable === null) {
      setError("Payment provenance requires review before recording a transfer.");
      return;
    }
    const rawAmount = window.prompt(
      `Actual amount transferred to ${nameOf(payable.sellerId)} (outstanding payable ${rupiah(payable.outstandingPayable)}):`,
      String(payable.outstandingPayable),
    );
    if (rawAmount === null) return;
    const amount = Number(rawAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setError("Enter a positive whole-rupiah transfer amount.");
      return;
    }
    const reason = window.prompt("Payment note or reason:")?.trim() ?? "";
    if (!reason) {
      setError("A payment note or reason is required.");
      return;
    }
    const occurredAt = paymentDate();
    if (!occurredAt) return;
    const proof = evidenceUrl();
    const projectedOverpayment = Math.max(
      0,
      payable.totalPaid + amount - payable.payableAmount - payable.overpaymentReturned,
    );
    const confirmation = projectedOverpayment > 0
      ? `This transfer creates an overpayment of ${rupiah(projectedOverpayment)}. Record the actual transfer?`
      : `Confirm that ${rupiah(amount)} was actually transferred to ${nameOf(payable.sellerId)}?`;
    if (!window.confirm(confirmation)) return;
    const reference = window.prompt("Optional bank transfer reference:") ?? "";
    const actionKey = `PAYMENT:${payable._id}`;
    setBusy(payable._id);
    setError("");
    try {
      await apiRequest("/api/admin/settlements", {
        method: "POST",
        body: JSON.stringify({
          action: "PAYMENT",
          id: payable._id,
          amount,
          reason,
          occurredAt,
          evidenceUrl: proof || undefined,
          idempotencyKey: getIdempotencyKey(actionKey),
          confirmedPaid: true,
          reference,
        }),
      });
      idempotencyKeys.current.delete(actionKey);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record seller settlement.");
    } finally {
      setBusy("");
    }
  }

  async function recordOverpaymentReturn(payable: Payable) {
    if (payable.outstandingOverpayment === null) {
      setError("Payment provenance requires review before recording a return.");
      return;
    }
    const rawAmount = window.prompt(
      `Amount returned by ${nameOf(payable.sellerId)} (outstanding overpayment ${rupiah(payable.outstandingOverpayment)}):`,
      String(payable.outstandingOverpayment),
    );
    if (rawAmount === null) return;
    const amount = Number(rawAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > payable.outstandingOverpayment) {
      setError("Enter a positive amount no greater than the outstanding overpayment.");
      return;
    }
    const reason = window.prompt("Reason for recording the returned overpayment:")?.trim() ?? "";
    if (!reason) {
      setError("A reason is required to record an overpayment return.");
      return;
    }
    const occurredAt = paymentDate();
    if (!occurredAt) return;
    const proof = evidenceUrl();
    if (!window.confirm(`Confirm that ${rupiah(amount)} has been received back from the seller?`)) return;
    const reference = window.prompt("Optional return transfer reference:") ?? "";
    const actionKey = `OVERPAYMENT_RETURN:${payable._id}`;
    setBusy(payable._id);
    setError("");
    try {
      await apiRequest("/api/admin/settlements", {
        method: "POST",
        body: JSON.stringify({
          action: "OVERPAYMENT_RETURN",
          id: payable._id,
          amount,
          reason,
          occurredAt,
          evidenceUrl: proof || undefined,
          idempotencyKey: getIdempotencyKey(actionKey),
          confirmedReceived: true,
          reference,
        }),
      });
      idempotencyKeys.current.delete(actionKey);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record overpayment return.");
    } finally {
      setBusy("");
    }
  }

  async function recover(recovery: Recovery) {
    const outstanding = recovery.amountDue - recovery.amountRecovered;
    const value = window.prompt(`Amount actually received (outstanding ${rupiah(outstanding)}):`, String(outstanding));
    if (value === null) return;
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > outstanding) {
      setError("Enter a positive whole-rupiah amount no greater than the outstanding recovery.");
      return;
    }
    const reason = window.prompt("Reason for this seller recovery:")?.trim() ?? "";
    if (!reason) {
      setError("A reason is required to record the recovery.");
      return;
    }
    const occurredAt = paymentDate();
    if (!occurredAt) return;
    const proof = evidenceUrl();
    const reference = window.prompt("Optional recovery transfer reference:") ?? "";
    const actionKey = `RECOVER:${recovery._id}`;
    setBusy(recovery._id);
    setError("");
    try {
      await apiRequest("/api/admin/settlements", {
        method: "POST",
        body: JSON.stringify({
          action: "RECOVER",
          id: recovery._id,
          amount,
          reason,
          occurredAt,
          evidenceUrl: proof || undefined,
          idempotencyKey: getIdempotencyKey(actionKey),
          confirmedReceived: true,
          reference,
        }),
      });
      idempotencyKeys.current.delete(actionKey);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record recovery.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Admin / Finance</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Delivery &amp; seller settlements</h1>
        <p className="mt-2 text-sm text-ink-muted">Record delivery transitions, manual payouts, and recoveries only after funds move.</p>
      </header>
      {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      <SellerResolutionQueue />
      {loading && !hasLoaded ? <p role="status" className="rounded-2xl bg-white p-5 text-sm text-ink-muted">Loading finance records…</p> : (
        <>
          {loading && <p role="status" className="text-sm text-ink-muted">Updating finance records…</p>}
          <section className="rounded-2xl bg-white p-4 shadow-card">
            <label htmlFor="settlement-search" className="block text-xs font-semibold text-ink">
              Search seller name/email or order/refund ID
            </label>
            <input
              id="settlement-search"
              type="search"
              maxLength={100}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPayablesPage(1);
                setRecoveriesPage(1);
              }}
              placeholder="Search settlements"
              className="mt-2 min-h-10 w-full rounded-xl border border-border px-3 text-sm"
            />
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold text-ink">Shipment, delivery &amp; pickup</h2>
            {orders.map((order) => (
              <article key={order._id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-card">
                <div>
                  <p className="font-semibold text-ink">Order {order._id}</p>
                  <p className="mt-1 text-xs text-ink-muted">{nameOf(order.buyerId)} · {order.items.map((item) => item.name).join(", ")}</p>
                  {order.deliveryMethod === "pickup" && <p className="mt-1 text-xs text-ink-muted">Pickup: {order.pickupHub?.name ?? "Hub unavailable"} · {order.pickupHub?.address}</p>}
                </div>
                <button
                  type="button"
                  disabled={busy === order._id}
                  onClick={() => void updateDelivery(order, order.deliveryMethod === "pickup" ? (order.status === "PROCESSING" ? "READY_FOR_PICKUP" : "PICKED_UP") : (order.status === "PROCESSING" ? "SHIPPED" : "DELIVERED"))}
                  className="min-h-10 rounded-full bg-primary px-4 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {busy === order._id ? "Saving…" : order.deliveryMethod === "pickup" ? (order.status === "PROCESSING" ? "Mark ready for pickup" : "Record pickup") : (order.status === "PROCESSING" ? "Record SHIPPED" : "Record DELIVERED")}
                </button>
              </article>
            ))}
            {orders.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-ink-muted">No orders awaiting delivery or pickup.</p>}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-ink">Seller payables</h2>
              <label className="flex items-center gap-2 text-xs font-semibold text-ink">
                Status
                <select
                  value={payablesStatus}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (isPayableStatusFilter(value)) {
                      setPayablesStatus(value);
                      setPayablesPage(1);
                    }
                  }}
                  className="min-h-9 rounded-lg border border-border bg-white px-2"
                >
                  <option value="ALL">All</option>
                  <option value="PENDING">Pending</option>
                  <option value="PARTIALLY_SETTLED">Partially settled</option>
                  <option value="OVERPAID">Overpaid</option>
                  <option value="SETTLED">Settled</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </label>
            </div>
            {payables.map((payable) => (
              <article key={payable._id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-card">
                <div>
                  <p className="font-semibold text-ink">{nameOf(payable.sellerId)} · Order {idOf(payable.orderId)}</p>
                  <p className="mt-1 text-xs text-ink-muted">Gross {rupiah(payable.sellerSubtotal)} · Fee {rupiah(payable.transactionFee)} · Net {rupiah(payable.payableAmount)}</p>
                  <p className="mt-1 text-xs text-ink-muted">Transferred {payable.totalPaid === null ? "unknown" : rupiah(payable.totalPaid)} · Outstanding payable {payable.outstandingPayable === null ? "requires review" : rupiah(payable.outstandingPayable)}</p>
                  {payable.overpaymentAmount !== null && payable.overpaymentAmount > 0 && payable.overpaymentReturned !== null && payable.outstandingOverpayment !== null && <p className="mt-1 text-xs text-danger">Overpayment {rupiah(payable.overpaymentAmount)} · Returned {rupiah(payable.overpaymentReturned)} · Outstanding overpayment {rupiah(payable.outstandingOverpayment)}</p>}
                  {payable.financialProvenance === "REQUIRES_REVIEW" && <p className="mt-1 text-xs text-danger">Payment provenance requires review.</p>}
                  <p className="mt-1 text-xs text-primary">{payable.status}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["PENDING", "PARTIALLY_SETTLED"].includes(payable.status) && (
                    <button type="button" disabled={busy === payable._id || payable.financialProvenance === "REQUIRES_REVIEW"} onClick={() => void recordPayment(payable)} className="min-h-10 rounded-full bg-primary px-4 text-xs font-semibold text-white disabled:opacity-60">
                      {busy === payable._id ? "Saving…" : "Record actual transfer"}
                    </button>
                  )}
                  {payable.status === "OVERPAID" && (
                    <button type="button" disabled={busy === payable._id || payable.financialProvenance === "REQUIRES_REVIEW"} onClick={() => void recordOverpaymentReturn(payable)} className="min-h-10 rounded-full border border-danger/40 px-4 text-xs font-semibold text-danger disabled:opacity-60">
                      {busy === payable._id ? "Saving…" : "Record seller return"}
                    </button>
                  )}
                </div>
                {ledger.some((entry) => entry.sellerPayableId === payable._id) && (
                  <div className="w-full border-t border-border pt-3">
                    <p className="text-xs font-semibold text-ink">Settlement ledger</p>
                    <ul className="mt-2 space-y-2">
                      {ledger.filter((entry) => entry.sellerPayableId === payable._id).map((entry) => (
                        <li key={entry._id} className="text-xs text-ink-muted">
                          {new Date(entry.occurredAt).toLocaleDateString("id-ID")} · {entry.entryType.replaceAll("_", " ")} · {rupiah(entry.amount)} · {entry.reason} · recorded by {nameOf(entry.recordedBy)}
                          {` · logged ${new Date(entry.recordedAt).toLocaleString("id-ID")}`}
                          {entry.evidenceUrl && <> · <a className="text-primary underline" href={entry.evidenceUrl} target="_blank" rel="noreferrer">proof</a></>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
            {payables.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-ink-muted">No seller payables match these filters.</p>}
            <PaginationControls
              label="Seller payables"
              pageInfo={payablesPageInfo}
              onPageChange={setPayablesPage}
            />
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-ink">Seller recoveries</h2>
              <label className="flex items-center gap-2 text-xs font-semibold text-ink">
                Status
                <select
                  value={recoveriesStatus}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (isRecoveryStatusFilter(value)) {
                      setRecoveriesStatus(value);
                      setRecoveriesPage(1);
                    }
                  }}
                  className="min-h-9 rounded-lg border border-border bg-white px-2"
                >
                  <option value="ALL">All</option>
                  <option value="OUTSTANDING">Outstanding</option>
                  <option value="RECOVERED">Recovered</option>
                </select>
              </label>
            </div>
            {recoveries.map((recovery) => (
              <article key={recovery._id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-card">
                <div>
                  <p className="font-semibold text-ink">{nameOf(recovery.sellerId)} · Order {idOf(recovery.orderId)}</p>
                  <p className="mt-1 text-xs text-ink-muted">Amount retained at refund (net of overpayment returns) {rupiah(recovery.settledAmount)} · Due {rupiah(recovery.amountDue)} · Recovered {rupiah(recovery.amountRecovered)}</p>
                  <p className="mt-1 text-xs text-primary">{recovery.status}</p>
                </div>
                {recovery.status === "OUTSTANDING" && (
                  <button type="button" disabled={busy === recovery._id} onClick={() => void recover(recovery)} className="min-h-10 rounded-full border border-primary/40 px-4 text-xs font-semibold text-primary disabled:opacity-60">
                    {busy === recovery._id ? "Saving…" : "Record recovery"}
                  </button>
                )}
                {ledger.some((entry) => entry.sellerRecoveryId === recovery._id) && (
                  <div className="w-full border-t border-border pt-3">
                    <p className="text-xs font-semibold text-ink">Recovery ledger</p>
                    <ul className="mt-2 space-y-2">
                      {ledger.filter((entry) => entry.sellerRecoveryId === recovery._id).map((entry) => (
                        <li key={entry._id} className="text-xs text-ink-muted">
                          {new Date(entry.occurredAt).toLocaleDateString("id-ID")} · {rupiah(entry.amount)} · {entry.reason} · recorded by {nameOf(entry.recordedBy)} · logged {new Date(entry.recordedAt).toLocaleString("id-ID")}
                          {entry.evidenceUrl && <> · <a className="text-primary underline" href={entry.evidenceUrl} target="_blank" rel="noreferrer">proof</a></>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
            {recoveries.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-ink-muted">No seller recoveries match these filters.</p>}
            <PaginationControls
              label="Seller recoveries"
              pageInfo={recoveriesPageInfo}
              onPageChange={setRecoveriesPage}
            />
          </section>
        </>
      )}
    </div>
  );
}
