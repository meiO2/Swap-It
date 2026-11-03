"use client";

import { useEffect, useState } from "react";

export default function Countdown({ deadline }: { deadline: string }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Date.parse(deadline) - Date.now()));
    update();
    const intervalId = window.setInterval(update, 1000);
    return () => window.clearInterval(intervalId);
  }, [deadline]);

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return <span aria-live="polite" className="font-semibold tabular-nums">{days}d {String(hours).padStart(2, "0")}h {String(minutes).padStart(2, "0")}m {String(seconds).padStart(2, "0")}s</span>;
}
