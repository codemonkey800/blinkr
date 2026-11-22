import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../settings/model';

export interface InitialState {
  settings: Settings;
  autostart: boolean;
  /**
   * True when URL params set the state. The app then skips stored settings, so a stale
   * saved value can't undo the params, and writes nothing back.
   */
  overridden?: boolean;
}

const OVERRIDE_PARAMS = [
  'interval',
  'duration',
  'intensity',
  'rate',
  'style',
  'colors',
  'idle',
  'autostart',
];

function freshDefaults(): InitialState {
  return { settings: sanitizeSettings(DEFAULT_SETTINGS), autostart: false };
}

function numberParam(params: URLSearchParams, name: string): number | undefined {
  const raw = params.get(name);
  if (raw === null || raw.trim() === '') return undefined;
  return Number(raw);
}

/** Hex colors come without `#` because a bare `#` in a URL starts the fragment. */
function hexParam(raw: string): string {
  const value = raw.trim();
  return value.startsWith('#') ? value : `#${value}`;
}

/**
 * Settings and autostart from URL params, for visual checks and browser tests.
 * Every value goes through `sanitizeSettings`, so a bad one falls back to its default.
 * Returns plain defaults unless `enabled`, which production builds never set.
 */
export function readInitialState(search: string, enabled: boolean): InitialState {
  if (!enabled) return freshDefaults();

  const params = new URLSearchParams(search);
  const raw: Record<string, unknown> = { ...DEFAULT_SETTINGS };

  const interval = numberParam(params, 'interval');
  if (interval !== undefined) raw.interval = { value: interval, unit: 'seconds' };

  const duration = numberParam(params, 'duration');
  if (duration !== undefined) raw.flashDurationSeconds = duration;

  const intensity = numberParam(params, 'intensity');
  if (intensity !== undefined) raw.intensity = intensity;

  const rate = numberParam(params, 'rate');
  if (rate !== undefined) raw.rate = rate;

  const style = params.get('style');
  if (style !== null) raw.style = style;

  const colors = params.get('colors');
  if (colors !== null) raw.colors = colors.split(',').map(hexParam);

  const idle = params.get('idle');
  if (idle !== null) raw.idleColor = hexParam(idle);

  return {
    settings: sanitizeSettings(raw),
    autostart: params.get('autostart') === '1',
    ...(OVERRIDE_PARAMS.some((name) => params.has(name)) ? { overridden: true } : {}),
  };
}
