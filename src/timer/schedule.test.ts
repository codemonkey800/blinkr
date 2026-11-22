import { describe, expect, it } from 'vitest';
import { phaseAt, type Schedule } from './schedule';

const s: Schedule = { startedAt: 1_000, intervalMs: 10_000, flashMs: 2_000 };
const flashStart = (k: number) => s.startedAt + (k + 1) * s.intervalMs + k * s.flashMs;

describe('phaseAt', () => {
  it('is idle at the start', () => {
    expect(phaseAt(s, s.startedAt)).toEqual({ kind: 'idle', cycle: 0, endsAt: flashStart(0) });
  });

  it.each([0, 1, 2])('has exact boundaries for cycle %i', (k) => {
    const fs = flashStart(k);
    const fe = fs + s.flashMs;
    expect(phaseAt(s, fs - 1)).toMatchObject({ kind: 'idle', cycle: k, endsAt: fs });
    expect(phaseAt(s, fs)).toEqual({ kind: 'flash', cycle: k, startedAt: fs, endsAt: fe });
    expect(phaseAt(s, fe - 1)).toEqual({ kind: 'flash', cycle: k, startedAt: fs, endsAt: fe });
    expect(phaseAt(s, fe)).toEqual({ kind: 'idle', cycle: k + 1, endsAt: flashStart(k + 1) });
  });

  it('flashes at 11 s, 24 s and 37 s after start for 10 s / 2 s', () => {
    expect([0, 1, 2].map((k) => flashStart(k) - s.startedAt)).toEqual([10_000, 22_000, 34_000]);
  });

  it('treats a time before the start as the start', () => {
    expect(phaseAt(s, 0)).toEqual({ kind: 'idle', cycle: 0, endsAt: flashStart(0) });
  });

  it('does not drift over many cycles', () => {
    const k = 100_000;
    expect(phaseAt(s, flashStart(k))).toMatchObject({ kind: 'flash', cycle: k });
    expect(phaseAt(s, flashStart(k) - 1)).toMatchObject({ kind: 'idle', cycle: k });
  });

  it('never flashes with a zero-length flash', () => {
    const z = { ...s, flashMs: 0 };
    expect(phaseAt(z, z.startedAt + z.intervalMs)).toMatchObject({ kind: 'idle', cycle: 1 });
  });

  it('rejects invalid schedules', () => {
    expect(() => phaseAt({ ...s, intervalMs: 0 }, 0)).toThrow(RangeError);
    expect(() => phaseAt({ ...s, flashMs: -1 }, 0)).toThrow(RangeError);
    expect(() => phaseAt({ ...s, intervalMs: NaN }, 0)).toThrow(RangeError);
  });
});
