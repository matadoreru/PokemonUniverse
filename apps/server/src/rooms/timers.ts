export type ManagedTimer = NodeJS.Timeout | null;

export function cancelTimer(timer: ManagedTimer): null {
  if (timer) clearTimeout(timer);
  return null;
}

export function earliestDeadline(values: readonly unknown[]): number | null {
  const deadlines = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return deadlines.length ? Math.min(...deadlines) : null;
}

export function scheduleDeadline(deadline: number, callback: () => void, now = Date.now(), toleranceMs = 5): NodeJS.Timeout {
  return setTimeout(callback, Math.max(0, deadline - now + toleranceMs));
}
