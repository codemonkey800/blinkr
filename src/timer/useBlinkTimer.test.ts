import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBlinkTimer } from './useBlinkTimer';

const INTERVAL = 10_000;
const FLASH = 2_000;
const T0 = 1_000_000;

let clock = T0;
const now = () => clock;

/** Moves the injected clock and the fake timers forward together, as real time would. */
function elapse(ms: number) {
  act(() => {
    clock += ms;
    vi.advanceTimersByTime(ms);
  });
}

function setup(opts = { intervalMs: INTERVAL, flashMs: FLASH }) {
  return renderHook((o) => useBlinkTimer({ ...o, now }), { initialProps: opts });
}

beforeEach(() => {
  vi.useFakeTimers();
  clock = T0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useBlinkTimer', () => {
  it('starts stopped with no phase', () => {
    const { result } = setup();
    expect(result.current.running).toBe(false);
    expect(result.current.phase).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('walks idle and flash boundaries for the first three cycles', () => {
    const { result } = setup();
    act(() => result.current.start());
    expect(result.current.running).toBe(true);
    expect(result.current.phase).toEqual({ kind: 'idle', cycle: 0, endsAt: T0 + INTERVAL });

    for (let k = 0; k < 3; k++) {
      const flashStart = T0 + (k + 1) * INTERVAL + k * FLASH;
      elapse(flashStart - 1 - clock);
      expect(result.current.phase).toMatchObject({ kind: 'idle', cycle: k });
      elapse(1);
      expect(result.current.phase).toEqual({
        kind: 'flash',
        cycle: k,
        startedAt: flashStart,
        endsAt: flashStart + FLASH,
      });
      elapse(FLASH - 1);
      expect(result.current.phase).toMatchObject({ kind: 'flash', cycle: k });
      elapse(1);
      expect(result.current.phase).toMatchObject({ kind: 'idle', cycle: k + 1 });
    }
  });

  it('schedules a single timeout at a time', () => {
    const { result } = setup();
    act(() => result.current.start());
    expect(vi.getTimerCount()).toBe(1);
    elapse(INTERVAL);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('lands in the right phase when the timer fires 5 s late, without shifting cycle 3', () => {
    const { result } = setup();
    act(() => result.current.start());
    // Clock is already 5 s past the flash start when the timeout runs.
    act(() => {
      clock = T0 + INTERVAL + 5_000;
      vi.advanceTimersByTime(INTERVAL);
    });
    expect(result.current.phase).toMatchObject({ kind: 'idle', cycle: 1 });
    const flash3 = T0 + 4 * INTERVAL + 3 * FLASH;
    elapse(flash3 - 1 - clock);
    expect(result.current.phase).toMatchObject({ kind: 'idle', cycle: 3 });
    elapse(1);
    expect(result.current.phase).toMatchObject({ kind: 'flash', cycle: 3, startedAt: flash3 });
  });

  it('skips a missed flash when the clock jumps a whole cycle ahead', () => {
    const { result } = setup();
    act(() => result.current.start());
    // Sleep through all of cycle 0's flash and part of cycle 1's idle.
    act(() => {
      clock = T0 + INTERVAL + FLASH + 4_000;
      vi.advanceTimersByTime(INTERVAL);
    });
    expect(result.current.phase).toMatchObject({ kind: 'idle', cycle: 1 });
    // Next transition is cycle 1's flash, not a replay of cycle 0's.
    elapse(1);
    expect(result.current.phase).toMatchObject({ kind: 'idle', cycle: 1 });
    const flash1 = T0 + 2 * INTERVAL + FLASH;
    elapse(flash1 - clock);
    expect(result.current.phase).toMatchObject({ kind: 'flash', cycle: 1 });
  });

  it('recomputes on visibilitychange and focus', () => {
    const { result } = setup();
    act(() => result.current.start());
    act(() => {
      clock = T0 + INTERVAL + 1;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.phase).toMatchObject({ kind: 'flash', cycle: 0 });
    act(() => {
      clock = T0 + 2 * (INTERVAL + FLASH) + 1;
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current.phase).toMatchObject({ kind: 'idle', cycle: 2 });
    expect(vi.getTimerCount()).toBe(1);
  });

  it('stop clears timers and phase', () => {
    const { result } = setup();
    act(() => result.current.start());
    elapse(INTERVAL);
    act(() => result.current.stop());
    expect(result.current.running).toBe(false);
    expect(result.current.phase).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    elapse(INTERVAL * 3);
    expect(result.current.phase).toBeNull();
  });

  it('start while running does not reset the schedule', () => {
    const { result } = setup();
    act(() => result.current.start());
    elapse(4_000);
    act(() => result.current.start());
    expect(result.current.phase).toMatchObject({ kind: 'idle', cycle: 0, endsAt: T0 + INTERVAL });
  });

  it('can start again after stop with a fresh schedule', () => {
    const { result } = setup();
    act(() => result.current.start());
    elapse(INTERVAL + 1);
    act(() => result.current.stop());
    act(() => result.current.start());
    expect(result.current.phase).toEqual({ kind: 'idle', cycle: 0, endsAt: clock + INTERVAL });
  });

  it('restart keeps running with startedAt = now', () => {
    const { result } = setup();
    act(() => result.current.start());
    elapse(INTERVAL + 1);
    expect(result.current.phase).toMatchObject({ kind: 'flash', cycle: 0 });
    const restartedAt = clock;
    act(() => result.current.restart());
    expect(result.current.running).toBe(true);
    expect(result.current.phase).toEqual({
      kind: 'idle',
      cycle: 0,
      endsAt: restartedAt + INTERVAL,
    });
    expect(vi.getTimerCount()).toBe(1);
    elapse(INTERVAL);
    expect(result.current.phase).toMatchObject({
      kind: 'flash',
      cycle: 0,
      startedAt: restartedAt + INTERVAL,
    });
  });

  it('restarts from now when interval or flash length changes while running', () => {
    const { result, rerender } = setup();
    act(() => result.current.start());
    elapse(4_000);
    const changedAt = clock;
    rerender({ intervalMs: 5_000, flashMs: FLASH });
    expect(result.current.running).toBe(true);
    expect(result.current.phase).toEqual({ kind: 'idle', cycle: 0, endsAt: changedAt + 5_000 });
    elapse(5_000);
    expect(result.current.phase).toMatchObject({
      kind: 'flash',
      cycle: 0,
      endsAt: changedAt + 5_000 + FLASH,
    });

    const flashChangedAt = clock;
    rerender({ intervalMs: 5_000, flashMs: 1_000 });
    expect(result.current.phase).toEqual({
      kind: 'idle',
      cycle: 0,
      endsAt: flashChangedAt + 5_000,
    });
    expect(vi.getTimerCount()).toBe(1);
  });

  it('does not start when options change while stopped', () => {
    const { result, rerender } = setup();
    rerender({ intervalMs: 5_000, flashMs: FLASH });
    expect(result.current.running).toBe(false);
    expect(result.current.phase).toBeNull();
    act(() => result.current.start());
    expect(result.current.phase).toEqual({ kind: 'idle', cycle: 0, endsAt: T0 + 5_000 });
  });

  it('clears timers and listeners on unmount', () => {
    const removeDoc = vi.spyOn(document, 'removeEventListener');
    const removeWin = vi.spyOn(window, 'removeEventListener');
    const { result, unmount } = setup();
    act(() => result.current.start());
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(removeDoc).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(removeWin).toHaveBeenCalledWith('focus', expect.any(Function));
    removeDoc.mockRestore();
    removeWin.mockRestore();
  });

  it('defaults to Date.now', () => {
    vi.setSystemTime(new Date(5_000_000));
    const { result } = renderHook(() => useBlinkTimer({ intervalMs: INTERVAL, flashMs: FLASH }));
    act(() => result.current.start());
    expect(result.current.phase).toEqual({ kind: 'idle', cycle: 0, endsAt: 5_000_000 + INTERVAL });
    act(() => {
      vi.advanceTimersByTime(INTERVAL);
    });
    expect(result.current.phase).toMatchObject({ kind: 'flash', cycle: 0 });
  });
});
