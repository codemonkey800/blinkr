import { useCallback, useEffect, useRef, useState } from 'react';
import { phaseAt, type Schedule, type TimerPhase } from './schedule';

export interface BlinkTimerOptions {
  intervalMs: number;
  flashMs: number;
  /** Clock in epoch milliseconds. Defaults to `Date.now`. */
  now?: () => number;
}

export interface BlinkTimer {
  running: boolean;
  phase: TimerPhase | null;
  start(): void;
  stop(): void;
  restart(): void;
}

function samePhase(a: TimerPhase | null, b: TimerPhase | null): boolean {
  return (
    a === b || (!!a && !!b && a.kind === b.kind && a.cycle === b.cycle && a.endsAt === b.endsAt)
  );
}

export function useBlinkTimer({ intervalMs, flashMs, now }: BlinkTimerOptions): BlinkTimer {
  const clockRef = useRef<() => number>(now ?? (() => Date.now()));
  useEffect(() => {
    clockRef.current = now ?? (() => Date.now());
  }, [now]);

  // Non-null exactly while running. Held in a ref so the driver effect always reads the latest.
  const scheduleRef = useRef<Schedule | null>(null);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<TimerPhase | null>(null);
  // Bumped by every (re)start so the driver effect re-arms its timer.
  const [epoch, setEpoch] = useState(0);

  const begin = useCallback(() => {
    const t = clockRef.current();
    const schedule: Schedule = { startedAt: t, intervalMs, flashMs };
    scheduleRef.current = schedule;
    setPhase(phaseAt(schedule, t));
    setRunning(true);
    setEpoch((e) => e + 1);
  }, [intervalMs, flashMs]);

  const start = useCallback(() => {
    if (scheduleRef.current) return;
    begin();
  }, [begin]);

  const stop = useCallback(() => {
    scheduleRef.current = null;
    setRunning(false);
    setPhase(null);
  }, []);

  const restart = begin;

  // Timing changes made while running restart the schedule from now.
  const lastTiming = useRef({ intervalMs, flashMs });
  useEffect(() => {
    const last = lastTiming.current;
    if (last.intervalMs === intervalMs && last.flashMs === flashMs) return;
    lastTiming.current = { intervalMs, flashMs };
    if (scheduleRef.current) begin();
  }, [intervalMs, flashMs, begin]);

  // One timeout to the next boundary, then recompute from the clock. Wakeups that come late,
  // or from visibility and focus changes, land directly on the correct phase.
  useEffect(() => {
    if (!running) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      clearTimeout(timer);
      const schedule = scheduleRef.current;
      if (!schedule) return;
      const t = clockRef.current();
      const next = phaseAt(schedule, t);
      setPhase((prev) => (samePhase(prev, next) ? prev : next));
      timer = setTimeout(tick, Math.max(0, Math.ceil(next.endsAt - t)));
    };

    tick();
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [running, epoch]);

  return { running, phase, start, stop, restart };
}
