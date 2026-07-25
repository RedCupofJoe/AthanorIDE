"use client";

/**
 * Fetches and displays API health for the home page.
 */
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

import { fetchHealth, type HealthPayload } from "@/lib/api";

type Status = "loading" | "ok" | "error";

export function HealthStatus() {
  const [status, setStatus] = useState<Status>("loading");
  const [payload, setPayload] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const health = await fetchHealth();
        if (cancelled) return;
        setPayload(health);
        setStatus("ok");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unable to reach API");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      aria-live="polite"
      aria-label="API health status"
      className="rounded-lg border border-[var(--athanor-mist)] bg-white/70 p-5 shadow-sm backdrop-blur"
    >
      <div className="flex items-center gap-3">
        <Activity
          aria-hidden
          className={
            status === "ok"
              ? "text-emerald-700"
              : status === "error"
                ? "text-red-700"
                : "text-[var(--athanor-slate)]"
          }
        />
        <div>
          <h2 className="text-base font-semibold text-[var(--athanor-ink)]">
            Control plane
          </h2>
          <p className="text-sm text-[var(--athanor-slate)]">
            {status === "loading" && "Checking /api/v1/health…"}
            {status === "ok" &&
              payload &&
              `${payload.service} · v${payload.version} · schema ${payload.schemaVersion}`}
            {status === "error" && (error ?? "API unreachable")}
          </p>
        </div>
      </div>
      {status === "error" && (
        <p className="mt-3 text-sm text-[var(--athanor-slate)]">
          Start the API with <code className="rounded bg-[var(--athanor-mist)] px-1">make dev</code>{" "}
          or point <code className="rounded bg-[var(--athanor-mist)] px-1">NEXT_PUBLIC_API_BASE_URL</code>{" "}
          at a running instance.
        </p>
      )}
    </section>
  );
}
