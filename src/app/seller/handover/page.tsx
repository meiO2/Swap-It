
    "use client";

    import { useCallback, useEffect, useState } from "react";
    import {
    CalendarDays,
    Clock3,
    MapPin,
    Package,
    RefreshCw,
    Truck,
    } from "lucide-react";

    import { apiRequest } from "@/lib/api";
    import { swapHubs } from "@/data/mock";

    type HandoverMethod = "HUB_DROP_OFF" | "PICKUP";

    type HandoverStatus =
    | "AWAITING_PAYMENT"
    | "AWAITING_SELLER_SCHEDULE"
    | "SCHEDULED"
    | "IN_TRANSIT"
    | "RECEIVED"
    | "CANCELLED";

    type RescheduleRecord = {
    previousScheduledAt: string;
    newScheduledAt: string;
    changedAt: string;
    changedBy: string;
    };

    type Handover = {
    method: HandoverMethod;
    status: HandoverStatus;
    hubId?: string;
    hubName?: string;
    hubAddress?: string;
    scheduledAt?: string;
    rescheduleCount?: number;
    rescheduleHistory?: RescheduleRecord[];
    pickupAddress?: {
        name: string;
        phone: string;
        address: string;
        city: string;
        postalCode: string;
    };
    };

    type HandoverEntry = {
    orderId: string;
    orderStatus: string;
    createdAt: string;
    item: {
        productId: string;
        name: string;
        price: number;
        image: string | null;
        handover: Handover;
    };
    };

    const H24 = 24 * 60 * 60 * 1000;

    function getLocalDateString() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
    }

    function getLocalDateTimeString(value?: string) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    function getLocalDateOnly(value?: string) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
    }

    function formatDate(value?: string) {
    if (!value) return "Not scheduled";

    return new Date(value).toLocaleDateString("en-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
    }

    function formatDateTime(value?: string) {
    if (!value) return "Not scheduled";

    return new Date(value).toLocaleString("en-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
    }

    function formatRupiah(value: number) {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(value);
    }

    function HandoverCard({
    entry,
    onScheduled,
    }: {
    entry: HandoverEntry;
    onScheduled: () => void;
    }) {
    const handover = entry.item.handover;
    const isHubDropOff = handover.method === "HUB_DROP_OFF";
    const isScheduled = handover.status === "SCHEDULED";

    const [selectedHub, setSelectedHub] = useState(
        handover.hubId ?? "",
    );

    const [preferredDate, setPreferredDate] = useState(
        getLocalDateOnly(handover.scheduledAt),
    );

    const [pickupDateTime, setPickupDateTime] = useState(
        getLocalDateTimeString(handover.scheduledAt),
    );

    const [isRescheduling, setIsRescheduling] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const rescheduleCount = handover.rescheduleCount ?? 0;
    const rescheduleHistory = handover.rescheduleHistory ?? [];

    const selectedHubDetails = swapHubs.find(
        (hub) => hub.id === selectedHub,
    );

    const originalScheduledAt = handover.scheduledAt
        ? new Date(handover.scheduledAt)
        : null;

    const hasValidOriginalSchedule =
        originalScheduledAt !== null &&
        !Number.isNaN(originalScheduledAt.getTime());

    const hoursUntilSchedule = hasValidOriginalSchedule
        ? originalScheduledAt.getTime() - Date.now()
        : 0;

    const canReschedule =
        isScheduled &&
        rescheduleCount < 1 &&
        hasValidOriginalSchedule &&
        hoursUntilSchedule >= H24;

    const rescheduleUnavailableReason = !isScheduled
        ? ""
        : rescheduleCount >= 1
        ? "You have already used your one-time reschedule."
        : !hasValidOriginalSchedule
            ? "The original schedule is unavailable."
            : hoursUntilSchedule < H24
            ? "Rescheduling is only available at least 24 hours before your scheduled handover."
            : "";

    function resetScheduleInputs() {
        setPreferredDate(getLocalDateOnly(handover.scheduledAt));
        setPickupDateTime(
        getLocalDateTimeString(handover.scheduledAt),
        );
        setError("");
    }

    function getScheduledDate() {
        if (isHubDropOff) {
        if (!preferredDate) return null;

        // Hub drop-off is date-based. Noon is used as its timestamp.
        const [year, month, day] = preferredDate
            .split("-")
            .map(Number);

        return new Date(year, month - 1, day, 12, 0, 0);
        }

        if (!pickupDateTime) return null;

        return new Date(pickupDateTime);
    }

    async function handleSchedule() {
        setError("");

        if (isHubDropOff && !selectedHub) {
        setError("Please select a Swap Hub.");
        return;
        }

        if (isHubDropOff && !preferredDate) {
        setError("Please select your preferred drop-off date.");
        return;
        }

        if (!isHubDropOff && !pickupDateTime) {
        setError("Please select your preferred pickup date and time.");
        return;
        }

        const scheduledDate = getScheduledDate();

        if (
        !scheduledDate ||
        Number.isNaN(scheduledDate.getTime()) ||
        scheduledDate.getTime() <= Date.now()
        ) {
        setError("Please choose a future date and time.");
        return;
        }

        setSaving(true);

        try {
        await apiRequest(`/api/orders/${entry.orderId}/handover`, {
            method: "PATCH",
            body: JSON.stringify({
            productId: entry.item.productId,
            scheduledAt: scheduledDate.toISOString(),
            ...(isHubDropOff ? { hubId: selectedHub } : {}),
            }),
        });

        onScheduled();
        } catch (err) {
        setError(
            err instanceof Error
            ? err.message
            : "Unable to save your handover schedule.",
        );
        } finally {
        setSaving(false);
        }
    }

    async function handleReschedule() {
        setError("");

        if (!canReschedule) {
        setError(
            rescheduleUnavailableReason ||
            "This handover cannot be rescheduled.",
        );
        return;
        }

        if (isHubDropOff && !preferredDate) {
        setError("Please select your new drop-off date.");
        return;
        }

        if (!isHubDropOff && !pickupDateTime) {
        setError("Please select your new pickup date and time.");
        return;
        }

        const newScheduledDate = getScheduledDate();

        if (
        !newScheduledDate ||
        Number.isNaN(newScheduledDate.getTime()) ||
        newScheduledDate.getTime() <= Date.now()
        ) {
        setError("Please choose a future date and time.");
        return;
        }

        if (
        newScheduledDate.getTime() ===
        originalScheduledAt?.getTime()
        ) {
        setError("Please choose a different date or time.");
        return;
        }

        setSaving(true);

        try {
        await apiRequest(
            `/api/orders/${entry.orderId}/handover/reschedule`,
            {
            method: "PATCH",
            body: JSON.stringify({
                productId: entry.item.productId,
                scheduledAt: newScheduledDate.toISOString(),
            }),
            },
        );

        setIsRescheduling(false);
        onScheduled();
        } catch (err) {
        setError(
            err instanceof Error
            ? err.message
            : "Unable to reschedule your handover.",
        );
        } finally {
        setSaving(false);
        }
    }

    return (
        <article className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="flex flex-col gap-4 p-4 sm:flex-row">
            <div className="h-28 w-full shrink-0 overflow-hidden rounded-xl bg-mint-50 sm:w-28">
            {entry.item.image ? (
                <img
                src={entry.item.image}
                alt={entry.item.name}
                className="h-full w-full object-cover"
                />
            ) : (
                <div className="flex h-full items-center justify-center text-primary">
                <Package size={32} />
                </div>
            )}
            </div>

            <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-mint-50 px-3 py-1 text-xs font-medium text-primary">
                Order #{entry.orderId.slice(-6).toUpperCase()}
                </span>

                <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                    isScheduled
                    ? "bg-blue-50 text-blue-700"
                    : "bg-amber-50 text-amber-700"
                }`}
                >
                {isScheduled ? "Scheduled" : "Awaiting schedule"}
                </span>
            </div>

            <h2 className="text-base font-semibold text-ink">
                {entry.item.name}
            </h2>

            <p className="mt-1 text-sm text-ink-muted">
                {formatRupiah(entry.item.price)}
            </p>

            <div className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
                {isHubDropOff ? (
                <MapPin size={16} />
                ) : (
                <Truck size={16} />
                )}

                {isHubDropOff ? "Swap Hub drop-off" : "Seller pickup"}
            </div>
            </div>
        </div>

        <div className="border-t border-border bg-[#FAFCFA] p-4">
            {isHubDropOff ? (
            <div className="space-y-4">
                {!isScheduled && (
                <div>
                    <label
                    htmlFor={`hub-${entry.item.productId}`}
                    className="mb-2 block text-sm font-medium text-ink"
                    >
                    Choose your Swap Hub
                    </label>

                    <select
                    id={`hub-${entry.item.productId}`}
                    value={selectedHub}
                    onChange={(event) =>
                        setSelectedHub(event.target.value)
                    }
                    className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary"
                    >
                    <option value="">Select a location</option>
                    {swapHubs.map((hub) => (
                        <option key={hub.id} value={hub.id}>
                        {hub.name}
                        </option>
                    ))}
                    </select>
                </div>
                )}

                {selectedHubDetails && !isScheduled && (
                <div className="rounded-xl border border-border bg-white p-3">
                    <p className="text-sm font-medium text-ink">
                    {selectedHubDetails.name}
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">
                    {selectedHubDetails.address}
                    </p>
                    <p className="mt-2 text-xs font-medium text-primary">
                    Drop box available 24/7
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    {selectedHubDetails.accessInstructions}
                    </p>

                    {selectedHubDetails.hostAccessHours && (
                    <p className="mt-2 text-xs text-ink-muted">
                        Host access: {selectedHubDetails.hostAccessHours}
                    </p>
                    )}
                </div>
                )}

                {isScheduled && handover.hubName && (
                <div className="rounded-xl border border-border bg-white p-3">
                    <p className="text-sm font-medium text-ink">
                    {handover.hubName}
                    </p>
                    {handover.hubAddress && (
                    <p className="mt-1 text-sm text-ink-muted">
                        {handover.hubAddress}
                    </p>
                    )}
                    <p className="mt-2 text-xs font-medium text-primary">
                    Drop box available 24/7
                    </p>
                </div>
                )}

                {(!isScheduled || isRescheduling) && (
                <div>
                    <label
                    htmlFor={`date-${entry.item.productId}`}
                    className="mb-2 flex items-center gap-2 text-sm font-medium text-ink"
                    >
                    <CalendarDays size={16} />
                    {isRescheduling
                        ? "New drop-off date"
                        : "Preferred drop-off date"}
                    </label>

                    <input
                    id={`date-${entry.item.productId}`}
                    type="date"
                    min={getLocalDateString()}
                    value={preferredDate}
                    onChange={(event) =>
                        setPreferredDate(event.target.value)
                    }
                    className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary"
                    />

                    <p className="mt-2 text-xs text-ink-muted">
                    No appointment time is required. You can drop off
                    your item during the host location&apos;s accessible
                    hours.
                    </p>
                </div>
                )}
            </div>
            ) : (
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-ink">
                <Truck size={17} />
                Pickup address
                </div>

                {handover.pickupAddress && (
                <div className="rounded-xl border border-border bg-white p-3 text-sm">
                    <p className="font-medium text-ink">
                    {handover.pickupAddress.name}
                    </p>
                    <p className="mt-1 text-ink-muted">
                    {handover.pickupAddress.address},{" "}
                    {handover.pickupAddress.city},{" "}
                    {handover.pickupAddress.postalCode}
                    </p>
                    <p className="mt-1 text-ink-muted">
                    {handover.pickupAddress.phone}
                    </p>
                </div>
                )}

                {(!isScheduled || isRescheduling) && (
                <div>
                    <label
                    htmlFor={`pickup-${entry.item.productId}`}
                    className="mb-2 flex items-center gap-2 text-sm font-medium text-ink"
                    >
                    <Clock3 size={16} />
                    {isRescheduling
                        ? "New pickup date and time"
                        : "Preferred pickup date and time"}
                    </label>

                    <input
                    id={`pickup-${entry.item.productId}`}
                    type="datetime-local"
                    min={getLocalDateTimeString(new Date().toISOString())}
                    value={pickupDateTime}
                    onChange={(event) =>
                        setPickupDateTime(event.target.value)
                    }
                    className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary"
                    />
                </div>
                )}
            </div>
            )}

            {isScheduled && (
            <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
                <p className="font-medium">Your handover is scheduled</p>
                <p className="mt-1">
                {isHubDropOff
                    ? formatDate(handover.scheduledAt)
                    : formatDateTime(handover.scheduledAt)}
                </p>
                {isHubDropOff && handover.hubName && (
                <p className="mt-1">{handover.hubName}</p>
                )}
            </div>
            )}

            {isScheduled && rescheduleHistory.length > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-white p-3">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <RefreshCw size={16} />
                Reschedule history
                </div>

                <div className="space-y-3">
                {rescheduleHistory.map((record, index) => (
                    <div
                    key={`${record.changedAt}-${index}`}
                    className="border-l-2 border-primary pl-3"
                    >
                    <p className="text-xs text-ink-muted">
                        Changed on {formatDateTime(record.changedAt)}
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">
                        Previous:{" "}
                        {isHubDropOff
                        ? formatDate(record.previousScheduledAt)
                        : formatDateTime(record.previousScheduledAt)}
                    </p>
                    <p className="mt-1 text-sm font-medium text-ink">
                        New:{" "}
                        {isHubDropOff
                        ? formatDate(record.newScheduledAt)
                        : formatDateTime(record.newScheduledAt)}
                    </p>
                    </div>
                ))}
                </div>
            </div>
            )}

            {isScheduled && !isRescheduling && (
            <div className="mt-4">
                {canReschedule ? (
                <button
                    type="button"
                    onClick={() => {
                    resetScheduleInputs();
                    setIsRescheduling(true);
                    }}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-primary bg-white px-5 text-sm font-semibold text-primary transition hover:bg-mint-50"
                >
                    <RefreshCw size={16} />
                    Reschedule handover
                </button>
                ) : (
                <p className="text-xs leading-relaxed text-ink-muted">
                    {rescheduleUnavailableReason}
                </p>
                )}
            </div>
            )}

            {isRescheduling && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-900">
                One-time rescheduling
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-800">
                You can only change this schedule once, and the request
                must be made at least 24 hours before your original
                scheduled handover.
                </p>
            </div>
            )}

            {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
                {error}
            </p>
            )}

            {!isScheduled && (
            <button
                type="button"
                onClick={handleSchedule}
                disabled={saving}
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {saving && (
                <RefreshCw size={16} className="animate-spin" />
                )}
                {saving ? "Saving schedule..." : "Confirm handover schedule"}
            </button>
            )}

            {isRescheduling && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                type="button"
                onClick={() => {
                    setIsRescheduling(false);
                    resetScheduleInputs();
                }}
                disabled={saving}
                className="h-11 flex-1 rounded-full border border-border bg-white px-5 text-sm font-semibold text-ink transition hover:bg-gray-50 disabled:opacity-60"
                >
                Cancel
                </button>

                <button
                type="button"
                onClick={handleReschedule}
                disabled={saving}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                {saving && (
                    <RefreshCw size={16} className="animate-spin" />
                )}
                {saving ? "Updating schedule..." : "Confirm new schedule"}
                </button>
            </div>
            )}
        </div>
        </article>
    );
    }

    export default function SellerHandoverPage() {
    const [handovers, setHandovers] = useState<HandoverEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadHandovers = useCallback(async () => {
        setError("");

        try {
        const data = await apiRequest<HandoverEntry[]>(
            "/api/seller/handover",
        );
        setHandovers(data);
        } catch (err) {
        setError(
            err instanceof Error
            ? err.message
            : "Unable to load your handovers.",
        );
        } finally {
        setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadHandovers();
    }, [loadHandovers]);

    return (
        <main className="min-h-screen bg-[#F8FAF8] px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl">
            <div className="mb-6">
            <p className="text-sm font-medium text-primary">
                SELLER CENTER
            </p>
            <h1 className="mt-1 text-2xl font-bold text-ink">
                Handover scheduling
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                Arrange how and when your sold items will be handed over
                to SwapIt for quality inspection.
            </p>
            </div>

            <div className="mb-6 rounded-2xl border border-border bg-white p-4">
            <div className="flex gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-mint-50 text-primary">
                <Package size={20} />
                </div>
                <div>
                <p className="text-sm font-semibold text-ink">
                    What happens next?
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                    After scheduling, hand over your item using the
                    selected method. SwapIt will record receipt and proceed
                    with quality inspection.
                </p>
                </div>
            </div>
            </div>

            {loading ? (
            <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-ink-muted">
                Loading your handovers...
            </div>
            ) : error ? (
            <div className="rounded-2xl border border-border bg-white p-6 text-center">
                <p className="text-sm text-danger">{error}</p>
                <button
                type="button"
                onClick={() => {
                    setLoading(true);
                    void loadHandovers();
                }}
                className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white"
                >
                Try again
                </button>
            </div>
            ) : handovers.length === 0 ? (
            <div className="rounded-2xl border border-border bg-white p-8 text-center">
                <Package className="mx-auto text-ink-muted" size={32} />
                <h2 className="mt-3 font-semibold text-ink">
                No handovers to schedule
                </h2>
                <p className="mt-2 text-sm text-ink-muted">
                Items from your paid orders will appear here when they
                are ready for handover scheduling.
                </p>
            </div>
            ) : (
            <div className="space-y-4">
                {handovers.map((entry) => (
                <HandoverCard
                    key={`${entry.orderId}-${entry.item.productId}`}
                    entry={entry}
                    onScheduled={() => {
                    void loadHandovers();
                    }}
                />
                ))}
            </div>
            )}
        </div>
        </main>
    );
    }
