"use client";

import { useParams } from "next/navigation";
import QcReport from "@/components/QcReport";

export default function QcReportRoute() {
  const { id } = useParams<{ id: string }>();
  return <QcReport id={id} />;
}
