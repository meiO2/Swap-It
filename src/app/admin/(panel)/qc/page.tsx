"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  Camera,
  CheckCircle2,
  Clock3,
  ImagePlus,
  ListChecks,
  Search,
  UserRoundCheck,
  X,
} from "lucide-react";

import { qcCriteriaByCategory } from "@/data/qcCriteria";
import { apiRequest } from "@/lib/api";

type QueueItem = {
  id: string;
  productId: string;
  type: "order";
  createdAt: string;
  category: string;
  title: string;
  quantity?: number;
  value: number;
  size?: string;
  condition?: string;
  description?: string;
  image?: string;
  handover?: {
    method?: string;
    hubName?: string;
    status?: string;
    scheduledAt?: string;
  };
  qcStatus?: string;
  buyerQcDecision?: string;
  qcDecisionDeadline?: string;
  qcAssessment?: {
    decision?: string;
    notes?: string;
    evidenceUrls?: string[];
    answers?: Array<{ criterionId: string; optionId: string }>;
  } | null;
};

type EvidenceState = {
  files: File[];
  previews: string[];
};

export default function AdminQcPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selected, setSelected] = useState<
    Record<string, Record<string, string>>
  >({});
  const [evidence, setEvidence] = useState<Record<string, EvidenceState>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<
    "all" | "todo" | "buyer" | "done"
  >("todo");
  const [search, setSearch] = useState("");
  const evidenceRef = useRef(evidence);

  function getItemKey(item: QueueItem) {
    return `order:${item.id}:${item.productId}`;
  }

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setItems(await apiRequest<QueueItem[]>("/api/admin/qc"));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load the QC queue.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadQueue();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadQueue]);

  useEffect(() => {
    evidenceRef.current = evidence;
  }, [evidence]);

  useEffect(() => () => {
    Object.values(evidenceRef.current).forEach(({ previews }) => {
      previews.forEach((preview) => URL.revokeObjectURL(preview));
    });
  }, []);

  function handleEvidenceChange(
    itemKey: string,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(event.target.files ?? [])
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, 8);
    const previous = evidence[itemKey]?.previews ?? [];
    previous.forEach((preview) => URL.revokeObjectURL(preview));
    setEvidence((value) => ({
      ...value,
      [itemKey]: {
        files,
        previews: files.map((file) => URL.createObjectURL(file)),
      },
    }));
    event.target.value = "";
  }

  function removeEvidence(itemKey: string, index: number) {
    const current = evidence[itemKey];
    if (!current) return;
    URL.revokeObjectURL(current.previews[index]);
    setEvidence((value) => ({
      ...value,
      [itemKey]: {
        files: current.files.filter((_, fileIndex) => fileIndex !== index),
        previews: current.previews.filter(
          (_, previewIndex) => previewIndex !== index,
        ),
      },
    }));
  }

  async function submitReview(item: QueueItem) {
    const itemKey = getItemKey(item);
    const criteria =
      qcCriteriaByCategory[item.category] ?? qcCriteriaByCategory.default;
    const picks =
      selected[itemKey] ??
      Object.fromEntries(
        item.qcAssessment?.answers?.map((answer) => [
          answer.criterionId,
          answer.optionId,
        ]) ?? [],
      );
    const itemEvidence = evidence[itemKey]?.files ?? [];
    const hasIssues = Object.values(picks).some((optionId) => optionId !== "good");

    if (!criteria.length || !criteria.every((criterion) => picks[criterion.id])) {
      setError("Please answer every QC criterion before submitting.");
      return;
    }

    if (hasIssues && itemEvidence.length === 0) {
      setError("Add at least one evidence photo for the reported issue.");
      return;
    }

    setSavingId(itemKey);
    setError("");
    setNotice("");

    try {
      let evidenceUrls: string[] = [];
      if (itemEvidence.length > 0) {
        const formData = new FormData();
        itemEvidence.forEach((file) => formData.append("images", file));
        evidenceUrls = await apiRequest<string[]>("/api/uploads", {
          method: "POST",
          body: formData,
        });
      }

      await apiRequest(`/api/admin/qc/order/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          productId: item.productId,
          category: item.category,
          answers: Object.entries(picks).map(([criterionId, optionId]) => ({
            criterionId,
            optionId,
          })),
          notes: notes[itemKey]?.trim() || undefined,
          evidenceUrls,
        }),
      });

      setNotice(`${item.title} QC assessment saved.`);
      await loadQueue();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save this QC assessment.",
      );
    } finally {
      setSavingId("");
    }
  }

  const tracker = {
    todo: items.filter((item) => !item.qcAssessment),
    buyer: items.filter(
      (item) =>
        item.qcStatus === "FAILED_AWAITING_BUYER" &&
        !item.buyerQcDecision,
    ),
    done: items.filter(
      (item) =>
        item.qcStatus === "PASSED" ||
        item.buyerQcDecision === "ACCEPT" ||
        item.buyerQcDecision === "REJECT",
    ),
  };
  const visibleItems = items.filter((item) => {
    const matchesTab =
      activeTab === "all" ||
      (activeTab === "todo" && !item.qcAssessment) ||
      (activeTab === "buyer" &&
        item.qcStatus === "FAILED_AWAITING_BUYER" &&
        !item.buyerQcDecision) ||
      (activeTab === "done" &&
        (item.qcStatus === "PASSED" ||
          item.buyerQcDecision === "ACCEPT" ||
          item.buyerQcDecision === "REJECT"));
    const query = search.trim().toLowerCase();
    return (
      matchesTab &&
      (!query ||
        item.title.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query))
    );
  });

  function statusLabel(item: QueueItem) {
    if (!item.qcAssessment) return "Perlu dicek";
    if (item.qcStatus === "FAILED_AWAITING_BUYER" && !item.buyerQcDecision) {
      return "Menunggu buyer";
    }
    if (item.buyerQcDecision === "ACCEPT") return "Buyer menerima";
    if (item.buyerQcDecision === "REJECT") return "Buyer menolak";
    return "Selesai";
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          SwapIt operations / QC
        </p>
        <h1 className="mt-2 text-3xl font-bold text-ink">Quality control queue</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Inspect every item received at the Swap Hub. Record the condition
          clearly so buyers and sellers have a reliable audit trail.
        </p>
      </header>

      {error && (
        <p role="alert" className="mb-4 rounded-2xl bg-danger/10 p-4 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-2xl bg-success/10 p-4 text-sm text-success">
          <CheckCircle2 size={18} />
          {notice}
        </p>
      )}

      {!loading && (
        <>
          <section className="mb-5 grid gap-3 sm:grid-cols-3">
            {[
              {
                id: "todo" as const,
                label: "Perlu dicek",
                value: tracker.todo.length,
                detail: "Item baru diterima",
                icon: ListChecks,
                className: "bg-white text-primary",
              },
              {
                id: "buyer" as const,
                label: "Menunggu buyer",
                value: tracker.buyer.length,
                detail: "Perlu keputusan",
                icon: UserRoundCheck,
                className: "bg-warning/10 text-warning",
              },
              {
                id: "done" as const,
                label: "Selesai",
                value: tracker.done.length,
                detail: "QC sudah diproses",
                icon: CheckCircle2,
                className: "bg-success/10 text-success",
              },
            ].map(({ id, label, value, detail, icon: Icon, className }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`rounded-3xl p-4 text-left shadow-card transition hover:-translate-y-0.5 ${className} ${
                  activeTab === id ? "ring-2 ring-primary/40" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-2xl bg-white/80">
                    <Icon size={20} />
                  </span>
                  <span className="text-3xl font-bold">{value}</span>
                </div>
                <p className="mt-4 text-sm font-bold">{label}</p>
                <p className="mt-1 text-xs opacity-75">{detail}</p>
              </button>
            ))}
          </section>
          <div className="mb-5 flex flex-col gap-3 rounded-3xl bg-white p-3 shadow-card sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 px-2 text-sm text-ink-muted">
              <Search size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari item, kategori, atau order…"
                className="h-10 min-w-0 flex-1 bg-transparent outline-none"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto">
              {[
                ["all", "Semua"],
                ["todo", "Perlu dicek"],
                ["buyer", "Menunggu buyer"],
                ["done", "Selesai"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id as typeof activeTab)}
                  className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${
                    activeTab === id
                      ? "bg-primary text-white"
                      : "text-ink-muted hover:bg-mint-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {loading ? (
        <div className="rounded-3xl bg-white p-8 text-sm text-ink-muted shadow-card">
          Loading review queue…
        </div>
      ) : visibleItems.length === 0 ? (
        <section className="rounded-3xl bg-white p-10 text-center shadow-card">
          <Clock3 className="mx-auto text-primary" size={32} />
          <h2 className="mt-3 font-semibold text-ink">
            {items.length === 0 ? "Belum ada item di tracker" : "Tidak ada item di filter ini"}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {items.length === 0
              ? "Item akan muncul setelah diterima di Swap Hub."
              : "Coba pilih status lain atau ubah kata pencarian."}
          </p>
        </section>
      ) : (
        <div className="space-y-5">
          {visibleItems.map((item) => {
            const itemKey = getItemKey(item);
            const criteria =
              qcCriteriaByCategory[item.category] ?? qcCriteriaByCategory.default;
            const picks = selected[itemKey] ?? {};
            const itemEvidence = evidence[itemKey] ?? { files: [], previews: [] };
            const complete = criteria.every((criterion) => picks[criterion.id]);
            const saving = savingId === itemKey;

            return (
              <article key={itemKey} className="overflow-hidden rounded-3xl bg-white shadow-card">
                <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:p-6">
                  <div>
                    <div className="flex items-start gap-4">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={`Product photo of ${item.title}`}
                          className="size-24 rounded-2xl object-cover"
                        />
                      ) : (
                        <div className="flex size-24 items-center justify-center rounded-2xl bg-mint-50 text-primary">
                          <ImagePlus size={28} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                            {item.category} · Received
                          </p>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                            !item.qcAssessment
                              ? "bg-primary/10 text-primary"
                              : item.qcStatus === "FAILED_AWAITING_BUYER" && !item.buyerQcDecision
                                ? "bg-warning/15 text-warning"
                                : "bg-success/10 text-success"
                          }`}>
                            {statusLabel(item)}
                          </span>
                        </div>
                        <h2 className="mt-1 text-lg font-bold text-ink">{item.title}</h2>
                        <p className="mt-1 text-sm font-semibold text-ink">
                          Rp{item.value.toLocaleString("id-ID")}
                        </p>
                      </div>
                    </div>

                    <dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-mint-50 p-4 text-sm">
                      {item.size && <div><dt className="text-xs text-ink-muted">Size</dt><dd className="font-medium">{item.size}</dd></div>}
                      {item.condition && <div><dt className="text-xs text-ink-muted">Listed condition</dt><dd className="font-medium">{item.condition}</dd></div>}
                      <div><dt className="text-xs text-ink-muted">Handover</dt><dd className="font-medium">{item.handover?.hubName ?? item.handover?.method ?? "Swap Hub"}</dd></div>
                      {item.description && <div className="col-span-2"><dt className="text-xs text-ink-muted">Seller description</dt><dd className="font-medium">{item.description}</dd></div>}
                    </dl>
                  </div>

                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-ink">
                          {item.qcAssessment ? "Inspection result" : "Inspection checklist"}
                        </h3>
                        <p className="mt-1 text-xs text-ink-muted">
                          {item.qcAssessment
                            ? "This inspection has been saved."
                            : "Select one result for every criterion."}
                        </p>
                      </div>
                      <span className="rounded-full bg-mint-50 px-3 py-1 text-xs font-semibold text-primary">
                        {Object.keys(picks).length}/{criteria.length}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {criteria.map((criterion) => (
                        <fieldset key={criterion.id} className="rounded-2xl border border-border p-3">
                          <legend className="px-1 text-sm font-semibold text-ink">{criterion.label}</legend>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {criterion.options.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                disabled={Boolean(item.qcAssessment)}
                                aria-pressed={picks[criterion.id] === option.id}
                                onClick={() => setSelected((value) => ({
                                  ...value,
                                  [itemKey]: { ...value[itemKey], [criterion.id]: option.id },
                                }))}
                                className={`min-h-10 rounded-full border px-3 text-xs font-semibold transition ${
                                  picks[criterion.id] === option.id
                                    ? option.id === "major"
                                      ? "border-danger bg-danger text-white"
                                      : "border-primary bg-primary text-white"
                                    : "border-border bg-white text-ink hover:border-primary"
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </fieldset>
                      ))}
                    </div>

                    {item.qcAssessment?.notes && (
                      <div className="mt-4 rounded-2xl bg-warning/10 p-3 text-sm text-ink">
                        <p className="text-xs font-bold uppercase tracking-wide text-warning">
                          Catatan untuk buyer
                        </p>
                        <p className="mt-1">{item.qcAssessment.notes}</p>
                      </div>
                    )}
                    {item.qcAssessment?.evidenceUrls &&
                      item.qcAssessment.evidenceUrls.length > 0 && (
                        <div className="mt-4 flex gap-2 overflow-x-auto">
                          {item.qcAssessment.evidenceUrls.map((url) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0"
                            >
                              <img
                                src={url}
                                alt="Saved QC evidence"
                                className="size-16 rounded-xl object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      )}

                    <label className="mt-4 block text-sm font-semibold text-ink" htmlFor={`notes-${itemKey}`}>
                      Inspection notes <span className="font-normal text-ink-muted">(recommended for issues)</span>
                    </label>
                    <textarea
                      id={`notes-${itemKey}`}
                      value={notes[itemKey] ?? ""}
                      disabled={Boolean(item.qcAssessment)}
                      onChange={(event) => setNotes((value) => ({ ...value, [itemKey]: event.target.value }))}
                      maxLength={2000}
                      rows={3}
                      placeholder="Describe the issue, location, and severity…"
                      className="mt-2 w-full resize-y rounded-2xl border border-border p-3 text-sm outline-none focus:border-primary"
                    />

                    <div className="mt-4 rounded-2xl border border-dashed border-primary/40 bg-mint-50 p-4">
                      <div className="flex items-start gap-3">
                        <Camera className="mt-0.5 shrink-0 text-primary" size={20} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ink">Evidence photos</p>
                          <p className="mt-1 text-xs text-ink-muted">
                            Required when an issue is flagged. Add close-ups of each issue, up to 8 photos.
                          </p>
                          <label className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-white hover:bg-primary-dark">
                            <ImagePlus size={16} />
                            Add photos
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              multiple
                              disabled={Boolean(item.qcAssessment)}
                              className="sr-only"
                              onChange={(event) => handleEvidenceChange(itemKey, event)}
                            />
                          </label>
                        </div>
                      </div>
                      {itemEvidence.previews.length > 0 && (
                        <div className="mt-4 grid grid-cols-4 gap-2">
                          {itemEvidence.previews.map((preview, index) => (
                            <div key={preview} className="group relative aspect-square overflow-hidden rounded-xl bg-white">
                              <img src={preview} alt={`Evidence ${index + 1}`} className="size-full object-cover" />
                              <button
                                type="button"
                                aria-label={`Remove evidence photo ${index + 1}`}
                                onClick={() => removeEvidence(itemKey, index)}
                                className="absolute right-1 top-1 rounded-full bg-ink/70 p-1 text-white opacity-0 transition group-hover:opacity-100"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={!complete || saving || Boolean(item.qcAssessment)}
                        onClick={() => void submitReview(item)}
                        className="min-h-11 rounded-full bg-primary text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? "Saving inspection…" : "Save inspection"}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
