import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPresets, savePresets } from '../persistence/presetsStore';
import { defaultBackend, type KeyValueBackend } from '../persistence/settingsStore';
import type { Preset } from './presets';

export interface PresetsState {
  presets: Preset[];
  /** False until stored presets have arrived. Saving before then could overwrite them. */
  loaded: boolean;
  /** Replace the list and save it. */
  setPresets(next: Preset[]): void;
}

/**
 * The saved presets, loaded from and saved to the same store as the settings.
 * `backend` undefined uses the default store, null turns persistence off.
 */
export function usePresets(backend: KeyValueBackend | null | undefined): PresetsState {
  const [presets, setList] = useState<Preset[]>([]);
  const [loaded, setLoaded] = useState(backend === null);
  const store = useRef<Promise<KeyValueBackend> | null>(null);
  // Writes run one after another so a slow earlier save can't overwrite a later one.
  const chain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (backend === null) return;
    let cancelled = false;
    const opened = (async () => backend ?? (await defaultBackend()))();
    store.current = opened;
    void opened.then(loadPresets).then((stored) => {
      if (cancelled) return;
      setList(stored);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
      store.current = null;
    };
  }, [backend]);

  const setPresets = useCallback((next: Preset[]) => {
    setList(next);
    const opened = store.current;
    if (!opened) return;
    chain.current = chain.current.then(async () => savePresets(await opened, next));
  }, []);

  return { presets, loaded, setPresets };
}
