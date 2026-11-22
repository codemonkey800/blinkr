import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { DRAG_THRESHOLD_PX } from './app/useWindowDrag';
import type { InitialState } from './app/devOverrides';
import type { KeyValueBackend } from './persistence/settingsStore';
import type { WindowControls } from './platform/window';
import { DEFAULT_SETTINGS, type Settings } from './settings/model';
import { FULLSCREEN_RESYNC_MS } from './settings/useSettings';

const SAVE_MS = 300;

function memoryBackend(stored: Settings) {
  const data = new Map<string, unknown>([['settings', stored]]);
  const backend: KeyValueBackend & { data: Map<string, unknown> } = {
    data,
    get: async (key) => data.get(key),
    async set(key, value) {
      data.set(key, structuredClone(value));
    },
  };
  return backend;
}

function fakeControls(fullscreenNow: boolean | null = null) {
  const state = { fullscreen: fullscreenNow };
  const controls = {
    setAlwaysOnTop: vi.fn(async () => {}),
    setBorderless: vi.fn(async () => {}),
    setFullscreen: vi.fn(async () => {}),
    isFullscreen: vi.fn(async () => state.fullscreen),
    startDragging: vi.fn(async () => {}),
  } satisfies WindowControls;
  return { controls, state };
}

const settle = (ms = 0) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const main = () => screen.getByRole('main');
const dialog = () => screen.queryByRole('dialog', { name: 'Settings' });
const stored = (backend: ReturnType<typeof memoryBackend>) =>
  backend.data.get('settings') as Settings;

