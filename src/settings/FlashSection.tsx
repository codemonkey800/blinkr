import { useId, type CSSProperties } from 'react';
import { WarnIcon } from './icons';
import { isStrongFlash, LIMITS, type FlashStyle, type Settings } from './model';

/** The mockup's intensity slider moves in steps of 5 percent. */
export const INTENSITY_STEP = 5;

/** Above this rate the warning turns stronger. */
export const STRONG_RATE = 2;
/** A hard blink above this intensity turns the warning stronger. */
export const STRONG_BLINK_INTENSITY = 70;

export type FlashFields = Pick<Settings, 'style' | 'intensity' | 'rate'>;

export interface FlashWarning {
  strong: boolean;
  title?: string;
  body: string;
}

const CALM_COPY =
  'Flashing can trigger seizures in people with photosensitive epilepsy. Stop if anyone feels unwell.';

/** Copy for each warning state, from the approved mockup. */
export function flashWarning(fields: FlashFields): FlashWarning {
  if (!isStrongFlash(fields)) return { strong: false, body: CALM_COPY };
  const fast = fields.rate > STRONG_RATE;
  const hard = fields.style === 'blink' && fields.intensity > STRONG_BLINK_INTENSITY;
  let body: string;
  if (fast && hard) {
    body =
      'Fast, hard blinking is more likely to trigger seizures. Lower the rate and intensity, or switch to a smooth pulse.';
  } else if (fast) {
    body = 'Rates above 2 per second are more likely to trigger seizures. Lower the rate.';
  } else {
    body =
      'Hard blinks above 70% are more likely to trigger seizures. Lower the intensity or switch to a smooth pulse.';
  }
  return { strong: true, title: 'Strong flashing', body };
}

export function formatRate(rate: number): string {
  return `${+rate.toFixed(2)} per second`;
}

const STYLE_OPTIONS: { value: FlashStyle; label: string }[] = [
  { value: 'pulse', label: 'Smooth pulse' },
  { value: 'blink', label: 'Hard blink' },
];

function fillPercent(value: number, min: number, max: number): string {
  return `${((value - min) / (max - min)) * 100}%`;
}

export interface FlashSectionProps {
  settings: FlashFields;
  onChange(patch: Partial<FlashFields>): void;
}

/** Style, intensity, rate, and the photosensitivity warning beside them. */
export function FlashSection({ settings, onChange }: FlashSectionProps) {
  const ids = useId();
  const warning = flashWarning(settings);
  const warnId = `${ids}-warn`;

  return (
    <>
      <div className="field">
        <div className="lab" id={`${ids}-style`}>
          Style
        </div>
        <div className="seg" role="radiogroup" aria-labelledby={`${ids}-style`}>
          {STYLE_OPTIONS.map(({ value, label }) => (
            <label key={value}>
              <input
                type="radio"
                name={`${ids}-style`}
                value={value}
                checked={settings.style === value}
                onChange={() => onChange({ style: value })}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="field">
        <div className="lab">
          <label htmlFor={`${ids}-intensity`}>Intensity</label>
          <output htmlFor={`${ids}-intensity`}>{settings.intensity}%</output>
        </div>
        <input
          id={`${ids}-intensity`}
          type="range"
          min={LIMITS.INTENSITY_MIN}
          max={LIMITS.INTENSITY_MAX}
          step={INTENSITY_STEP}
          value={settings.intensity}
          aria-valuetext={`${settings.intensity}%`}
          aria-describedby={warnId}
          style={
            {
              '--fill': fillPercent(settings.intensity, LIMITS.INTENSITY_MIN, LIMITS.INTENSITY_MAX),
            } as CSSProperties
          }
          onChange={(event) => onChange({ intensity: Number(event.target.value) })}
        />
        <p className="help">Peak brightness of the flash over the idle color.</p>
        <div
          className={warning.strong ? 'note hot' : 'note'}
          id={warnId}
          role="note"
          data-strong={warning.strong}
        >
          <WarnIcon />
          <div>
            {warning.title ? <strong>{warning.title}</strong> : null}
            {warning.body}
          </div>
        </div>
      </div>
      <div className="field">
        <div className="lab">
          <label htmlFor={`${ids}-rate`}>Rate</label>
          <output htmlFor={`${ids}-rate`}>{formatRate(settings.rate)}</output>
        </div>
        <input
          id={`${ids}-rate`}
          type="range"
          min={LIMITS.RATE_MIN}
          max={LIMITS.RATE_MAX}
          step={LIMITS.RATE_STEP}
          value={settings.rate}
          aria-valuetext={formatRate(settings.rate)}
          aria-describedby={warnId}
          style={
            {
              '--fill': fillPercent(settings.rate, LIMITS.RATE_MIN, LIMITS.RATE_MAX),
            } as CSSProperties
          }
          onChange={(event) => onChange({ rate: Number(event.target.value) })}
        />
        <p className="help">Pulses or blinks per second during a flash.</p>
      </div>
    </>
  );
}
