import { Suspense } from "react";
import QcReportRoute from "@/components/QcReportRoute";

export default function QcReportPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-ink-muted">Loading QC report…</div>}>
      <QcReportRoute />
    </Suspense>
  );
}
