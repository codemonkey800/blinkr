import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createDebouncedSaver,
  defaultBackend,
  loadSettings,
  type KeyValueBackend,
} from '../persistence/settingsStore';
import type { WindowControls } from '../platform/window';
import type { Settings } from './model';

type Saver = ReturnType<typeof createDebouncedSaver>;

/**
 * How long the window must stop resizing before fullscreen is read back. Entering or leaving
 * fullscreen resizes the window repeatedly while the OS still reports the old state.
 */
export const FULLSCREEN_RESYNC_MS = 250;

export interface SettingsState {
  settings: Settings;
  /** Replace the settings with an already valid value. Saved after a short pause. */
  update(next: Settings): void;
  /** Bumped when stored settings arrive, so open forms can start over from them. */
  loadVersion: number;
}

/**
 * Settings state with persistence and the window side effects: always-on-top, borderless,
 * fullscreen, and the fullscreen resync.
 * `backend` undefined uses the default store, null turns persistence off.
 */
export function useSettings(
  initial: Settings,
  backend: KeyValueBackend | null | undefined,
  controls: WindowControls,
): SettingsState {
  const [settings, setSettings] = useState(initial);
  const [loadVersion, setLoadVersion] = useState(0);
  const saver = useRef<Saver | null>(null);
  // An edit made before the stored settings arrive wins over them.
  const earlyEdit = useRef<Settings | null>(null);

  useEffect(() => {
    if (backend === null) return;
    let cancelled = false;
    void (async () => {
      const store = backend ?? (await defaultBackend());
      const stored = await loadSettings(store);
      if (cancelled) return;
      saver.current = createDebouncedSaver(store);
      if (earlyEdit.current) {
        saver.current.save(earlyEdit.current);
      } else {
        setSettings(stored);
        setLoadVersion((v) => v + 1);
      }
    })();
    return () => {
      cancelled = true;
      void saver.current?.flush();
      saver.current = null;
    };
  }, [backend]);

  useEffect(() => {
    const flush = () => void saver.current?.flush();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  useEffect(() => {
    void controls.setAlwaysOnTop(settings.alwaysOnTop);
  }, [controls, settings.alwaysOnTop]);

  useEffect(() => {
    void controls.setBorderless(settings.borderless);
  }, [controls, settings.borderless]);

  useEffect(() => {
    void controls.setFullscreen(settings.fullscreen);
  }, [controls, settings.fullscreen]);

  const update = useCallback((next: Settings) => {
    setSettings(next);
    if (saver.current) saver.current.save(next);
    else earlyEdit.current = next;
  }, []);

  // The OS can leave fullscreen without us (the green button, a shortcut). Once the window has
  // stopped resizing, the stored setting follows what the window reports.
  const latest = useRef(settings);
  useEffect(() => {
    latest.current = settings;
  });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const resync = async () => {
      const actual = await controls.isFullscreen();
      // Null means unknown, which must not overwrite what was chosen.
      if (disposed || actual === null || actual === latest.current.fullscreen) return;
      update({ ...latest.current, fullscreen: actual });
    };
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void resync(), FULLSCREEN_RESYNC_MS);
    };
    window.addEventListener('resize', onResize);
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [controls, update]);

  return { settings, update, loadVersion };
}
