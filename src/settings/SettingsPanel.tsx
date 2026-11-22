import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { applyPresetValues } from '../presets/presets';
import { applyDraft, draftFromSettings, sameSettings, type SettingsDraft } from './draft';
import { FlashSection } from './FlashSection';
import { PlusIcon, WarnIcon, XIcon } from './icons';
import { PresetPicker, type PresetControls } from './PresetPicker';
import {
  GLOBAL_SHORTCUTS,
  isGlobalShortcut,
  LIMITS,
  type GlobalShortcut,
  type IntervalUnit,
  type Settings,
} from './model';
import './settings.css';

/** Next colors offered by the add button, in order. */
const PALETTE = ['#ffb547', '#46c2cb', '#ff6f91', '#8f86ff', '#8bd35c', '#f2f2f2'];

const SHORTCUT_LABELS: Record<GlobalShortcut, string> = {
  'CommandOrControl+Alt+B': 'Cmd/Ctrl+Alt+B',
  'CommandOrControl+Shift+B': 'Cmd/Ctrl+Shift+B',
  'CommandOrControl+Alt+Space': 'Cmd/Ctrl+Alt+Space',
};

const UNITS: IntervalUnit[] = ['seconds', 'minutes', 'hours'];

/** The CSS animation that slides the panel out. Only its completion removes the panel. */
const EXIT_ANIMATION = 'panel-out';

/** Removes a closing panel if its animation never reports completion. The slide itself takes 0.22 s. */
export const EXIT_FALLBACK_MS = 500;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function nextColor(used: string[]): string {
  return PALETTE.find((color) => !used.includes(color)) ?? '#ffffff';
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p className="err" id={id}>
      <WarnIcon />
      <span>{message}</span>
    </p>
  );
}

export interface SettingsPanelProps {
  settings: Settings;
  running: boolean;
  /** Called with the full settings whenever a field edit leaves every field valid. */
  onChange(next: Settings): void;
  onClose(): void;
  /**
   * True while the panel slides out. It then ignores pointer and keyboard input and calls
   * onExited once, when the slide ends. Setting it false again slides the panel back in.
   */
  closing?: boolean;
  onExited?(): void;
  onToggleRunning(): void;
  /** Plays one flash with the current settings. The button is disabled while any field is invalid. */
  onPreviewFlash?(): void;
  /** Reports whether any field is invalid, and false again when the panel unmounts. */
  onInvalidChange?(invalid: boolean): void;
  /** Why the chosen global shortcut is not active, or null when it is. */
  shortcutError?: string | null;
  /** Saved presets. The picker is left out when this is missing. */
  presets?: PresetControls;
}

