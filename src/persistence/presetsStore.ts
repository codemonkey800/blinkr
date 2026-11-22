import { sanitizePresets, type Preset } from '../presets/presets';
import type { KeyValueBackend } from './settingsStore';

const PRESETS_KEY = 'presets';

/** Saved presets, or none when nothing is stored, the store fails, or the data is corrupt. */
export async function loadPresets(backend: KeyValueBackend): Promise<Preset[]> {
  try {
    return sanitizePresets(await backend.get(PRESETS_KEY));
  } catch (error) {
    console.warn('Blinkr could not load saved presets; starting with none.', error);
    return [];
  }
}

export async function savePresets(backend: KeyValueBackend, presets: Preset[]): Promise<void> {
  try {
    await backend.set(PRESETS_KEY, presets);
  } catch (error) {
    console.warn('Blinkr could not save presets.', error);
  }
}
