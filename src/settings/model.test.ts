import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  GLOBAL_SHORTCUTS,
  LIMITS,
  type Settings,
  intervalMs,
  isStrongFlash,
  sanitizeSettings,
  validateSettings,
} from './model';

const withSettings = (patch: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...patch });
const colorsOf = (n: number) => Array.from({ length: n }, (_, i) => `#00000${i}`);

describe('defaults', () => {
  it('match the specified values', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      interval: { value: 10, unit: 'minutes' },
      flashDurationSeconds: 2,
      colors: ['#ffb547'],
      style: 'pulse',
      intensity: 60,
      rate: 1,
      idleColor: '#1b1e25',
      alwaysOnTop: false,
      borderless: false,
      fullscreen: false,
      globalShortcut: null,
    });
  });

  it('are valid', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual({});
  });

  it('survive sanitizing unchanged', () => {
    expect(sanitizeSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('intervalMs', () => {
  it('converts seconds, minutes, and hours', () => {
    expect(intervalMs({ value: 1, unit: 'seconds' })).toBe(1_000);
    expect(intervalMs({ value: 90, unit: 'seconds' })).toBe(90_000);
    expect(intervalMs({ value: 1, unit: 'minutes' })).toBe(60_000);
    expect(intervalMs({ value: 10, unit: 'minutes' })).toBe(600_000);
    expect(intervalMs({ value: 1, unit: 'hours' })).toBe(3_600_000);
    expect(intervalMs({ value: 24, unit: 'hours' })).toBe(86_400_000);
  });
});

describe('limits', () => {
  it('exposes the documented bounds', () => {
    expect(LIMITS.MAX_COLORS).toBe(6);
    expect(LIMITS.INTERVAL_MIN_MS).toBe(1_000);
    expect(LIMITS.INTERVAL_MAX_MS).toBe(86_400_000);
  });

  describe('interval', () => {
    it.each([
      [1, 'seconds'],
      [60, 'seconds'],
      [1, 'minutes'],
      [1_440, 'minutes'],
      [86_400, 'seconds'],
      [24, 'hours'],
    ] as const)('accepts %s %s', (value, unit) => {
      expect(
        validateSettings(withSettings({ interval: { value, unit } })).interval,
      ).toBeUndefined();
    });

    it.each([
      [0.999, 'seconds'],
      [0, 'seconds'],
      [-1, 'minutes'],
      [86_401, 'seconds'],
      [1_441, 'minutes'],
      [24.01, 'hours'],
      [25, 'hours'],
      [NaN, 'seconds'],
      [Infinity, 'hours'],
    ] as const)('rejects %s %s', (value, unit) => {
      expect(validateSettings(withSettings({ interval: { value, unit } })).interval).toBe(
        'Interval must be between 1 second and 24 hours.',
      );
    });
  });

  describe('flashDurationSeconds', () => {
    it.each([0.5, 1, 30])('accepts %s', (v) => {
      expect(validateSettings(withSettings({ flashDurationSeconds: v }))).toEqual({});
    });
    it.each([0.49, 0, -1, 30.01, NaN, Infinity])('rejects %s', (v) => {
      expect(
        validateSettings(withSettings({ flashDurationSeconds: v })).flashDurationSeconds,
      ).toMatch(/0\.5 and 30 seconds/);
    });
  });

  describe('colors', () => {
    it.each([1, 6])('accepts %s colors', (n) => {
      expect(validateSettings(withSettings({ colors: colorsOf(n) }))).toEqual({});
    });
    it('rejects none and seven', () => {
      expect(validateSettings(withSettings({ colors: [] })).colors).toBeDefined();
      expect(validateSettings(withSettings({ colors: colorsOf(7) })).colors).toBeDefined();
    });
    it.each(['red', '#fff', '#12345g', 'ffb547', '#ffb5470'])('rejects bad color %s', (c) => {
      expect(validateSettings(withSettings({ colors: [c] })).colors).toBeDefined();
    });
  });

  describe('intensity', () => {
    it.each([10, 55, 100])('accepts %s', (v) => {
      expect(validateSettings(withSettings({ intensity: v }))).toEqual({});
    });
    it.each([9, 101, 0, 60.5, NaN, Infinity])('rejects %s', (v) => {
      expect(validateSettings(withSettings({ intensity: v })).intensity).toMatch(/10 and 100/);
    });
  });

  describe('rate', () => {
    it.each([0.25, 0.5, 1, 2.75, 3])('accepts %s', (v) => {
      expect(validateSettings(withSettings({ rate: v }))).toEqual({});
    });
    it.each([0.24, 0, 3.01, 3.25, 1.1, NaN, Infinity])('rejects %s', (v) => {
      expect(validateSettings(withSettings({ rate: v })).rate).toMatch(/0\.25 and 3/);
    });
  });

  describe('idleColor', () => {
    it('accepts #rrggbb', () => {
      expect(validateSettings(withSettings({ idleColor: '#000000' }))).toEqual({});
      expect(validateSettings(withSettings({ idleColor: '#ABCDEF' }))).toEqual({});
    });
    it.each(['', '#fff', 'blue', '#gggggg'])('rejects %j', (c) => {
      expect(validateSettings(withSettings({ idleColor: c })).idleColor).toBeDefined();
    });
  });

  it('reports every invalid field at once', () => {
    const errors = validateSettings(
      withSettings({
        interval: { value: 0, unit: 'seconds' },
        flashDurationSeconds: 0,
        colors: [],
        intensity: 0,
        rate: 0,
        idleColor: 'x',
      }),
    );
    expect(Object.keys(errors).sort()).toEqual(
      ['colors', 'flashDurationSeconds', 'idleColor', 'intensity', 'interval', 'rate'].sort(),
    );
  });
});

describe('sanitizeSettings', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'nope'],
    ['a number', 42],
    ['an array', [1, 2, 3]],
    ['an empty object', {}],
  ])('returns defaults for %s', (_, raw) => {
    expect(sanitizeSettings(raw)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns a fresh copy, not shared default references', () => {
    const out = sanitizeSettings(null);
    expect(out).not.toBe(DEFAULT_SETTINGS);
    expect(out.colors).not.toBe(DEFAULT_SETTINGS.colors);
    expect(out.interval).not.toBe(DEFAULT_SETTINGS.interval);
  });

  it('keeps valid fields from a partial object and defaults the rest', () => {
    const out = sanitizeSettings({ intensity: 80, alwaysOnTop: true, style: 'blink' });
    expect(out).toEqual({ ...DEFAULT_SETTINGS, intensity: 80, alwaysOnTop: true, style: 'blink' });
  });

  it('keeps a fully valid object', () => {
    const full: Settings = {
      interval: { value: 30, unit: 'seconds' },
      flashDurationSeconds: 5,
      colors: ['#112233', '#aabbcc'],
      style: 'blink',
      intensity: 90,
      rate: 2.5,
      idleColor: '#000000',
      alwaysOnTop: true,
      borderless: true,
      fullscreen: true,
      globalShortcut: 'CommandOrControl+Alt+Space',
    };
    expect(sanitizeSettings(full)).toEqual(full);
  });

  it('falls back field by field on wrong types', () => {
    const out = sanitizeSettings({
      interval: 'ten',
      flashDurationSeconds: '2',
      colors: 'red',
      style: 3,
      intensity: '60',
      rate: null,
      idleColor: 5,
      alwaysOnTop: 'yes',
      borderless: 1,
      fullscreen: 'true',
      globalShortcut: 7,
    });
    expect(out).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps each offered global shortcut', () => {
    for (const globalShortcut of GLOBAL_SHORTCUTS) {
      expect(sanitizeSettings({ globalShortcut }).globalShortcut).toBe(globalShortcut);
    }
  });

  it('sanitizes invalid global shortcuts to null', () => {
    for (const globalShortcut of [
      'CommandOrControl+Alt+X',
      'commandorcontrol+alt+b',
      'Ctrl+Alt+B',
      '',
      ' ',
      false,
      42,
      {},
      ['CommandOrControl+Alt+B'],
      undefined,
    ]) {
      expect(sanitizeSettings({ globalShortcut }).globalShortcut).toBeNull();
    }
  });

  it('sanitizes borderless and fullscreen independently', () => {
    expect(sanitizeSettings({ borderless: true, fullscreen: 'no' })).toEqual({
      ...DEFAULT_SETTINGS,
      borderless: true,
    });
    expect(sanitizeSettings({ borderless: null, fullscreen: true })).toEqual({
      ...DEFAULT_SETTINGS,
      fullscreen: true,
    });
    expect(sanitizeSettings({ intensity: 80 })).toMatchObject({
      borderless: false,
      fullscreen: false,
    });
  });

  it('falls back on a malformed interval', () => {
    expect(sanitizeSettings({ interval: { value: 5, unit: 'days' } }).interval).toEqual(
      DEFAULT_SETTINGS.interval,
    );
    expect(sanitizeSettings({ interval: { value: '5', unit: 'minutes' } }).interval).toEqual(
      DEFAULT_SETTINGS.interval,
    );
    expect(sanitizeSettings({ interval: null }).interval).toEqual(DEFAULT_SETTINGS.interval);
  });

  it('falls back on NaN and Infinity', () => {
    const out = sanitizeSettings({
      interval: { value: NaN, unit: 'seconds' },
      flashDurationSeconds: Infinity,
      intensity: NaN,
      rate: -Infinity,
    });
    expect(out).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ interval: { value: Infinity, unit: 'hours' } }).interval).toEqual(
      DEFAULT_SETTINGS.interval,
    );
  });

  it('falls back on out-of-range numbers instead of clamping', () => {
    const out = sanitizeSettings({
      interval: { value: 100, unit: 'hours' },
      flashDurationSeconds: 31,
      intensity: 150,
      rate: 5,
    });
    expect(out).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ intensity: 9 }).intensity).toBe(DEFAULT_SETTINGS.intensity);
    expect(sanitizeSettings({ intensity: 70.5 }).intensity).toBe(DEFAULT_SETTINGS.intensity);
    expect(sanitizeSettings({ rate: 1.1 }).rate).toBe(DEFAULT_SETTINGS.rate);
  });

  it('accepts the bound values', () => {
    expect(
      sanitizeSettings({
        interval: { value: 24, unit: 'hours' },
        flashDurationSeconds: 0.5,
        intensity: 10,
        rate: 0.25,
      }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      interval: { value: 24, unit: 'hours' },
      flashDurationSeconds: 0.5,
      intensity: 10,
      rate: 0.25,
    });
  });

  it('normalizes colors to lowercase and drops bad entries', () => {
    const out = sanitizeSettings({
      colors: ['#FFB547', 'red', '#12345', 7, null, '#AbCdEf'],
      idleColor: '#1B1E25',
    });
    expect(out.colors).toEqual(['#ffb547', '#abcdef']);
    expect(out.idleColor).toBe('#1b1e25');
  });

  it('falls back to the default colors when none survive', () => {
    expect(sanitizeSettings({ colors: ['red', 'blue'] }).colors).toEqual(DEFAULT_SETTINGS.colors);
    expect(sanitizeSettings({ colors: [] }).colors).toEqual(DEFAULT_SETTINGS.colors);
  });

  it('truncates 7 colors to 6', () => {
    const seven = ['#000001', '#000002', '#000003', '#000004', '#000005', '#000006', '#000007'];
    expect(sanitizeSettings({ colors: seven }).colors).toEqual(seven.slice(0, 6));
  });

  it('truncates after dropping bad entries', () => {
    const colors = [
      'bad',
      '#000001',
      '#000002',
      '#000003',
      '#000004',
      '#000005',
      '#000006',
      '#000007',
    ];
    expect(sanitizeSettings({ colors }).colors).toEqual(colors.slice(1, 7));
  });

  it('drops unknown keys', () => {
    const out = sanitizeSettings({
      intensity: 80,
      volume: 11,
      __proto__: { evil: true },
      extra: {},
    });
    expect(Object.keys(out).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
    expect(out).not.toHaveProperty('volume');
    expect(out).not.toHaveProperty('extra');
    expect(out.intensity).toBe(80);
  });

  it('never throws on hostile input', () => {
    const hostile = {
      get interval(): never {
        throw new Error('boom');
      },
    };
    expect(() => sanitizeSettings(hostile)).not.toThrow();
    expect(sanitizeSettings(hostile)).toEqual(DEFAULT_SETTINGS);
  });

  it('produces output that always validates', () => {
    const inputs = [
      null,
      'x',
      [],
      { intensity: 1e9, colors: 'a', rate: NaN },
      { colors: ['#FFF'] },
    ];
    for (const raw of inputs) expect(validateSettings(sanitizeSettings(raw))).toEqual({});
  });
});

describe('isStrongFlash', () => {
  it('flags rates above 2 only', () => {
    expect(isStrongFlash({ style: 'pulse', intensity: 60, rate: 2 })).toBe(false);
    expect(isStrongFlash({ style: 'pulse', intensity: 60, rate: 2.25 })).toBe(true);
    expect(isStrongFlash({ style: 'pulse', intensity: 100, rate: 3 })).toBe(true);
  });

  it('flags blink above 70 percent only', () => {
    expect(isStrongFlash({ style: 'blink', intensity: 70, rate: 1 })).toBe(false);
    expect(isStrongFlash({ style: 'blink', intensity: 71, rate: 1 })).toBe(true);
    expect(isStrongFlash({ style: 'blink', intensity: 100, rate: 1 })).toBe(true);
  });

  it('does not flag pulse intensity alone', () => {
    expect(isStrongFlash({ style: 'pulse', intensity: 100, rate: 1 })).toBe(false);
  });

  it('does not flag the defaults', () => {
    expect(isStrongFlash(DEFAULT_SETTINGS)).toBe(false);
  });
});
