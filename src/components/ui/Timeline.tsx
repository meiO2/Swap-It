import type { Listing } from "@/store/useSwapStore";

const stages: Listing["status"][] = ["Submitted", "Sorting", "Passed"];

export default function Timeline({ status }: { status: Listing["status"] }) {
  const activeIndex = stages.indexOf(status);
  return (
    <ol aria-label={`Listing status: ${status}`} className="mt-4 flex items-start">
      {stages.map((stage, index) => {
        const complete = activeIndex >= index;
        const isCurrent = stage === status;
        return (
          <li key={stage} className="relative flex flex-1 flex-col items-center text-center">
            {index < stages.length - 1 && <span className={`absolute left-1/2 top-2.5 h-0.5 w-full ${activeIndex > index ? "bg-primary" : "bg-border"}`} />}
            <span className={`relative z-10 size-5 rounded-full border-2 ${complete ? "border-primary bg-primary" : "border-border bg-white"}`} />
            <span className={`mt-2 text-[9px] ${isCurrent ? "font-semibold text-primary" : "text-ink-muted"}`}>{stage}</span>
          </li>
        );
      })}
    </ol>
  );
}
