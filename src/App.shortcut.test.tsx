import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { applyGlobalShortcut } = vi.hoisted(() => ({ applyGlobalShortcut: vi.fn() }));

vi.mock('./platform/shortcut', () => ({ applyGlobalShortcut }));

import App from './App';
import type { WindowControls } from './platform/window';
import { DEFAULT_SETTINGS, type Settings } from './settings/model';

const FAILURE = "Couldn't register this shortcut. Another app may be using it.";

const controls: WindowControls = {
  setAlwaysOnTop: async () => {},
  setBorderless: async () => {},
  setFullscreen: async () => {},
  isFullscreen: async () => null,
  startDragging: async () => {},
};

const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));

async function setup(patch: Partial<Settings> = {}) {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...patch };
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  render(<App initial={{ settings, autostart: false }} backend={null} controls={controls} />);
  await settle();
  return { user };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('jest', { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) });
  applyGlobalShortcut.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('global shortcut in the app', () => {
  it('applies Off on load', async () => {
    await setup();
    expect(applyGlobalShortcut).toHaveBeenCalledTimes(1);
    expect(applyGlobalShortcut).toHaveBeenLastCalledWith(null, expect.any(Function));
  });

  it('applies the stored accelerator on load', async () => {
    await setup({ globalShortcut: 'CommandOrControl+Alt+B' });
    expect(applyGlobalShortcut).toHaveBeenLastCalledWith(
      'CommandOrControl+Alt+B',
      expect.any(Function),
    );
  });

  it('starts and stops like Space, without re-registering', async () => {
    await setup({ globalShortcut: 'CommandOrControl+Alt+B' });
    const hotkey = applyGlobalShortcut.mock.calls[0][1] as () => void;
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
    act(() => hotkey());
    await settle();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    act(() => hotkey());
    await settle();
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
    expect(applyGlobalShortcut).toHaveBeenCalledTimes(1);
  });

  it('applies a choice made in the settings panel', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.selectOptions(screen.getByLabelText('Global start and stop shortcut'), [
      'CommandOrControl+Shift+B',
    ]);
    await settle();
    expect(applyGlobalShortcut).toHaveBeenLastCalledWith(
      'CommandOrControl+Shift+B',
      expect.any(Function),
    );
    await user.selectOptions(screen.getByLabelText('Global start and stop shortcut'), ['Off']);
    await settle();
    expect(applyGlobalShortcut).toHaveBeenLastCalledWith(null, expect.any(Function));
  });

  it('shows the failure message in the panel, and clears it on the next success', async () => {
    applyGlobalShortcut.mockResolvedValue({ ok: false, reason: FAILURE });
    const { user } = await setup({ globalShortcut: 'CommandOrControl+Alt+B' });
    await user.keyboard('s');
    expect(screen.getByText(FAILURE)).toBeTruthy();

    applyGlobalShortcut.mockResolvedValue({ ok: true });
    await user.selectOptions(screen.getByLabelText('Global start and stop shortcut'), ['Off']);
    await settle();
    expect(screen.queryByText(FAILURE)).toBeNull();
  });

  it('shows the desktop-only message from the browser fallback', async () => {
    applyGlobalShortcut.mockResolvedValue({
      ok: false,
      reason: 'Available in the desktop app only.',
    });
    const { user } = await setup({ globalShortcut: 'CommandOrControl+Alt+B' });
    await user.keyboard('s');
    expect(screen.getByText('Available in the desktop app only.')).toBeTruthy();
    expect(screen.queryByText(FAILURE)).toBeNull();
  });
});
