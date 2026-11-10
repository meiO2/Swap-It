"use client";

import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { readFavorites, toggleFavorite } from "@/lib/favorites";

export default function FavoriteButton({ id, className = "" }: { id: string; className?: string }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const sync = () => setSaved(readFavorites().includes(id));
    sync();
    window.addEventListener("favorites-updated", sync);
    return () => window.removeEventListener("favorites-updated", sync);
  }, [id]);

  return (
    <button type="button" aria-label={saved ? "Remove from favorites" : "Add to favorites"} aria-pressed={saved}
      onClick={() => setSaved(toggleFavorite(id))}
      className={`flex size-10 items-center justify-center rounded-full bg-white/95 shadow-card transition hover:scale-105 ${saved ? "text-danger" : "text-ink"} ${className}`}>
      <Heart size={19} fill={saved ? "currentColor" : "none"} />
    </button>
  );
}
