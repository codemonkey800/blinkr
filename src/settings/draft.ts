import { validateSettings, type FieldErrors, type IntervalUnit, type Settings } from './model';

/** What the panel's fields hold while the user types. Text stays text until it is valid. */
export interface SettingsDraft {
  intervalValue: string;
  intervalUnit: IntervalUnit;
  duration: string;
  colors: string[];
  idleColor: string;
}

export function draftFromSettings(settings: Settings): SettingsDraft {
  return {
    intervalValue: String(settings.interval.value),
    intervalUnit: settings.interval.unit,
    duration: String(settings.flashDurationSeconds),
    colors: [...settings.colors],
    idleColor: settings.idleColor,
  };
}

/** Empty or non-numeric text is NaN, which validation rejects. */
function parseNumber(text: string): number {
  return text.trim() === '' ? NaN : Number(text);
}

/**
 * Merge a draft into `base`. Invalid fields keep their last valid value, so only valid
 * values ever reach settings and storage. `errors` describes the draft as typed.
 */
export function applyDraft(
  base: Settings,
  draft: SettingsDraft,
): { settings: Settings; errors: FieldErrors } {
  const candidate: Settings = {
    ...base,
    interval: { value: parseNumber(draft.intervalValue), unit: draft.intervalUnit },
    flashDurationSeconds: parseNumber(draft.duration),
    colors: draft.colors,
    idleColor: draft.idleColor,
  };
  const errors = validateSettings(candidate);
  const settings: Settings = {
    ...base,
    interval: errors.interval ? base.interval : candidate.interval,
    flashDurationSeconds: errors.flashDurationSeconds
      ? base.flashDurationSeconds
      : candidate.flashDurationSeconds,
    colors: errors.colors ? base.colors : candidate.colors,
    idleColor: errors.idleColor ? base.idleColor : candidate.idleColor,
  };
  return { settings, errors };
}

export function sameSettings(a: Settings, b: Settings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
