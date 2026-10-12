"use client";

import { useEffect } from "react";
import { loadMarketplaceSnapshot, marketplaceSnapshotIsStale, refreshMarketplace, REFRESH_INTERVAL_MS } from "@/lib/marketplace";

/** Refresh once at launch when due, then no more than once per day while open. */
export function MarketplaceRefreshOnLaunch() {
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const snapshot = await loadMarketplaceSnapshot();
      if (disposed) return;
      if (marketplaceSnapshotIsStale(snapshot)) {
        try { await refreshMarketplace(); } catch { /* keep cached data for offline use */ }
      }
      if (!disposed) timer = setTimeout(() => { void check(); }, REFRESH_INTERVAL_MS);
    };
    void check();
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, []);
  return null;
}
