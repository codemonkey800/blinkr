import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { ContextMenu } from './app/ContextMenu';
import { ControlBar } from './app/ControlBar';
import type { InitialState } from './app/devOverrides';
import { useWindowDrag } from './app/useWindowDrag';
import { FlashSurface } from './flash/FlashSurface';
import type { KeyValueBackend } from './persistence/settingsStore';
import { applyPresetValues, presetValuesFrom, type Preset } from './presets/presets';
import { usePresets } from './presets/usePresets';
import { applyGlobalShortcut } from './platform/shortcut';
import { windowControls, type WindowControls } from './platform/window';
import { DEFAULT_SETTINGS, intervalMs } from './settings/model';
import type { PresetControls } from './settings/PresetPicker';
import { SettingsPanel } from './settings/SettingsPanel';
import { useSettings } from './settings/useSettings';
import { useBlinkTimer } from './timer/useBlinkTimer';

/** How long the control bar stays up after the last pointer movement while running. */
export const BAR_IDLE_MS = 2000;

let presetCounter = 0;

function newPresetId(): string {
  presetCounter += 1;
  return globalThis.crypto?.randomUUID?.() ?? `preset-${Date.now().toString(36)}-${presetCounter}`;
}

const FORM_FIELD = 'input, select, textarea, [contenteditable]';

function isFormField(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(FORM_FIELD) !== null;
}

function isButton(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button') !== null;
}

export interface AppProps {
  initial?: InitialState;
  /** Where settings are stored. Undefined uses the default store, null turns storage off. */
  backend?: KeyValueBackend | null;
  /** Native window calls. Defaults to the Tauri adapter, which does nothing in a browser. */
  controls?: WindowControls;
}

