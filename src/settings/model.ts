export type IntervalUnit = 'seconds' | 'minutes' | 'hours';
export type FlashStyle = 'pulse' | 'blink';

/** The accelerators offered for the global start and stop shortcut. */
export const GLOBAL_SHORTCUTS = [
  'CommandOrControl+Alt+B',
  'CommandOrControl+Shift+B',
  'CommandOrControl+Alt+Space',
] as const;
export type GlobalShortcut = (typeof GLOBAL_SHORTCUTS)[number];

export interface Settings {
  interval: { value: number; unit: IntervalUnit }; // total 1 s .. 24 h
  flashDurationSeconds: number; // 0.5 .. 30
  colors: string[]; // 1 .. 6 entries, lowercase '#rrggbb'
  style: FlashStyle;
  intensity: number; // percent, integer 10 .. 100
  rate: number; // flashes per second, 0.25 .. 3, step 0.25
  idleColor: string; // '#rrggbb'
  alwaysOnTop: boolean;
  borderless: boolean; // no title bar or frame
  fullscreen: boolean;
  globalShortcut: GlobalShortcut | null; // null is off
}

export const DEFAULT_SETTINGS: Settings = {
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
};

export const LIMITS = {
  INTERVAL_MIN_MS: 1_000,
  INTERVAL_MAX_MS: 24 * 60 * 60 * 1_000,
  FLASH_DURATION_MIN: 0.5,
  FLASH_DURATION_MAX: 30,
  MIN_COLORS: 1,
  MAX_COLORS: 6,
  INTENSITY_MIN: 10,
  INTENSITY_MAX: 100,
  RATE_MIN: 0.25,
  RATE_MAX: 3,
  RATE_STEP: 0.25,
} as const;

const UNIT_MS: Record<IntervalUnit, number> = {
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
};

const UNITS: readonly IntervalUnit[] = ['seconds', 'minutes', 'hours'];
const STYLES: readonly FlashStyle[] = ['pulse', 'blink'];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function intervalMs(i: Settings['interval']): number {
  return i.value * UNIT_MS[i.unit];
}

export type FieldErrors = Partial<
  Record<
    'interval' | 'flashDurationSeconds' | 'colors' | 'intensity' | 'rate' | 'idleColor',
    string
  >
>;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_COLOR.test(v);
}

function isValidInterval(v: unknown): v is Settings['interval'] {
  if (typeof v !== 'object' || v === null) return false;
  const { value, unit } = v as Record<string, unknown>;
  if (!isFiniteNumber(value) || !UNITS.includes(unit as IntervalUnit)) return false;
  const ms = intervalMs({ value, unit: unit as IntervalUnit });
  return ms >= LIMITS.INTERVAL_MIN_MS && ms <= LIMITS.INTERVAL_MAX_MS;
}

function isValidFlashDuration(v: unknown): v is number {
  return isFiniteNumber(v) && v >= LIMITS.FLASH_DURATION_MIN && v <= LIMITS.FLASH_DURATION_MAX;
}

function isValidIntensity(v: unknown): v is number {
  return (
    isFiniteNumber(v) &&
    Number.isInteger(v) &&
    v >= LIMITS.INTENSITY_MIN &&
    v <= LIMITS.INTENSITY_MAX
  );
}

function isValidRate(v: unknown): v is number {
  return (
    isFiniteNumber(v) &&
    v >= LIMITS.RATE_MIN &&
    v <= LIMITS.RATE_MAX &&
    Number.isInteger(v / LIMITS.RATE_STEP)
  );
}

export function isGlobalShortcut(v: unknown): v is GlobalShortcut {
  return GLOBAL_SHORTCUTS.includes(v as GlobalShortcut);
}

export function validateSettings(s: Settings): FieldErrors {
  const errors: FieldErrors = {};
  if (!isValidInterval(s.interval)) {
    errors.interval = 'Interval must be between 1 second and 24 hours.';
  }
  if (!isValidFlashDuration(s.flashDurationSeconds)) {
    errors.flashDurationSeconds = 'Flash duration must be between 0.5 and 30 seconds.';
  }
  if (
    !Array.isArray(s.colors) ||
    s.colors.length < LIMITS.MIN_COLORS ||
    s.colors.length > LIMITS.MAX_COLORS ||
    !s.colors.every(isHexColor)
  ) {
    errors.colors = `Choose between 1 and ${LIMITS.MAX_COLORS} colors.`;
  }
  if (!isValidIntensity(s.intensity)) {
    errors.intensity = 'Enter a whole number between 10 and 100 percent.';
  }
  if (!isValidRate(s.rate)) {
    errors.rate = 'Enter a rate between 0.25 and 3 flashes per second, in steps of 0.25.';
  }
  if (!isHexColor(s.idleColor)) {
    errors.idleColor = 'Choose a valid color.';
  }
  return errors;
}

export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  const source: Record<string, unknown> =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  // Snapshot known keys; hostile getters must not make sanitizing throw.
  const obj: Record<string, unknown> = {};
  for (const key of Object.keys(d)) {
    try {
      obj[key] = source[key];
    } catch {
      obj[key] = undefined;
    }
  }

  let interval: Settings['interval'] = { ...d.interval };
  if (isValidInterval(obj.interval)) {
    interval = { value: obj.interval.value, unit: obj.interval.unit };
  }

  let colors = [...d.colors];
  if (Array.isArray(obj.colors)) {
    const cleaned = obj.colors
      .filter(isHexColor)
      .map((c) => c.toLowerCase())
      .slice(0, LIMITS.MAX_COLORS);
    if (cleaned.length >= LIMITS.MIN_COLORS) colors = cleaned;
  }

  return {
    interval,
    flashDurationSeconds: isValidFlashDuration(obj.flashDurationSeconds)
      ? obj.flashDurationSeconds
      : d.flashDurationSeconds,
    colors,
    style: STYLES.includes(obj.style as FlashStyle) ? (obj.style as FlashStyle) : d.style,
    intensity: isValidIntensity(obj.intensity) ? obj.intensity : d.intensity,
    rate: isValidRate(obj.rate) ? obj.rate : d.rate,
    idleColor: isHexColor(obj.idleColor) ? obj.idleColor.toLowerCase() : d.idleColor,
    alwaysOnTop: typeof obj.alwaysOnTop === 'boolean' ? obj.alwaysOnTop : d.alwaysOnTop,
    borderless: typeof obj.borderless === 'boolean' ? obj.borderless : d.borderless,
    fullscreen: typeof obj.fullscreen === 'boolean' ? obj.fullscreen : d.fullscreen,
    globalShortcut: isGlobalShortcut(obj.globalShortcut) ? obj.globalShortcut : d.globalShortcut,
  };
}

export function isStrongFlash(s: Pick<Settings, 'style' | 'intensity' | 'rate'>): boolean {
  return s.rate > 2 || (s.style === 'blink' && s.intensity > 70);
}
