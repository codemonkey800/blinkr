import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../settings/model';
import {
  browserBackend,
  createDebouncedSaver,
  loadSettings,
  saveSettings,
  type KeyValueBackend,
} from './settingsStore';

function memoryBackend(): KeyValueBackend & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (key) => data.get(key),
    set: async (key, value) => {
      data.set(key, structuredClone(value));
    },
  };
}

function fakeStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

const custom: Settings = {
  ...DEFAULT_SETTINGS,
  interval: { value: 20, unit: 'minutes' },
  flashDurationSeconds: 5,
  colors: ['#ff0000', '#00ff00'],
  style: 'blink',
  intensity: 80,
  rate: 0.5,
  idleColor: '#000000',
  alwaysOnTop: true,
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('loadSettings and saveSettings', () => {
  it('round-trips through an in-memory backend', async () => {
    const backend = memoryBackend();
    await saveSettings(backend, custom);
    expect(await loadSettings(backend)).toEqual(custom);
  });

  it('round-trips through browser storage', async () => {
    const backend = browserBackend(fakeStorage());
    await saveSettings(backend, custom);
    expect(await loadSettings(backend)).toEqual(custom);
  });

  it('gives defaults when the key is missing', async () => {
    expect(await loadSettings(memoryBackend())).toEqual(DEFAULT_SETTINGS);
    expect(await loadSettings(browserBackend(fakeStorage()))).toEqual(DEFAULT_SETTINGS);
  });

  it('gives defaults for corrupt JSON in localStorage', async () => {
    const storage = fakeStorage();
    storage.setItem('blinkr:settings', '{not json');
    expect(await loadSettings(browserBackend(storage))).toEqual(DEFAULT_SETTINGS);
  });

  it('gives field-level defaults for a partially invalid object', async () => {
    const backend = memoryBackend();
    backend.data.set('settings', {
      interval: { value: 5, unit: 'hours' },
      flashDurationSeconds: 'long',
      colors: ['nope'],
      style: 'blink',
      intensity: 9999,
      unknownField: true,
    });
    const loaded = await loadSettings(backend);
    expect(loaded).toEqual({
      ...DEFAULT_SETTINGS,
      interval: { value: 5, unit: 'hours' },
      style: 'blink',
    });
    expect(loaded).not.toHaveProperty('unknownField');
  });

  it('gives defaults, without throwing, when the backend read fails', async () => {
    const backend: KeyValueBackend = {
      get: () => Promise.reject(new Error('disk gone')),
      set: async () => {},
    };
    expect(await loadSettings(backend)).toEqual(DEFAULT_SETTINGS);
    expect(warn).toHaveBeenCalled();
  });

  it('gives defaults when browser storage itself throws', async () => {
    const storage = fakeStorage();
    storage.getItem = () => {
      throw new Error('blocked');
    };
    expect(await loadSettings(browserBackend(storage))).toEqual(DEFAULT_SETTINGS);
  });

  it('warns and does not throw when a save is rejected', async () => {
    const backend: KeyValueBackend = {
      get: async () => undefined,
      set: () => Promise.reject(new Error('read-only')),
    };
    await expect(saveSettings(backend, custom)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('createDebouncedSaver', () => {
  it('coalesces rapid saves into one write of the last value', async () => {
    vi.useFakeTimers();
    const backend = memoryBackend();
    const set = vi.spyOn(backend, 'set');
    const saver = createDebouncedSaver(backend, 200);

    saver.save({ ...custom, intensity: 20 });
    vi.advanceTimersByTime(100);
    saver.save({ ...custom, intensity: 30 });
    vi.advanceTimersByTime(100);
    saver.save({ ...custom, intensity: 40 });
    expect(set).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(set).toHaveBeenCalledTimes(1);
    expect((await loadSettings(backend)).intensity).toBe(40);
  });

  it('flush writes the last pending save immediately and cancels the timer', async () => {
    vi.useFakeTimers();
    const backend = memoryBackend();
    const set = vi.spyOn(backend, 'set');
    const saver = createDebouncedSaver(backend, 200);

    saver.save({ ...custom, intensity: 20 });
    saver.save({ ...custom, intensity: 55 });
    await saver.flush();
    expect(set).toHaveBeenCalledTimes(1);
    expect((await loadSettings(backend)).intensity).toBe(55);

    await vi.advanceTimersByTimeAsync(1000);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('flush with nothing pending writes nothing', async () => {
    const backend = memoryBackend();
    const set = vi.spyOn(backend, 'set');
    await createDebouncedSaver(backend).flush();
    expect(set).not.toHaveBeenCalled();
  });

  it('flush waits for a write already in flight and keeps write order', async () => {
    vi.useFakeTimers();
    const order: number[] = [];
    let releaseFirst: () => void = () => {};
    const backend: KeyValueBackend = {
      get: async () => undefined,
      set: async (_key, value) => {
        const intensity = (value as Settings).intensity;
        if (order.length === 0) {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
        order.push(intensity);
      },
    };
    const saver = createDebouncedSaver(backend, 100);
    saver.save({ ...custom, intensity: 20 });
    await vi.advanceTimersByTimeAsync(100);
    saver.save({ ...custom, intensity: 90 });
    const flushed = saver.flush();
    releaseFirst();
    await flushed;
    expect(order).toEqual([20, 90]);
  });

  it('does not throw when the backend rejects', async () => {
    vi.useFakeTimers();
    const backend: KeyValueBackend = {
      get: async () => undefined,
      set: () => Promise.reject(new Error('nope')),
    };
    const saver = createDebouncedSaver(backend, 50);
    saver.save(custom);
    await vi.advanceTimersByTimeAsync(50);
    await expect(saver.flush()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
