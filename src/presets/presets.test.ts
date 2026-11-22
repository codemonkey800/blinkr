import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings/model';
import {
  applyPresetValues,
  MAX_NAME_LENGTH,
  MAX_PRESETS,
  presetLimitReason,
  presetValuesFrom,
  samePresetValues,
  sanitizePresets,
  validatePresetName,
  type Preset,
} from './presets';

const values = presetValuesFrom({
  ...DEFAULT_SETTINGS,
  interval: { value: 5, unit: 'seconds' },
  colors: ['#ff0000', '#00ff00'],
  style: 'blink',
});

const preset = (id: string, name: string): Preset => ({ id, name, values });

describe('presetValuesFrom and applyPresetValues', () => {
  it('copies only timing and look fields', () => {
    const settings = { ...DEFAULT_SETTINGS, alwaysOnTop: true, globalShortcut: null };
    const picked = presetValuesFrom(settings);
    expect(Object.keys(picked).sort()).toEqual([
      'colors',
      'flashDurationSeconds',
      'idleColor',
      'intensity',
      'interval',
      'rate',
      'style',
    ]);
    expect(picked.colors).not.toBe(settings.colors);
  });

  it('keeps window fields when applying', () => {
    const current = { ...DEFAULT_SETTINGS, alwaysOnTop: true, borderless: true };
    expect(applyPresetValues(current, values)).toEqual({ ...current, ...values });
    expect(applyPresetValues(current, values).alwaysOnTop).toBe(true);
  });

  it('compares values field by field', () => {
    expect(samePresetValues(values, presetValuesFrom({ ...DEFAULT_SETTINGS, ...values }))).toBe(
      true,
    );
    expect(samePresetValues(values, { ...values, colors: ['#ff0000'] })).toBe(false);
    expect(samePresetValues(values, { ...values, interval: { value: 5, unit: 'minutes' } })).toBe(
      false,
    );
    expect(samePresetValues(values, { ...values, rate: 2 })).toBe(false);
  });
});

describe('validatePresetName', () => {
  it('accepts 1 to 40 characters once trimmed', () => {
    expect(validatePresetName('a', [])).toBeNull();
    expect(validatePresetName('  Desk break  ', [])).toBeNull();
    expect(validatePresetName('x'.repeat(MAX_NAME_LENGTH), [])).toBeNull();
  });

  it('rejects empty, blank, and over-long names', () => {
    expect(validatePresetName('', [])).toMatch(/enter a name/i);
    expect(validatePresetName('   ', [])).toMatch(/enter a name/i);
    expect(validatePresetName('x'.repeat(MAX_NAME_LENGTH + 1), [])).toMatch(/40 characters/);
    // Padding does not count toward the length.
    expect(validatePresetName(` ${'x'.repeat(MAX_NAME_LENGTH)} `, [])).toBeNull();
  });

  it('counts characters, not UTF-16 units', () => {
    expect(validatePresetName('😀'.repeat(MAX_NAME_LENGTH), [])).toBeNull();
    expect(validatePresetName('😀'.repeat(MAX_NAME_LENGTH + 1), [])).not.toBeNull();
  });

  it('rejects a duplicate without regard to case or padding', () => {
    const list = [preset('1', 'Desk break')];
    expect(validatePresetName('desk BREAK', list)).toMatch(/already exists/);
    expect(validatePresetName('  Desk break ', list)).toMatch(/already exists/);
    expect(validatePresetName('Desk', list)).toBeNull();
  });

  it('lets a preset keep its own name when renamed', () => {
    const list = [preset('1', 'Desk break'), preset('2', 'Walk')];
    expect(validatePresetName('DESK BREAK', list, '1')).toBeNull();
    expect(validatePresetName('walk', list, '1')).toMatch(/already exists/);
  });
});

describe('presetLimitReason', () => {
  it('only gives a reason at the limit', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => preset(`${i}`, `P${i}`));
    expect(presetLimitReason(many(MAX_PRESETS - 1))).toBeNull();
    expect(presetLimitReason(many(MAX_PRESETS))).toMatch(/up to 20 presets/);
  });
});

describe('sanitizePresets', () => {
  it('returns none for anything that is not an array', () => {
    for (const raw of [undefined, null, 5, 'presets', true, {}, { 0: preset('1', 'A') }]) {
      expect(sanitizePresets(raw)).toEqual([]);
    }
  });

  it('keeps valid presets and trims names', () => {
    expect(sanitizePresets([preset('1', ' Desk '), preset('2', 'Walk')])).toEqual([
      preset('1', 'Desk'),
      preset('2', 'Walk'),
    ]);
  });

  it('drops entries that are not usable', () => {
    const hostile = {
      get id(): string {
        throw new Error('no');
      },
      name: 'Hostile',
      values,
    };
    const raw = [
      null,
      7,
      'x',
      [],
      {},
      { id: '', name: 'No id', values },
      { id: 3, name: 'Numeric id', values },
      { id: 'a', name: '', values },
      { id: 'b', name: '   ', values },
      { id: 'c', name: 42, values },
      { id: 'd', name: 'x'.repeat(41), values },
      { id: 'e', name: 'No values' },
      { id: 'f', name: 'Null values', values: null },
      { id: 'g', name: 'Array values', values: [] },
      { id: 'h', name: 'String values', values: 'oops' },
      hostile,
      { id: 'ok', name: 'Kept', values },
    ];
    expect(sanitizePresets(raw)).toEqual([preset('ok', 'Kept')]);
  });

  it('drops a repeated id or a name that repeats another without regard to case', () => {
    const raw = [
      preset('1', 'Desk'),
      preset('1', 'Other'),
      preset('2', 'DESK'),
      preset('3', 'Walk'),
    ];
    expect(sanitizePresets(raw).map((p) => p.id)).toEqual(['1', '3']);
  });

  it('repairs values through the settings rules and drops unknown and window fields', () => {
    const [clean] = sanitizePresets([
      {
        id: '1',
        name: 'Messy',
        values: {
          interval: { value: -4, unit: 'fortnights' },
          flashDurationSeconds: 'long',
          colors: ['#FF0000', 'red', 7],
          style: 'blink',
          intensity: 500,
          alwaysOnTop: true,
          fullscreen: true,
          mystery: 1,
        },
      },
    ]);
    expect(clean?.values).toEqual({
      interval: DEFAULT_SETTINGS.interval,
      flashDurationSeconds: DEFAULT_SETTINGS.flashDurationSeconds,
      colors: ['#ff0000'],
      style: 'blink',
      intensity: DEFAULT_SETTINGS.intensity,
      rate: DEFAULT_SETTINGS.rate,
      idleColor: DEFAULT_SETTINGS.idleColor,
    });
    expect(clean).not.toHaveProperty('mystery');
    expect(clean?.values).not.toHaveProperty('alwaysOnTop');
  });

  it('keeps at most 20 presets', () => {
    const raw = Array.from({ length: MAX_PRESETS + 5 }, (_, i) => preset(`${i}`, `Preset ${i}`));
    const result = sanitizePresets(raw);
    expect(result).toHaveLength(MAX_PRESETS);
    expect(result[MAX_PRESETS - 1]?.id).toBe(`${MAX_PRESETS - 1}`);
  });
});
