import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  isTauri,
  getCurrentWindow,
  setAlwaysOnTop,
  setDecorations,
  setFullscreen,
  isFullscreen,
  startDragging,
} = vi.hoisted(() => ({
  isTauri: vi.fn(),
  getCurrentWindow: vi.fn(),
  setAlwaysOnTop: vi.fn(),
  setDecorations: vi.fn(),
  setFullscreen: vi.fn(),
  isFullscreen: vi.fn(),
  startDragging: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow }));

import { windowControls } from './window';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  getCurrentWindow.mockReturnValue({
    setAlwaysOnTop,
    setDecorations,
    setFullscreen,
    isFullscreen,
    startDragging,
  });
  for (const fn of [setAlwaysOnTop, setDecorations, setFullscreen, startDragging]) {
    fn.mockResolvedValue(undefined);
  }
  isFullscreen.mockResolvedValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  isTauri.mockReset();
  getCurrentWindow.mockReset();
  for (const fn of [setAlwaysOnTop, setDecorations, setFullscreen, isFullscreen, startDragging]) {
    fn.mockReset();
  }
});

describe('windowControls', () => {
  it('resolves as a no-op in a plain browser', async () => {
    isTauri.mockReturnValue(false);
    await expect(windowControls().setAlwaysOnTop(true)).resolves.toBeUndefined();
    expect(getCurrentWindow).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([true, false])('passes %s to the Tauri window', async (flag) => {
    isTauri.mockReturnValue(true);
    await windowControls().setAlwaysOnTop(flag);
    expect(setAlwaysOnTop).toHaveBeenCalledExactlyOnceWith(flag);
  });

  it('swallows and warns about a rejected call', async () => {
    isTauri.mockReturnValue(true);
    const failure = new Error('denied');
    setAlwaysOnTop.mockRejectedValue(failure);
    await expect(windowControls().setAlwaysOnTop(true)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.any(String), failure);
  });

  it('swallows and warns when the window handle cannot be created', async () => {
    isTauri.mockReturnValue(true);
    const failure = new Error('no window');
    getCurrentWindow.mockImplementation(() => {
      throw failure;
    });
    await expect(windowControls().setAlwaysOnTop(true)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.any(String), failure);
  });
});

describe('borderless, fullscreen, and dragging', () => {
  it('are no-ops in a plain browser', async () => {
    isTauri.mockReturnValue(false);
    const controls = windowControls();
    await expect(controls.setBorderless(true)).resolves.toBeUndefined();
    await expect(controls.setFullscreen(true)).resolves.toBeUndefined();
    await expect(controls.startDragging()).resolves.toBeUndefined();
    await expect(controls.isFullscreen()).resolves.toBeNull();
    expect(getCurrentWindow).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    [true, false],
    [false, true],
  ])('setBorderless(%s) calls setDecorations(%s)', async (on, decorations) => {
    isTauri.mockReturnValue(true);
    await windowControls().setBorderless(on);
    expect(setDecorations).toHaveBeenCalledExactlyOnceWith(decorations);
  });

  it.each([true, false])('setFullscreen(%s) passes the flag through', async (on) => {
    isTauri.mockReturnValue(true);
    await windowControls().setFullscreen(on);
    expect(setFullscreen).toHaveBeenCalledExactlyOnceWith(on);
  });

  it.each([true, false])('isFullscreen reports %s from the window', async (state) => {
    isTauri.mockReturnValue(true);
    isFullscreen.mockResolvedValue(state);
    await expect(windowControls().isFullscreen()).resolves.toBe(state);
  });

  it('startDragging asks the window to drag', async () => {
    isTauri.mockReturnValue(true);
    await windowControls().startDragging();
    expect(startDragging).toHaveBeenCalledOnce();
  });

  it('warns instead of throwing when a call is rejected', async () => {
    isTauri.mockReturnValue(true);
    const failure = new Error('denied');
    for (const fn of [setDecorations, setFullscreen, isFullscreen, startDragging]) {
      fn.mockRejectedValue(failure);
    }
    const controls = windowControls();
    await expect(controls.setBorderless(true)).resolves.toBeUndefined();
    await expect(controls.setFullscreen(true)).resolves.toBeUndefined();
    await expect(controls.isFullscreen()).resolves.toBeNull();
    await expect(controls.startDragging()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(4);
    expect(warn).toHaveBeenCalledWith(expect.any(String), failure);
  });
});
