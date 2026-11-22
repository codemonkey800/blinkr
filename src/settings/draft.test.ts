import { describe, expect, it } from 'vitest';
import { applyDraft, draftFromSettings, sameSettings } from './draft';
import { DEFAULT_SETTINGS } from './model';

const base = DEFAULT_SETTINGS;

describe('applyDraft', () => {
  it('round-trips unchanged settings with no errors', () => {
    const { settings, errors } = applyDraft(base, draftFromSettings(base));
    expect(errors).toEqual({});
    expect(sameSettings(settings, base)).toBe(true);
  });

  it('merges valid edits', () => {
    const draft = {
      ...draftFromSettings(base),
      intervalValue: '1.5',
      intervalUnit: 'hours',
    } as const;
    const { settings, errors } = applyDraft(base, draft);
    expect(errors).toEqual({});
    expect(settings.interval).toEqual({ value: 1.5, unit: 'hours' });
  });

  it.each(['', '  ', 'abc', '0', '-5', '86401'])('rejects interval text %j', (text) => {
    const draft = {
      ...draftFromSettings(base),
      intervalValue: text,
      intervalUnit: 'seconds',
    } as const;
    const { settings, errors } = applyDraft(base, draft);
    expect(errors.interval).toBe('Interval must be between 1 second and 24 hours.');
    expect(settings.interval).toEqual(base.interval);
  });

  it.each(['', '0.4', '31', 'x'])('rejects duration text %j', (text) => {
    const { settings, errors } = applyDraft(base, { ...draftFromSettings(base), duration: text });
    expect(errors.flashDurationSeconds).toBe('Flash duration must be between 0.5 and 30 seconds.');
    expect(settings.flashDurationSeconds).toBe(base.flashDurationSeconds);
  });

  it('keeps valid fields when another field is invalid', () => {
    const draft = { ...draftFromSettings(base), intervalValue: '0', duration: '5' };
    const { settings, errors } = applyDraft(base, draft);
    expect(Object.keys(errors)).toEqual(['interval']);
    expect(settings.flashDurationSeconds).toBe(5);
    expect(settings.interval).toEqual(base.interval);
  });

  it('rejects an out-of-range color list and keeps the previous colors', () => {
    const { settings, errors } = applyDraft(base, { ...draftFromSettings(base), colors: [] });
    expect(errors.colors).toBeDefined();
    expect(settings.colors).toEqual(base.colors);
  });
});
