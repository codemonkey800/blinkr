import { sanitizeSettings, type Settings } from '../settings/model';

/** The timing and look fields of `Settings`. Window fields stay global. */
export const PRESET_KEYS = [
  'interval',
  'flashDurationSeconds',
  'colors',
  'style',
  'intensity',
  'rate',
  'idleColor',
] as const satisfies readonly (keyof Settings)[];

export type PresetValues = Pick<Settings, (typeof PRESET_KEYS)[number]>;

export interface Preset {
  id: string;
  name: string;
  values: PresetValues;
}

export const MAX_PRESETS = 20;
export const MAX_NAME_LENGTH = 40;

export function presetValuesFrom(settings: Settings): PresetValues {
  return {
    interval: { ...settings.interval },
    flashDurationSeconds: settings.flashDurationSeconds,
    colors: [...settings.colors],
    style: settings.style,
    intensity: settings.intensity,
    rate: settings.rate,
    idleColor: settings.idleColor,
  };
}

/** `settings` with the preset's values on top. Window fields are kept. */
export function applyPresetValues(settings: Settings, values: PresetValues): Settings {
  return { ...settings, ...presetValuesFrom({ ...settings, ...values }) };
}

export function samePresetValues(a: PresetValues, b: PresetValues): boolean {
  return (
    a.interval.value === b.interval.value &&
    a.interval.unit === b.interval.unit &&
    a.flashDurationSeconds === b.flashDurationSeconds &&
    a.colors.length === b.colors.length &&
    a.colors.every((color, i) => color === b.colors[i]) &&
    a.style === b.style &&
    a.intensity === b.intensity &&
    a.rate === b.rate &&
    a.idleColor === b.idleColor
  );
}

export function presetNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Why `name` can't be used, or null when it can. A name is 1 to 40 characters once trimmed,
 * and unique without regard to case. `exceptId` is the preset being renamed.
 */
export function validatePresetName(
  name: string,
  presets: readonly Preset[],
  exceptId?: string,
): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Enter a name.';
  if (Array.from(trimmed).length > MAX_NAME_LENGTH) {
    return `Names can be up to ${MAX_NAME_LENGTH} characters.`;
  }
  const key = presetNameKey(trimmed);
  if (presets.some((p) => p.id !== exceptId && presetNameKey(p.name) === key)) {
    return 'A preset with this name already exists.';
  }
  return null;
}

/** Why another preset can't be saved, or null when there is room. */
export function presetLimitReason(presets: readonly Preset[]): string | null {
  return presets.length >= MAX_PRESETS
    ? `You can save up to ${MAX_PRESETS} presets. Delete one to save another.`
    : null;
}

function read(source: object, key: string): unknown {
  try {
    return (source as Record<string, unknown>)[key];
  } catch {
    // A hostile getter must not make sanitizing throw.
    return undefined;
  }
}

/**
 * Stored presets, cleaned up. Entries with a bad id or name, a duplicate id or name, or values
 * that aren't an object are dropped, as is anything past the limit. Values go through
 * `sanitizeSettings`, so a missing or invalid field takes its default.
 */
export function sanitizePresets(raw: unknown): Preset[] {
  if (!Array.isArray(raw)) return [];
  const presets: Preset[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < raw.length && presets.length < MAX_PRESETS; i += 1) {
    const entry: unknown = raw[i];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const id = read(entry, 'id');
    const name = read(entry, 'name');
    const values = read(entry, 'values');
    if (typeof id !== 'string' || id === '' || ids.has(id)) continue;
    if (typeof name !== 'string' || validatePresetName(name, presets) !== null) continue;
    if (typeof values !== 'object' || values === null || Array.isArray(values)) continue;
    ids.add(id);
    presets.push({ id, name: name.trim(), values: presetValuesFrom(sanitizeSettings(values)) });
  }
  return presets;
}
