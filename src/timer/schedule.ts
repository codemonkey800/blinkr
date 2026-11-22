export interface Schedule {
  startedAt: number;
  intervalMs: number;
  flashMs: number;
}

export type TimerPhase =
  | { kind: 'idle'; cycle: number; endsAt: number }
  | { kind: 'flash'; cycle: number; startedAt: number; endsAt: number };

/**
 * Phase at an absolute time. Each cycle is the interval followed by the flash, so cycle `k`
 * flashes from `startedAt + (k + 1) * intervalMs + k * flashMs` for `flashMs`.
 * Pure: depends only on its arguments, so a late or skipped timer never shifts later flashes.
 * A `now` before `startedAt` is treated as `startedAt`.
 */
export function phaseAt(s: Schedule, now: number): TimerPhase {
  const { startedAt, intervalMs, flashMs } = s;
  if (!Number.isFinite(startedAt) || !Number.isFinite(intervalMs) || !Number.isFinite(flashMs)) {
    throw new RangeError('Schedule values must be finite numbers');
  }
  if (intervalMs <= 0 || flashMs < 0) {
    throw new RangeError('intervalMs must be positive and flashMs must not be negative');
  }

  const period = intervalMs + flashMs;
  const elapsed = Math.max(0, now - startedAt);
  const cycle = Math.floor(elapsed / period);
  const cycleStart = startedAt + cycle * period;
  const flashStart = cycleStart + intervalMs;

  if (now < flashStart) {
    return { kind: 'idle', cycle, endsAt: flashStart };
  }
  return { kind: 'flash', cycle, startedAt: flashStart, endsAt: cycleStart + period };
}
