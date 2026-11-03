import { useEffect, useMemo, useState } from 'react';

/** Converts the latest server snapshot clock into a stable local offset. */
export function useServerOffset(serverNow: number): number {
  return useMemo(() => serverNow - Date.now(), [serverNow]);
}

export function useNow(active = true, intervalMs = 100): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

export function useRemainingMs(deadline: number | null | undefined, serverOffset: number, intervalMs = 100): number {
  const now = useNow(Boolean(deadline), intervalMs);
  return deadline ? Math.max(0, deadline - now - serverOffset) : 0;
}
