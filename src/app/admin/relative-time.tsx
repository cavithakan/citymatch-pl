"use client";

import { useSyncExternalStore } from "react";

const MINUTE = 60_000;

/** Ticks once a minute, which is the finest granularity these labels show. */
function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, MINUTE);
  return () => clearInterval(timer);
}

/**
 * The current minute, as an external store.
 *
 * The clock is read through the store API rather than during render, which
 * keeps rendering pure and gives the labels a refresh without an effect that
 * sets state on mount. The server snapshot is 0, so anything time-dependent
 * renders nothing until hydration rather than shipping the server's clock to
 * the reader.
 */
function useMinute(): number {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / MINUTE),
    () => 0,
  );
}

function describe(iso: string, nowMinutes: number): string {
  const minutes = Math.round(nowMinutes - new Date(iso).getTime() / MINUTE);
  const abs = Math.abs(minutes);
  if (abs < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return Math.abs(hours) < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

/**
 * How long ago a timestamp was, on the reader's clock.
 *
 * Client-side deliberately: rendering it on the server would freeze the label
 * at request time, so a cache row would go on claiming it was fetched "2 min
 * ago" long after it was not.
 */
export function RelativeTime({ iso, suffix }: { iso: string; suffix?: string }) {
  const minute = useMinute();
  if (minute === 0) return null;
  return (
    <>
      {describe(iso, minute)}
      {suffix ? ` ${suffix}` : ""}
    </>
  );
}

/** Whether a cache entry is still fresh, evaluated on the reader's clock. */
export function Expiry({ iso, staleLabel }: { iso: string; staleLabel: string }) {
  const minute = useMinute();
  if (minute === 0) return null;

  const stale = new Date(iso).getTime() < minute * MINUTE;
  return stale ? (
    <span className="text-[var(--color-ramp-5)]">{staleLabel}</span>
  ) : (
    <span className="text-muted">in {describe(iso, minute).replace("-", "")}</span>
  );
}
