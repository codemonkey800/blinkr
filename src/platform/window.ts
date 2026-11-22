import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export interface WindowControls {
  setAlwaysOnTop(on: boolean): Promise<void>;
  /** Removes or restores the title bar and frame. */
  setBorderless(on: boolean): Promise<void>;
  setFullscreen(on: boolean): Promise<void>;
  /** Whether the OS window is fullscreen, or null when that is unknown: a plain browser or an error. */
  isFullscreen(): Promise<boolean | null>;
  /** Hands the current mouse press to the OS to move the window. */
  startDragging(): Promise<void>;
}

const noopControls: WindowControls = {
  setAlwaysOnTop: async () => {},
  setBorderless: async () => {},
  setFullscreen: async () => {},
  isFullscreen: async () => null,
  startDragging: async () => {},
};

/** Runs a window call, warning instead of throwing. Returns `fallback` on failure. */
async function guarded<T>(
  what: string,
  fallback: T,
  call: (window: ReturnType<typeof getCurrentWindow>) => Promise<T>,
): Promise<T> {
  try {
    return await call(getCurrentWindow());
  } catch (error) {
    console.warn(`Blinkr could not ${what}.`, error);
    return fallback;
  }
}

/** Tauri window controls, or no-ops in a plain browser. Errors are warned, never thrown. */
export function windowControls(): WindowControls {
  if (!isTauri()) return noopControls;
  return {
    setAlwaysOnTop: (on) => guarded('change always-on-top', undefined, (w) => w.setAlwaysOnTop(on)),
    setBorderless: (on) =>
      guarded('change the window frame', undefined, (w) => w.setDecorations(!on)),
    setFullscreen: (on) => guarded('change fullscreen', undefined, (w) => w.setFullscreen(on)),
    isFullscreen: () => guarded<boolean | null>('read fullscreen', null, (w) => w.isFullscreen()),
    startDragging: () => guarded('drag the window', undefined, (w) => w.startDragging()),
  };
}