export default function App({ initial, backend, controls }: AppProps) {
  const windowApi = useMemo(() => controls ?? windowControls(), [controls]);
  const { settings, update, loadVersion } = useSettings(
    initial?.settings ?? DEFAULT_SETTINGS,
    backend,
    windowApi,
  );
  const autostart = initial?.autostart ?? false;
  const onWindowPointerDown = useWindowDrag(settings.borderless, windowApi);

  const { running, phase, start, stop, restart } = useBlinkTimer({
    intervalMs: intervalMs(settings.interval),
    flashMs: settings.flashDurationSeconds * 1000,
  });

  const { presets, loaded: presetsLoaded, setPresets } = usePresets(backend);
  // The preset last applied or saved. Editing a setting doesn't change it, only marks it modified.
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const presetControls = useMemo<PresetControls>(
    () => ({
      presets,
      activeId: activePresetId,
      loaded: presetsLoaded,
      onSelect(id) {
        setActivePresetId(id);
        const preset = presets.find((p) => p.id === id);
        if (!preset) return;
        update(applyPresetValues(settings, preset.values));
        // A running timer starts over from now, with the preset's timing.
        if (running) restart();
      },
      onSaveNew(name) {
        const preset: Preset = { id: newPresetId(), name, values: presetValuesFrom(settings) };
        setPresets([...presets, preset]);
        setActivePresetId(preset.id);
      },
      onRename(id, name) {
        setPresets(presets.map((p) => (p.id === id ? { ...p, name } : p)));
      },
      onDelete(id) {
        setPresets(presets.filter((p) => p.id !== id));
        setActivePresetId((current) => (current === id ? null : current));
      },
      onUpdate(id) {
        setPresets(
          presets.map((p) => (p.id === id ? { ...p, values: presetValuesFrom(settings) } : p)),
        );
      },
    }),
    [presets, activePresetId, presetsLoaded, setPresets, settings, update, running, restart],
  );

  // The panel stays mounted while it slides out, so what was asked for (open) is kept apart
  // from whether it is still on screen (open or closing).
  const [panel, setPanel] = useState<'closed' | 'open' | 'closing'>('closed');
  const panelOpen = panel === 'open';
  const closePanel = useCallback(() => setPanel((p) => (p === 'open' ? 'closing' : p)), []);
  // A completion from a closed-then-reopened exit finds the state is no longer closing.
  const panelExited = useCallback(() => setPanel((p) => (p === 'closing' ? 'closed' : p)), []);
  // True while the open panel has an invalid field. Preview flash needs valid settings.
  const [panelInvalid, setPanelInvalid] = useState(false);

  // A preview is one flash in the real window surface. It never touches the timer's schedule.
  // Its flash keys are negative, so they never equal a timer cycle and the layer remounts on a switch.
  const [previewKey, setPreviewKey] = useState<number | null>(null);
  const previewCount = useRef(0);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const timerFlashing = phase?.kind === 'flash';

  const endPreview = useCallback(() => {
    clearTimeout(previewTimer.current);
    setPreviewKey(null);
  }, []);

  const previewDisabled = panelOpen && panelInvalid;

  const previewFlash = useCallback(() => {
    // The timer's flash wins, and an invalid field leaves nothing valid to preview.
    if (previewDisabled || timerFlashing) return;
    clearTimeout(previewTimer.current);
    previewCount.current += 1;
    setPreviewKey(-previewCount.current);
    previewTimer.current = setTimeout(endPreview, settings.flashDurationSeconds * 1000);
  }, [previewDisabled, timerFlashing, settings.flashDurationSeconds, endPreview]);

  // When the timer starts a flash, the preview gives way to it and does not come back.
  useEffect(() => {
    if (timerFlashing) endPreview();
  }, [timerFlashing, endPreview]);

  useEffect(() => () => clearTimeout(previewTimer.current), []);

  // While running the bar is hidden until the pointer, a click, or Tab asks for it.
  const [revealed, setRevealed] = useState(false);
  const focusWithin = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearHideTimer = useCallback(() => clearTimeout(hideTimer.current), []);

  const hide = useCallback(() => {
    clearTimeout(hideTimer.current);
    if (!focusWithin.current) setRevealed(false);
  }, []);

  const armHide = useCallback(() => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(hide, BAR_IDLE_MS);
  }, [hide]);

  const reveal = useCallback(() => {
    // The bar stays out until the panel has finished leaving.
    if (!running || panel !== 'closed') return;
    setRevealed(true);
    armHide();
  }, [running, panel, armHide]);

  const onFocusChange = useCallback(
    (within: boolean) => {
      focusWithin.current = within;
      if (within) reveal();
      else if (running) armHide();
    },
    [reveal, armHide, running],
  );

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  // Where focus goes when the panel or menu closes.
  const panelReturn = useRef<HTMLElement | null>(null);
  const menuReturn = useRef<HTMLElement | null>(null);
  const panelWasOpen = useRef(false);

  const focusedInWindow = useCallback((): HTMLElement | null => {
    const active = document.activeElement;
    return active instanceof HTMLElement && mainRef.current?.contains(active) ? active : null;
  }, []);

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setMenu(null);
    if (restoreFocus) (menuReturn.current ?? mainRef.current)?.focus({ preventScroll: true });
    menuReturn.current = null;
  }, []);

  const toggle = useCallback(() => {
    if (running) {
      clearHideTimer();
      stop();
    } else {
      start();
      // Starting closes the panel. The timer has already started, so the slide cannot delay it.
      closePanel();
      // Keyboard focus on the bar keeps it up. Otherwise it gets out of the way at once.
      setRevealed(focusWithin.current);
      if (focusWithin.current) armHide();
    }
  }, [running, start, stop, armHide, clearHideTimer, closePanel]);

  // The OS shortcut calls whatever toggle is current, so it never needs re-registering for it.
  const toggleRef = useRef(toggle);
  useEffect(() => {
    toggleRef.current = toggle;
  });
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  useEffect(() => {
    let stale = false;
    void applyGlobalShortcut(settings.globalShortcut, () => toggleRef.current()).then((result) => {
      if (!stale) setShortcutError(result.ok ? null : result.reason);
    });
    return () => {
      stale = true;
    };
  }, [settings.globalShortcut]);

  const openSettings = useCallback(() => {
    if (panelOpen) return;
    // Reopening mid-exit keeps the target saved by the first open.
    panelReturn.current ??= focusedInWindow();
    clearHideTimer();
    setRevealed(false);
    setMenu(null);
    setPanel('open');
  }, [panelOpen, focusedInWindow, clearHideTimer]);

  // Focus goes back to where it was once the panel has left and the bar is back. The bar is
  // hidden while the panel slides out, so the window holds focus until then.
  useEffect(() => {
    if (panel === 'open') {
      panelWasOpen.current = true;
      return;
    }
    if (!panelWasOpen.current) return;
    if (panel === 'closing') {
      mainRef.current?.focus({ preventScroll: true });
      return;
    }
    panelWasOpen.current = false;
    (panelReturn.current ?? mainRef.current)?.focus({ preventScroll: true });
    panelReturn.current = null;
  }, [panel]);

  // A click outside the panel closes it.
  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.panel')) return;
      closePanel();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [panelOpen, closePanel]);

  useEffect(() => clearHideTimer, [clearHideTimer]);

  useEffect(() => {
    if (autostart) start();
    // Starting once on mount is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (menu) closeMenu(true);
        else if (panelOpen) closePanel();
        // With settings closed, Escape leaves fullscreen, and the stored setting follows.
        else if (panel === 'closed' && settings.fullscreen) {
          update({ ...settings, fullscreen: false });
        }
        return;
      }
      if (event.key === 'Tab') {
        reveal();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || isFormField(event.target)) return;
      if (event.key === 's' || event.key === 'S') {
        if (isButton(event.target)) return;
        event.preventDefault();
        openSettings();
      } else if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        if (!event.repeat) previewFlash();
      } else if (event.key === ' ') {
        // A focused button handles Space itself.
        if (isButton(event.target)) return;
        event.preventDefault();
        if (!event.repeat) toggle();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [
    reveal,
    toggle,
    openSettings,
    previewFlash,
    menu,
    panel,
    panelOpen,
    closeMenu,
    closePanel,
    settings,
    update,
  ]);

  const flashing = timerFlashing || previewKey !== null;
  const visible = !running || revealed;

  return (
    <main
      ref={mainRef}
      className="app"
      tabIndex={-1}
      aria-label="Blinkr window. Press Space to start or stop. Press S for settings."
      onPointerDown={onWindowPointerDown}
      onPointerMove={reveal}
      onPointerLeave={hide}
      onClick={reveal}
      onContextMenu={(event) => {
        const inPanel = event.target instanceof Element && event.target.closest('.panel');
        // Text fields in the panel keep the native menu, for copy and paste.
        if (inPanel && isFormField(event.target)) return;
        event.preventDefault();
        if (inPanel) return;
        menuReturn.current = menu ? menuReturn.current : focusedInWindow();
        const rect = event.currentTarget.getBoundingClientRect();
        setMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      }}
    >
      <FlashSurface
        idleColor={settings.idleColor}
        colors={settings.colors}
        style={settings.style}
        intensity={settings.intensity}
        rate={settings.rate}
        flashing={flashing}
        flashKey={timerFlashing ? phase.cycle : (previewKey ?? 0)}
      />
      <ControlBar
        running={running}
        visible={visible}
        covered={panel !== 'closed'}
        onToggle={toggle}
        onOpenSettings={openSettings}
        onFocusChange={onFocusChange}
      />
      {panel !== 'closed' ? (
        <SettingsPanel
          key={loadVersion}
          closing={panel === 'closing'}
          onExited={panelExited}
          settings={settings}
          running={running}
          onChange={update}
          onClose={closePanel}
          onToggleRunning={toggle}
          onPreviewFlash={previewFlash}
          onInvalidChange={setPanelInvalid}
          shortcutError={shortcutError}
          presets={presetControls}
        />
      ) : null}
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          running={running}
          alwaysOnTop={settings.alwaysOnTop}
          onClose={closeMenu}
          onOpenSettings={openSettings}
          onToggleRunning={toggle}
          onPreviewFlash={previewFlash}
          onToggleAlwaysOnTop={() => update({ ...settings, alwaysOnTop: !settings.alwaysOnTop })}
        />
      ) : null}
    </main>
  );
}
