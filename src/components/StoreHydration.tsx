"use client";

import { useEffect } from "react";
import { useSwapStore } from "@/store/useSwapStore";

export default function StoreHydration() {
  useEffect(() => {
    void useSwapStore.persist.rehydrate();
  }, []);
  return null;
}
