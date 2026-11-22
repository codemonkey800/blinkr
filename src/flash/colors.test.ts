import { describe, expect, it } from 'vitest';
import { colorForPulse } from './colors';

describe('colorForPulse', () => {
  it('always returns the only color when there is one', () => {
    for (const i of [0, 1, 2, 17]) expect(colorForPulse(['#ff0000'], i)).toBe('#ff0000');
  });

  it('advances one color per pulse and wraps around', () => {
    const colors = ['#ff0000', '#00ff00', '#0000ff'];
    const seen = [0, 1, 2, 3, 4, 5, 6].map((i) => colorForPulse(colors, i));
    expect(seen).toEqual([
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#ff0000',
    ]);
  });

  it('treats a negative index as wrapping from the end', () => {
    expect(colorForPulse(['#ff0000', '#00ff00'], -1)).toBe('#00ff00');
  });

  it('falls back to a default color for an empty list', () => {
    expect(colorForPulse([], 3)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
