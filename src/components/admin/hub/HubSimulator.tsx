
    "use client";

    import { useState } from "react";
    import {
    Camera,
    Lock,
    Unlock,
    PackageCheck,
    RefreshCw,
    AlertCircle,
    } from "lucide-react";

    type ScanResult = {
    success: true;
    action: "UNLOCK";
    message: string;
    data: {
        sessionId: string;
        activity: "DONATION" | "SELLER_HANDOVER";
        hubId: string;
        deviceId: string;
        donationSessionId: string | null;
        orderId: string | null;
        productId: string | null;
    };
    };

    type DoorEvent = "DOOR_OPENED" | "ITEM_DETECTED" | "DOOR_CLOSED" | "DOOR_LOCKED";

    const events: DoorEvent[] = [
    "DOOR_OPENED",
    "ITEM_DETECTED",
    "DOOR_CLOSED",
    "DOOR_LOCKED",
    ];

    export default function HubSimulator() {
    const [token, setToken] = useState("");
    const [session, setSession] = useState<ScanResult["data"] | null>(null);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [eventIndex, setEventIndex] = useState(0);
    const [doorUnlocked, setDoorUnlocked] = useState(false);
    const [doorOpen, setDoorOpen] = useState(false);
    const [completed, setCompleted] = useState(false);

    async function authorizeAccess() {
        if (!token.trim()) {
        setError("Please scan or enter a QR token first.");
        return;
        }

        setBusy(true);
        setError("");
        setMessage("");

        try {
        const response = await fetch("/api/dev/hub-simulator/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token.trim() }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || "Access authorization failed.");
        }

        const data = result as ScanResult;
        setSession(data.data);
        setDoorUnlocked(true);
        setDoorOpen(false);
        setEventIndex(0);
        setCompleted(false);
        setMessage("Access authorized. Virtual solenoid unlocked.");
        } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        } finally {
        setBusy(false);
        }
    }

    async function simulateNextEvent() {
        if (!session || eventIndex >= events.length || busy) return;

        const event = events[eventIndex];

        setBusy(true);
        setError("");

        try {
        const response = await fetch("/api/dev/hub-simulator/door-event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
            sessionId: session.sessionId,
            event,
            occurredAt: new Date().toISOString(),
            }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || `Failed to record ${event}.`);
        }

        if (event === "DOOR_OPENED") setDoorOpen(true);

        if (event === "DOOR_CLOSED") {
            setDoorOpen(false);
            if (result.data?.nextAction === "LOCK") {
            setDoorUnlocked(false);
            }
        }

        if (event === "DOOR_LOCKED") {
            setDoorUnlocked(false);
            setDoorOpen(false);
            setCompleted(true);
        }

        setEventIndex((current) => current + 1);
        setMessage(result.message || `${event} recorded successfully.`);
        } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        } finally {
        setBusy(false);
        }
    }

    function resetSimulator() {
        setToken("");
        setSession(null);
        setMessage("");
        setError("");
        setEventIndex(0);
        setDoorUnlocked(false);
        setDoorOpen(false);
        setCompleted(false);
    }

    return (
        <div className="mx-auto max-w-5xl space-y-6">
        <header>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            SwapIt operations
            </p>
            <h1 className="mt-1 text-2xl font-bold text-ink">Swap Hub Simulator</h1>
            <p className="mt-2 text-sm text-ink-muted">
            Simulate QR authorization, door events, and virtual solenoid control.
            </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
            <StatusCard
            label="Device"
            value="HUB-BSD-001"
            detail="Connected through server proxy"
            />
            <StatusCard
            label="Door"
            value={doorOpen ? "OPEN" : "CLOSED"}
            detail={doorUnlocked ? "Solenoid unlocked" : "Solenoid locked"}
            />
            <StatusCard
            label="Session"
            value={completed ? "COMPLETED" : session ? "ACTIVE" : "IDLE"}
            detail={session ? session.activity.replace("_", " ") : "Waiting for QR"}
            />
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-card">
            <div className="flex items-center gap-2">
            <Camera size={20} className="text-primary" />
            <h2 className="font-semibold text-ink">1. Scan QR code</h2>
            </div>

            <p className="mt-2 text-sm text-ink-muted">
            Scan a valid donation or seller handover QR code using your laptop camera.
            </p>

            <div className="mt-4">
            <label className="text-sm font-medium text-ink">
                QR token (manual testing)
            </label>
            <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={!!session || busy}
                placeholder="Scan a QR code or paste its token here"
                className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-primary disabled:bg-gray-50"
            />
            </div>

            <button
            onClick={authorizeAccess}
            disabled={!!session || busy || !token.trim()}
            className="mt-4 w-full rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
            {busy ? "Authorizing..." : "Authorize & unlock door"}
            </button>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-card">
            <div className="flex items-center gap-2">
            {doorUnlocked ? (
                <Unlock size={20} className="text-primary" />
            ) : (
                <Lock size={20} className="text-ink-muted" />
            )}
            <h2 className="font-semibold text-ink">2. Door simulation</h2>
            </div>

            <div className="mt-5 flex items-center justify-center">
            <div className="flex w-full max-w-xs flex-col items-center rounded-2xl border-2 border-dashed border-gray-200 p-8">
                <div className="relative flex h-36 w-28 items-center justify-center rounded-xl border-4 border-gray-300 bg-gray-50">
                <div
                    className={`absolute inset-1 rounded-lg border-2 transition-all ${
                    doorOpen
                        ? "translate-x-8 -rotate-6 border-primary bg-primary/10"
                        : "border-gray-300 bg-white"
                    }`}
                />
                <div className="z-10">
                    {doorUnlocked ? (
                    <Unlock size={28} className="text-primary" />
                    ) : (
                    <Lock size={28} className="text-ink-muted" />
                    )}
                </div>
                </div>
                <p className="mt-4 text-sm font-semibold text-ink">
                {doorOpen ? "Door Open" : doorUnlocked ? "Unlocked" : "Locked"}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                Virtual solenoid lock
                </p>
            </div>
            </div>

            {session && !completed && (
            <div className="mt-5 rounded-xl bg-gray-50 p-4">
                <p className="text-sm font-medium text-ink">
                Next event: {events[eventIndex] || "All events recorded"}
                </p>
                <button
                onClick={simulateNextEvent}
                disabled={busy || eventIndex >= events.length}
                className="mt-3 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                {busy ? "Processing..." : "Simulate next event"}
                </button>
            </div>
            )}

            {completed && (
            <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
                <PackageCheck className="mb-2" size={22} />
                Door cycle completed. The door is locked.
            </div>
            )}
        </section>

        {(message || error) && (
            <div
            className={`flex items-start gap-2 rounded-xl p-4 text-sm ${
                error
                ? "bg-red-50 text-red-700"
                : "bg-blue-50 text-blue-800"
            }`}
            >
            {error ? <AlertCircle size={18} /> : <PackageCheck size={18} />}
            <p>{error || message}</p>
            </div>
        )}

        {session && (
            <section className="rounded-2xl bg-white p-5 shadow-card">
            <h2 className="font-semibold text-ink">Session information</h2>
            <dl className="mt-3 space-y-2 text-sm">
                <InfoRow label="Session ID" value={session.sessionId} />
                <InfoRow label="Activity" value={session.activity} />
                <InfoRow label="Hub ID" value={session.hubId} />
                <InfoRow label="Device ID" value={session.deviceId} />
                <InfoRow label="Order ID" value={session.orderId || "—"} />
                <InfoRow label="Product ID" value={session.productId || "—"} />
                <InfoRow
                label="Donation session"
                value={session.donationSessionId || "—"}
                />
            </dl>
            </section>
        )}

        <button
            onClick={resetSimulator}
            disabled={busy}
            className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-ink hover:bg-gray-50 disabled:opacity-50"
        >
            <RefreshCw size={16} />
            Reset simulator
        </button>
        </div>
    );
    }

    function StatusCard({
    label,
    value,
    detail,
    }: {
    label: string;
    value: string;
    detail: string;
    }) {
    return (
        <div className="rounded-2xl bg-white p-4 shadow-card">
        <p className="text-xs text-ink-muted">{label}</p>
        <p className="mt-1 font-semibold text-ink">{value}</p>
        <p className="mt-1 text-xs text-ink-muted">{detail}</p>
        </div>
    );
    }

    function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-1 border-b border-gray-100 pb-2 sm:flex-row sm:justify-between">
        <dt className="text-ink-muted">{label}</dt>
        <dd className="break-all font-medium text-ink sm:max-w-[65%] sm:text-right">
            {value}
        </dd>
        </div>
    );
    }
