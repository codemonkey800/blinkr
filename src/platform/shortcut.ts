import { isTauri } from '@tauri-apps/api/core';
import { isRegistered, register, unregister } from '@tauri-apps/plugin-global-shortcut';

export type ShortcutResult = { ok: true } | { ok: false; reason: string };

/** Shown in place of the failure message when there is no desktop app to register with. */
export const DESKTOP_ONLY_MESSAGE = 'Available in the desktop app only.';
export const REGISTER_FAILED_MESSAGE =
  "Couldn't register this shortcut. Another app may be using it.";

/** The accelerator this app has registered, or null. Calls are chained so they never overlap. */
let current: string | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function swap(accel: string | null, onToggle: () => void): Promise<ShortcutResult> {
  try {
    if (current !== null) {
      const previous = current;
      current = null;
      await unregister(previous);
    }
    if (accel === null) return { ok: true };
    // A registration left behind by a reloaded page would make register fail.
    if (await isRegistered(accel)) await unregister(accel);
    await register(accel, (event) => {
      // Release fires too. Only the press toggles.
      if (event.state === 'Pressed') onToggle();
    });
    current = accel;
    return { ok: true };
  } catch (error) {
    console.warn('Blinkr could not change the global shortcut.', error);
    return { ok: false, reason: REGISTER_FAILED_MESSAGE };
  }
}

/**
 * Makes `accel` the global shortcut and unregisters the previous one. Null turns it off.
 * Never throws: a failure, or a plain browser, resolves `{ ok: false }`. Off needs nothing, so
 * it succeeds in a browser.
 */
export function applyGlobalShortcut(
  accel: string | null,
  onToggle: () => void,
): Promise<ShortcutResult> {
  if (!isTauri()) {
    return Promise.resolve(
      accel === null ? { ok: true } : { ok: false, reason: DESKTOP_ONLY_MESSAGE },
    );
  }
  const result = queue.then(() => swap(accel, onToggle));
  queue = result;
  return result;
}