export function SettingsPanel({
  settings,
  running,
  onChange,
  onClose,
  closing = false,
  onExited,
  onToggleRunning,
  onPreviewFlash,
  onInvalidChange,
  shortcutError = null,
  presets,
}: SettingsPanelProps) {
  const ids = useId();
  const [draft, setDraft] = useState<SettingsDraft>(() => draftFromSettings(settings));
  const errors = useMemo(() => applyDraft(settings, draft).errors, [settings, draft]);
  const invalid = Object.keys(errors).length > 0;

  useEffect(() => {
    onInvalidChange?.(invalid);
    return () => onInvalidChange?.(false);
  }, [invalid, onInvalidChange]);

  const panelRef = useRef<HTMLElement>(null);
  const intervalRef = useRef<HTMLInputElement>(null);
  const swatchRefs = useRef<(HTMLInputElement | null)[]>([]);
  const focusSwatch = useRef<number | null>(null);

  const onExitedRef = useRef(onExited);
  useEffect(() => {
    onExitedRef.current = onExited;
  });

  // The slide state lives on the element, not in React props. Switching animations needs the
  // panel's on-screen position from before the switch, and React has already changed the
  // DOM by the time any effect runs. Reading the position first, then switching, keeps a
  // close during entry, or a reopen during exit, from jumping.
  const slideClosing = useRef(false);
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el || slideClosing.current === closing) return;
    slideClosing.current = closing;
    const parent = el.offsetParent ?? el.parentElement;
    const offset = parent
      ? el.getBoundingClientRect().right - parent.getBoundingClientRect().right
      : 0;
    el.style.setProperty('--panel-from', `${Math.round(offset * 100) / 100}px`);
    if (closing) el.setAttribute('data-state', 'closing');
    else el.removeAttribute('data-state');
  }, [closing]);

  // Focus goes to the first field when the panel opens, and again if it reopens mid-exit.
  useEffect(() => {
    if (!closing) intervalRef.current?.focus({ preventScroll: true });
  }, [closing]);

  // Finish the exit once: on its own animation's end or cancel, at once under reduced motion
  // (which disables the animation, so no event would come), and after a fallback delay if neither event ever arrives.
  useEffect(() => {
    const el = panelRef.current;
    if (!closing || !el) return;
    // Hidden or inert content must not keep focus.
    if (el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onExitedRef.current?.();
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    // Events from descendants bubble up here, and the entry animation may also end. Neither counts.
    const onDone = (event: Event) => {
      if (event.target === el && (event as AnimationEvent).animationName === EXIT_ANIMATION)
        finish();
    };
    el.addEventListener('animationend', onDone);
    el.addEventListener('animationcancel', onDone);
    const fallback = setTimeout(finish, EXIT_FALLBACK_MS);
    return () => {
      // A reopen or unmount makes this exit stale, so its completion must do nothing.
      finished = true;
      clearTimeout(fallback);
      el.removeEventListener('animationend', onDone);
      el.removeEventListener('animationcancel', onDone);
    };
  }, [closing]);

  useEffect(() => {
    if (focusSwatch.current === null) return;
    swatchRefs.current[focusSwatch.current]?.focus({ preventScroll: true });
    focusSwatch.current = null;
  });

  const edit = (patch: Partial<SettingsDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    const merged = applyDraft(settings, next).settings;
    if (!sameSettings(merged, settings)) onChange(merged);
  };

  // A preset replaces every timing and look field, so the typed text starts over from it.
  const selectPreset = (id: string | null) => {
    const preset = presets?.presets.find((p) => p.id === id);
    if (preset) setDraft(draftFromSettings(applyPresetValues(settings, preset.values)));
    presets?.onSelect(id);
  };

  const colors = draft.colors;
  const intervalErrorId = `${ids}-interval-err`;
  const durationErrorId = `${ids}-duration-err`;
  const shortcutId = `${ids}-shortcut`;
  const shortcutErrorId = `${ids}-shortcut-err`;
  const whyId = `${ids}-why`;
  const showWhy = !running && invalid;

  return (
    <aside ref={panelRef} className="panel" role="dialog" aria-label="Settings" inert={closing}>
      <header>
        <h3>Settings</h3>
        <button type="button" className="x" aria-label="Close settings" onClick={onClose}>
          <XIcon />
        </button>
      </header>
      <div className="body">
        {presets ? (
          <div className="grp" role="group" aria-label="Presets">
            <PresetPicker
              {...presets}
              onSelect={selectPreset}
              settings={settings}
              invalid={invalid}
            />
          </div>
        ) : null}
        <div className="grp" role="group" aria-label="Timing">
          <div className="row2">
            <div className="field">
              <div className="lab">
                <label htmlFor={`${ids}-interval`}>Interval</label>
              </div>
              <div className={errors.interval ? 'join bad' : 'join'}>
                <input
                  ref={intervalRef}
                  id={`${ids}-interval`}
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={draft.intervalValue}
                  aria-invalid={errors.interval ? 'true' : 'false'}
                  aria-describedby={errors.interval ? intervalErrorId : undefined}
                  onChange={(event) => edit({ intervalValue: event.target.value })}
                />
                <select
                  name="unit"
                  aria-label="Interval unit"
                  value={draft.intervalUnit}
                  onChange={(event) => edit({ intervalUnit: event.target.value as IntervalUnit })}
                >
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
              <FieldError id={intervalErrorId} message={errors.interval} />
            </div>
            <div className="field">
              <div className="lab">
                <label htmlFor={`${ids}-duration`}>Flash duration</label>
              </div>
              <div className={errors.flashDurationSeconds ? 'join bad' : 'join'}>
                <input
                  id={`${ids}-duration`}
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={draft.duration}
                  aria-invalid={errors.flashDurationSeconds ? 'true' : 'false'}
                  aria-describedby={errors.flashDurationSeconds ? durationErrorId : undefined}
                  onChange={(event) => edit({ duration: event.target.value })}
                />
                <span className="suffix">seconds</span>
              </div>
              <FieldError id={durationErrorId} message={errors.flashDurationSeconds} />
            </div>
          </div>
        </div>

        <div className="grp" role="group" aria-label="Colors">
          <div className="field">
            <div className="lab">
              <span id={`${ids}-colors`}>Colors</span>
              <span className="meta">
                {colors.length} of {LIMITS.MAX_COLORS}
              </span>
            </div>
            <div
              className="swatches"
              role="group"
              aria-labelledby={`${ids}-colors`}
              aria-describedby={errors.colors ? `${ids}-colors-err` : undefined}
            >
              {colors.map((color, index) => (
                // Colors have no identity beyond their position, so the index is the key.
                <span className="sw" key={index}>
                  <input
                    ref={(el) => {
                      swatchRefs.current[index] = el;
                    }}
                    type="color"
                    name="color"
                    value={color}
                    aria-label={`Color ${index + 1}`}
                    onChange={(event) =>
                      edit({
                        colors: colors.map((c, i) => (i === index ? event.target.value : c)),
                      })
                    }
                  />
                  {colors.length > LIMITS.MIN_COLORS ? (
                    <button
                      type="button"
                      className="rm"
                      aria-label={`Remove color ${index + 1}`}
                      onClick={() => {
                        focusSwatch.current = Math.max(0, index - 1);
                        edit({ colors: colors.filter((_, i) => i !== index) });
                      }}
                    >
                      <XIcon />
                    </button>
                  ) : null}
                </span>
              ))}
              <button
                type="button"
                className="add"
                aria-label="Add color"
                disabled={colors.length >= LIMITS.MAX_COLORS}
                onClick={() => {
                  focusSwatch.current = colors.length;
                  edit({ colors: [...colors, nextColor(colors)] });
                }}
              >
                <PlusIcon />
              </button>
            </div>
            <FieldError id={`${ids}-colors-err`} message={errors.colors} />
            <p className="help">
              With more than one color, each pulse takes the next color in order.
            </p>
          </div>
          <div className="field inline">
            <div className="lab">
              <span>Idle color</span>
            </div>
            <div className="idlectl">
              <span>{draft.idleColor}</span>
              <span className="sw">
                <input
                  type="color"
                  name="idle"
                  value={draft.idleColor}
                  aria-label="Idle color"
                  aria-invalid={errors.idleColor ? 'true' : undefined}
                  onChange={(event) => edit({ idleColor: event.target.value })}
                />
              </span>
            </div>
          </div>
        </div>

        <div className="grp" role="group" aria-label="Flash" data-slot="flash">
          <FlashSection
            settings={settings}
            onChange={(patch) => onChange({ ...settings, ...patch })}
          />
        </div>

        <div className="grp" role="group" aria-label="Window">
          <div className="toggle">
            <div>
              <label htmlFor={`${ids}-top`}>Always on top</label>
              <p className="help">Keeps the window above other windows.</p>
            </div>
            <span className="switch">
              <input
                id={`${ids}-top`}
                type="checkbox"
                role="switch"
                checked={settings.alwaysOnTop}
                onChange={(event) => onChange({ ...settings, alwaysOnTop: event.target.checked })}
              />
              <i />
            </span>
          </div>
          <div className="toggle">
            <div>
              <label htmlFor={`${ids}-borderless`}>Borderless</label>
              <p className="help">
                Removes the title bar and frame. On some Linux window managers a borderless window
                can&apos;t be resized from its edges.
              </p>
            </div>
            <span className="switch">
              <input
                id={`${ids}-borderless`}
                type="checkbox"
                role="switch"
                checked={settings.borderless}
                onChange={(event) => onChange({ ...settings, borderless: event.target.checked })}
              />
              <i />
            </span>
          </div>
          <div className="toggle">
            <div>
              <label htmlFor={`${ids}-fullscreen`}>Fullscreen</label>
              <p className="help">Fills the screen. Space and S still work.</p>
            </div>
            <span className="switch">
              <input
                id={`${ids}-fullscreen`}
                type="checkbox"
                role="switch"
                checked={settings.fullscreen}
                onChange={(event) => onChange({ ...settings, fullscreen: event.target.checked })}
              />
              <i />
            </span>
          </div>
          <div className="field shortcut">
            <div className="lab">
              <label htmlFor={shortcutId}>Global start and stop shortcut</label>
            </div>
            <p className="help">Off by default. Works when Blinkr is not focused.</p>
            <div className={shortcutError ? 'join bad' : 'join'}>
              <select
                id={shortcutId}
                name="shortcut"
                value={settings.globalShortcut ?? ''}
                aria-invalid={shortcutError ? 'true' : 'false'}
                aria-describedby={`${shortcutError ? `${shortcutErrorId} ` : ''}${shortcutId}-help`}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    globalShortcut: isGlobalShortcut(event.target.value)
                      ? event.target.value
                      : null,
                  })
                }
              >
                <option value="">Off</option>
                {GLOBAL_SHORTCUTS.map((accel) => (
                  <option key={accel} value={accel}>
                    {SHORTCUT_LABELS[accel]}
                  </option>
                ))}
              </select>
            </div>
            <FieldError id={shortcutErrorId} message={shortcutError ?? undefined} />
            <p className="help" id={`${shortcutId}-help`}>
              May not work on Linux with Wayland. Space in the window always works.
            </p>
          </div>
        </div>
      </div>
      <footer>
        {showWhy ? (
          <p className="why" id={whyId}>
            Fix the highlighted fields to start.
          </p>
        ) : null}
        <div className="actions">
          <button
            type="button"
            className="btn"
            title="Preview flash (P)"
            aria-keyshortcuts="P"
            disabled={invalid || !onPreviewFlash}
            onClick={onPreviewFlash}
          >
            Preview flash
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!running && invalid}
            aria-describedby={showWhy ? whyId : undefined}
            onClick={onToggleRunning}
          >
            {running ? 'Stop' : 'Start'}
          </button>
        </div>
      </footer>
    </aside>
  );
}
