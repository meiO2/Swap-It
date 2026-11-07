
    "use client";

    import { useCallback, useEffect, useState } from "react";
    import { Package } from "lucide-react";

    import { apiRequest } from "@/lib/api";
    import {
    HandoverCard,
    type HandoverEntry,
    } from "@/components/seller/HandoverScheduler";

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
                <Package
                className="mx-auto text-ink-muted"
                size={32}
                />

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
