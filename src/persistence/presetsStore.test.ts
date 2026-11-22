import { afterEach, describe, expect, it, vi } from 'vitest';
import { presetValuesFrom, type Preset } from '../presets/presets';
import { DEFAULT_SETTINGS } from '../settings/model';
import { loadPresets, savePresets } from './presetsStore';
import { browserBackend, loadSettings, saveSettings, type KeyValueBackend } from './settingsStore';

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

const presets: Preset[] = [
  {
    id: 'a',
    name: 'Desk break',
    values: presetValuesFrom({
      ...DEFAULT_SETTINGS,
      interval: { value: 20, unit: 'minutes' },
      colors: ['#ff0000', '#00ff00'],
    }),
  },
  { id: 'b', name: 'Walk', values: presetValuesFrom(DEFAULT_SETTINGS) },
];

afterEach(() => vi.restoreAllMocks());

describe('presets persistence', () => {
  it('round trips through a backend under the presets key', async () => {
    const backend = memoryBackend();
    await savePresets(backend, presets);
    expect(backend.data.has('presets')).toBe(true);
    expect(await loadPresets(backend)).toEqual(presets);
  });

  it('round trips through browser storage', async () => {
    const items = new Map<string, string>();
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    } as Storage;
    await savePresets(browserBackend(storage), presets);
    expect(await loadPresets(browserBackend(storage))).toEqual(presets);
  });

  it('shares a backend with settings without either overwriting the other', async () => {
    const backend = memoryBackend();
    await saveSettings(backend, { ...DEFAULT_SETTINGS, alwaysOnTop: true });
    await savePresets(backend, presets);
    expect((await loadSettings(backend)).alwaysOnTop).toBe(true);
    expect(await loadPresets(backend)).toEqual(presets);
  });

  it('loads none when nothing is stored', async () => {
    expect(await loadPresets(memoryBackend())).toEqual([]);
  });

  it('cleans up corrupt stored data', async () => {
    const backend = memoryBackend();
    backend.data.set('presets', [
      presets[0],
      { id: 'x', name: '', values: {} },
      'junk',
      { ...presets[1], values: { ...presets[1]?.values, intensity: 9000 } },
    ]);
    const loaded = await loadPresets(backend);
    expect(loaded.map((p) => p.id)).toEqual(['a', 'b']);
    expect(loaded[1]?.values.intensity).toBe(DEFAULT_SETTINGS.intensity);
  });

  it('loads none and warns when the backend fails to read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const backend: KeyValueBackend = {
      get: async () => {
        throw new Error('disk gone');
      },
      set: async () => {},
    };
    expect(await loadPresets(backend)).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('warns instead of throwing when the backend fails to write', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const backend: KeyValueBackend = {
      get: async () => undefined,
      set: async () => {
        throw new Error('read only');
      },
    };
    await expect(savePresets(backend, presets)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
