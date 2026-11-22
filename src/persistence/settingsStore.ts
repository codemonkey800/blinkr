import { isTauri } from '@tauri-apps/api/core';
import { sanitizeSettings, type Settings } from '../settings/model';

export interface KeyValueBackend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

const SETTINGS_KEY = 'settings';
const STORE_FILE = 'blinkr.json';
const BROWSER_PREFIX = 'blinkr:';
const DEFAULT_SAVE_DELAY_MS = 300;

export async function tauriBackend(): Promise<KeyValueBackend> {
  const { Store } = await import('@tauri-apps/plugin-store');
  const store = await Store.load(STORE_FILE, { autoSave: false });
  return {
    get: (key) => store.get(key),
    async set(key, value) {
      await store.set(key, value);
      await store.save();
    },
  };
}

export function browserBackend(storage?: Storage): KeyValueBackend {
  // Resolved per call: touching `localStorage` can throw when storage is blocked.
  const resolve = (): Storage => storage ?? globalThis.localStorage;
  return {
    async get(key) {
      const raw = resolve().getItem(BROWSER_PREFIX + key);
      if (raw === null) return undefined;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return undefined;
      }
    },
    async set(key, value) {
      resolve().setItem(BROWSER_PREFIX + key, JSON.stringify(value));
    },
  };
}

export async function defaultBackend(): Promise<KeyValueBackend> {
  if (!isTauri()) return browserBackend();
  try {
    return await tauriBackend();
  } catch (error) {
    console.warn('Blinkr could not open its settings store; using browser storage.', error);
    return browserBackend();
  }
}

async function loadValue(backend: KeyValueBackend, key: string): Promise<Settings> {
  try {
    return sanitizeSettings(await backend.get(key));
  } catch (error) {
    console.warn('Blinkr could not load saved settings; using defaults.', error);
    return sanitizeSettings(undefined);
  }
}

async function saveValue(backend: KeyValueBackend, key: string, value: unknown): Promise<void> {
  try {
    await backend.set(key, value);
  } catch (error) {
    console.warn('Blinkr could not save settings.', error);
  }
}

export function loadSettings(backend: KeyValueBackend): Promise<Settings> {
  return loadValue(backend, SETTINGS_KEY);
}

export function saveSettings(backend: KeyValueBackend, settings: Settings): Promise<void> {
  return saveValue(backend, SETTINGS_KEY, settings);
}

export function createDebouncedSaver(
  backend: KeyValueBackend,
  ms: number = DEFAULT_SAVE_DELAY_MS,
): { save(settings: Settings): void; flush(): Promise<void> } {
  let pending: Settings | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Writes run one after another so a slow earlier save can't overwrite a later one.
  let chain: Promise<void> = Promise.resolve();

  const writePending = (): void => {
    timer = undefined;
    if (pending === undefined) return;
    const next = pending;
    pending = undefined;
    chain = chain.then(() => saveSettings(backend, next));
  };

  return {
    save(settings) {
      pending = settings;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(writePending, ms);
    },
    flush() {
      if (timer !== undefined) clearTimeout(timer);
      writePending();
      return chain;
    },
  };
}
