import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings/model';
import { readInitialState } from './devOverrides';

const read = (search: string) => readInitialState(search, true);

describe('readInitialState', () => {
  it('returns defaults, stopped, with no params', () => {
    expect(read('')).toEqual({ settings: DEFAULT_SETTINGS, autostart: false });
  });

  it('ignores every param when not enabled', () => {
    const search =
      '?interval=3&duration=2&style=blink&intensity=90&rate=2&colors=ff0000&autostart=1';
    expect(readInitialState(search, false)).toEqual({
      settings: DEFAULT_SETTINGS,
      autostart: false,
    });
  });

  it('returns fresh copies of the defaults', () => {
    const { settings } = readInitialState('', false);
    expect(settings).not.toBe(DEFAULT_SETTINGS);
    expect(settings.colors).not.toBe(DEFAULT_SETTINGS.colors);
  });

  it('reads interval as seconds', () => {
    expect(read('?interval=3').settings.interval).toEqual({ value: 3, unit: 'seconds' });
    expect(read('?interval=1.5').settings.interval).toEqual({ value: 1.5, unit: 'seconds' });
  });

  it('reads duration, style, intensity, and rate', () => {
    expect(read('?duration=5&style=blink&intensity=80&rate=2.5').settings).toEqual({
      ...DEFAULT_SETTINGS,
      flashDurationSeconds: 5,
      style: 'blink',
      intensity: 80,
      rate: 2.5,
    });
  });

  it('reads colors without # and lowercases them', () => {
    expect(read('?colors=FF0000,00ff00,0000ff').settings.colors).toEqual([
      '#ff0000',
      '#00ff00',
      '#0000ff',
    ]);
  });

  it('accepts a leading # on colors and idle', () => {
    expect(read('?colors=%23ff0000').settings.colors).toEqual(['#ff0000']);
    expect(read('?idle=%23000000').settings.idleColor).toBe('#000000');
  });

  it('reads idle without #', () => {
    expect(read('?idle=101010').settings.idleColor).toBe('#101010');
  });

  it('autostarts only for autostart=1', () => {
    expect(read('?autostart=1').autostart).toBe(true);
    expect(read('?autostart=0').autostart).toBe(false);
    expect(read('?autostart=true').autostart).toBe(false);
    expect(read('?autostart').autostart).toBe(false);
  });

  it('falls back to defaults field by field on invalid values', () => {
    const { settings } = read(
      '?interval=0&duration=99&style=wobble&intensity=5&rate=7&colors=nope&idle=xyz',
    );
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back on non-numeric and empty numbers', () => {
    expect(read('?interval=abc&duration=&rate=NaN').settings).toEqual(DEFAULT_SETTINGS);
  });

  it('drops invalid colors but keeps the valid ones', () => {
    expect(read('?colors=ff0000,zzz,00ff00').settings.colors).toEqual(['#ff0000', '#00ff00']);
  });

  it('applies valid fields even when others are invalid', () => {
    const { settings } = read('?interval=3&duration=99');
    expect(settings.interval).toEqual({ value: 3, unit: 'seconds' });
    expect(settings.flashDurationSeconds).toBe(DEFAULT_SETTINGS.flashDurationSeconds);
  });

  it('ignores unknown params', () => {
    expect(read('?foo=bar&alwaysOnTop=1').settings).toEqual(DEFAULT_SETTINGS);
  });

  it('marks the state overridden only when a recognized param is present', () => {
    expect(read('').overridden).toBeUndefined();
    expect(read('?foo=bar').overridden).toBeUndefined();
    expect(read('?interval=3').overridden).toBe(true);
    expect(read('?autostart=1').overridden).toBe(true);
    expect(readInitialState('?interval=3', false).overridden).toBeUndefined();
  });
});
