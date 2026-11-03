import { Box, Check, Circle, PackageCheck, Truck } from "lucide-react";
import { buildTimeline, getCurrentTimelineIndex, type OrderShape } from "@/lib/orders";

export default function OrderTimeline({ order }: { order: OrderShape }) {
  const timeline = order.timeline ?? buildTimeline(order.delivery?.method ?? "courier", order.createdAt);
  const currentIndex = getCurrentTimelineIndex(order);
  const ActiveIcon = order.delivery?.method === "pickup" ? Box : Truck;
  return (
    <ol aria-label="Order status timeline" className="rounded-2xl bg-mint-50 p-4">
      {timeline.map((step, index) => {
        const done = index < currentIndex || (index === currentIndex && (order.status === "Delivered" || order.status === "Picked up" || order.status === "Completed"));
        const current = index === currentIndex && !done;
        const Icon = current ? ActiveIcon : index === 0 ? PackageCheck : Circle;
        const time = step.at ? new Intl.DateTimeFormat("en-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(step.at)) : "-";
        return (
          <li key={`${step.key}-${index}`} className="relative flex min-h-[58px] gap-3 last:min-h-0">
            {index < timeline.length - 1 && <span aria-hidden="true" className={`absolute left-[13px] top-7 h-[calc(100%-1rem)] w-0.5 ${done ? "bg-success" : "bg-border"}`} />}
            <span className={`relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${done ? "bg-success text-white" : current ? "size-8 -ml-0.5 -mt-0.5 bg-white text-primary ring-4 ring-primary/15" : "border-2 border-ink-muted/40 bg-white text-transparent"}`}>
              {done ? <Check size={15} strokeWidth={3} /> : current ? <Icon size={16} /> : <Circle size={7} fill="currentColor" />}
            </span>
            <span className="min-w-0 flex-1 pb-3">
              <span className={`block text-xs font-semibold ${current || done ? "text-ink" : "text-ink-muted"}`}>{step.label}</span>
              <span className={`mt-1 block text-[10px] ${current || done ? "text-ink-muted" : "text-ink-muted/70"}`}>{time}</span>
              <span className="sr-only">{done ? "Done" : current ? "Current" : "Upcoming"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