async function setup(patch: Partial<Settings> = {}, fullscreenNow: boolean | null = null) {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...patch };
  const initial: InitialState = { settings, autostart: false };
  const backend = memoryBackend(settings);
  const { controls, state } = fakeControls(fullscreenNow);
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  render(<App initial={initial} backend={backend} controls={controls} />);
  await settle();
  return { user, backend, controls, state };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('jest', { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('applying the window modes', () => {
  it('applies borderless and fullscreen on load', async () => {
    const { controls } = await setup({ borderless: true, fullscreen: true });
    expect(controls.setBorderless).toHaveBeenLastCalledWith(true);
    expect(controls.setFullscreen).toHaveBeenLastCalledWith(true);
  });

  it('starts bordered and windowed by default', async () => {
    const { controls } = await setup();
    expect(controls.setBorderless).toHaveBeenLastCalledWith(false);
    expect(controls.setFullscreen).toHaveBeenLastCalledWith(false);
  });

  it('applies and saves each toggle from the settings panel', async () => {
    const { user, backend, controls } = await setup();
    await user.keyboard('s');
    const borderless = screen.getByRole('switch', { name: 'Borderless' });
    const fullscreen = screen.getByRole('switch', { name: 'Fullscreen' });
    expect(borderless).toHaveProperty('checked', false);

    await user.click(borderless);
    expect(controls.setBorderless).toHaveBeenLastCalledWith(true);
    expect(controls.setFullscreen).toHaveBeenLastCalledWith(false);

    await user.click(fullscreen);
    expect(controls.setFullscreen).toHaveBeenLastCalledWith(true);

    await settle(SAVE_MS);
    expect(stored(backend)).toMatchObject({ borderless: true, fullscreen: true });

    await user.click(borderless);
    expect(controls.setBorderless).toHaveBeenLastCalledWith(false);
  });

  it('warns about Linux window managers in the borderless help', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    expect(screen.getByText(/some Linux window managers/)).toBeTruthy();
  });
});

describe('dragging a borderless window', () => {
  const press = (target: Element, x = 100, y = 100) =>
    fireEvent.pointerDown(target, {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      clientX: x,
      clientY: y,
    });
  const move = (x: number, y: number) =>
    fireEvent.pointerMove(document, { pointerId: 1, clientX: x, clientY: y });
  const release = () => fireEvent.pointerUp(document, { pointerId: 1 });

  it('starts dragging once the pointer moves past the threshold', async () => {
    const { controls } = await setup({ borderless: true });
    press(main());
    move(100 + DRAG_THRESHOLD_PX - 1, 100);
    expect(controls.startDragging).not.toHaveBeenCalled();
    move(100 + DRAG_THRESHOLD_PX, 100);
    expect(controls.startDragging).toHaveBeenCalledOnce();
    // The press is spent: more movement does not drag again.
    move(200, 200);
    expect(controls.startDragging).toHaveBeenCalledOnce();
  });

  it('measures the threshold as distance, not per axis', async () => {
    const { controls } = await setup({ borderless: true });
    press(main());
    move(103, 103);
    expect(controls.startDragging).toHaveBeenCalledOnce();
  });

  it('treats a plain click as a click: no drag, and the bar still reveals', async () => {
    const { user, controls } = await setup({ borderless: true });
    await user.keyboard(' ');
    const bar = screen.getByTestId('control-bar');
    expect(bar.getAttribute('data-visible')).toBe('false');

    press(main());
    move(101, 101);
    release();
    fireEvent.click(main());
    expect(controls.startDragging).not.toHaveBeenCalled();
    expect(bar.getAttribute('data-visible')).toBe('true');

    // Moving after the release is plain pointer movement, not a drag.
    move(300, 300);
    expect(controls.startDragging).not.toHaveBeenCalled();
  });

  it('never starts from Start, Stop, or Settings, or their descendants', async () => {
    const { controls } = await setup({ borderless: true });
    const start = screen.getByRole('button', { name: 'Start' });
    const gear = screen.getByRole('button', { name: 'Settings' });
    for (const target of [start, start.querySelector('svg')!, gear, gear.querySelector('svg')!]) {
      press(target);
      move(200, 200);
    }
    expect(controls.startDragging).not.toHaveBeenCalled();

    // Stop shows once running and the bar is revealed.
    fireEvent.click(start);
    fireEvent.pointerMove(main());
    press(screen.getByRole('button', { name: 'Stop' }));
    move(200, 200);
    expect(controls.startDragging).not.toHaveBeenCalled();
  });

  it('never starts from inside the settings panel', async () => {
    const { user, controls } = await setup({ borderless: true });
    await user.keyboard('s');
    press(dialog()!);
    move(200, 200);
    press(screen.getByLabelText('Interval'));
    move(300, 300);
    expect(controls.startDragging).not.toHaveBeenCalled();
  });

  it('ignores non-primary buttons', async () => {
    const { controls } = await setup({ borderless: true });
    fireEvent.pointerDown(main(), {
      button: 2,
      isPrimary: true,
      pointerId: 1,
      clientX: 0,
      clientY: 0,
    });
    move(50, 50);
    expect(controls.startDragging).not.toHaveBeenCalled();
  });

  it('does nothing when the window is not borderless', async () => {
    const { controls } = await setup({ borderless: false });
    press(main());
    move(200, 200);
    expect(controls.startDragging).not.toHaveBeenCalled();
  });

  it('abandons a press when borderless is turned off', async () => {
    const { user, controls } = await setup({ borderless: true });
    await user.keyboard('s');
    await user.click(screen.getByRole('switch', { name: 'Borderless' }));
    press(main());
    move(200, 200);
    expect(controls.startDragging).not.toHaveBeenCalled();
  });
});

describe('Escape and fullscreen', () => {
  it('leaves fullscreen and stores the change when settings are closed', async () => {
    const { user, backend, controls } = await setup({ fullscreen: true });
    expect(dialog()).toBeNull();
    await user.keyboard('{Escape}');
    expect(controls.setFullscreen).toHaveBeenLastCalledWith(false);
    await settle(SAVE_MS);
    expect(stored(backend).fullscreen).toBe(false);
  });

  it('closes the panel first and stays fullscreen while settings are open', async () => {
    const { user, controls } = await setup({ fullscreen: true });
    await user.keyboard('s');
    expect(dialog()).not.toBeNull();
    await user.keyboard('{Escape}');
    expect(controls.setFullscreen).not.toHaveBeenCalledWith(false);
    // The panel is still sliding out, which does not count as closed.
    await user.keyboard('{Escape}');
    expect(controls.setFullscreen).not.toHaveBeenCalledWith(false);
    await settle(600);
    expect(dialog()).toBeNull();
    await user.keyboard('{Escape}');
    expect(controls.setFullscreen).toHaveBeenLastCalledWith(false);
  });

  it('closes the context menu first', async () => {
    const { user, controls } = await setup({ fullscreen: true });
    fireEvent.contextMenu(main(), { clientX: 10, clientY: 10 });
    expect(screen.getByRole('menu')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(controls.setFullscreen).not.toHaveBeenCalledWith(false);
  });

  it('does nothing when not fullscreen', async () => {
    const { user, controls, backend } = await setup();
    await user.keyboard('{Escape}');
    expect(controls.setFullscreen).toHaveBeenCalledTimes(1);
    expect(stored(backend).fullscreen).toBe(false);
  });
});

describe('leaving fullscreen through the OS', () => {
  const resize = () => act(() => void fireEvent(window, new Event('resize')));

  it('follows the window once it stops resizing', async () => {
    const { backend, controls, state } = await setup({ fullscreen: true }, true);
    controls.setFullscreen.mockClear();
    state.fullscreen = false;
    resize();
    await settle(FULLSCREEN_RESYNC_MS - 1);
    expect(controls.isFullscreen).not.toHaveBeenCalled();
    await settle(1);
    expect(controls.isFullscreen).toHaveBeenCalledOnce();
    expect(controls.setFullscreen).toHaveBeenLastCalledWith(false);
    await settle(SAVE_MS);
    expect(stored(backend).fullscreen).toBe(false);
  });

  it('waits out a burst of resizes and reads fullscreen once', async () => {
    const { controls, state } = await setup({ fullscreen: true }, true);
    state.fullscreen = true;
    for (let i = 0; i < 5; i++) {
      resize();
      await settle(FULLSCREEN_RESYNC_MS / 2);
    }
    expect(controls.isFullscreen).not.toHaveBeenCalled();
    await settle(FULLSCREEN_RESYNC_MS);
    expect(controls.isFullscreen).toHaveBeenCalledOnce();
  });

  it('leaves the setting alone when the window agrees', async () => {
    const { backend, controls, state } = await setup({ fullscreen: true }, true);
    controls.setFullscreen.mockClear();
    state.fullscreen = true;
    resize();
    await settle(FULLSCREEN_RESYNC_MS + SAVE_MS);
    expect(controls.setFullscreen).not.toHaveBeenCalled();
    expect(stored(backend).fullscreen).toBe(true);
  });

  it('follows the window into fullscreen as well', async () => {
    const { controls, state } = await setup({ fullscreen: false }, false);
    state.fullscreen = true;
    resize();
    await settle(FULLSCREEN_RESYNC_MS);
    expect(controls.setFullscreen).toHaveBeenLastCalledWith(true);
  });

  it('does not overwrite the setting when the state is unknown (plain browser)', async () => {
    const { controls } = await setup({ fullscreen: true }, null);
    controls.setFullscreen.mockClear();
    resize();
    await settle(FULLSCREEN_RESYNC_MS + SAVE_MS);
    expect(controls.isFullscreen).toHaveBeenCalledOnce();
    expect(controls.setFullscreen).not.toHaveBeenCalled();
  });
});
