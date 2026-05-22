"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

const TABLES = ["clients", "cases", "hearings", "tasks", "documents"] as const;

export function useLiveSync(onSync: () => void, enabled = true) {
  const onSyncRef = useRef(onSync);
  const [isLive, setIsLive] = useState(false);
  onSyncRef.current = onSync;

  useEffect(() => {
    if (!enabled) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => onSyncRef.current(), 250);
    };

    const channel = supabase.channel("al-noor-live-sync");

    for (const table of TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        debouncedSync
      );
    }

    channel.subscribe((status) => {
      setIsLive(status === "SUBSCRIBED");
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
      setIsLive(false);
    };
  }, [enabled]);

  return { isLive };
}
