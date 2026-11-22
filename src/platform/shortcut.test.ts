import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isTauri, register, unregister, isRegistered } = vi.hoisted(() => ({
  isTauri: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  isRegistered: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri }));
vi.mock('@tauri-apps/plugin-global-shortcut', () => ({ register, unregister, isRegistered }));

type Handler = (event: { shortcut: string; id: number; state: 'Pressed' | 'Released' }) => void;

const ALT_B = 'CommandOrControl+Alt+B';
const SHIFT_B = 'CommandOrControl+Shift+B';

async function freshModule() {
  vi.resetModules();
  return import('./shortcut');
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  isTauri.mockReset().mockReturnValue(true);
  register.mockReset().mockResolvedValue(undefined);
  unregister.mockReset().mockResolvedValue(undefined);
  isRegistered.mockReset().mockResolvedValue(false);
});

describe('applyGlobalShortcut', () => {
  it('registers the accelerator', async () => {
    const { applyGlobalShortcut } = await freshModule();
    expect(await applyGlobalShortcut(ALT_B, vi.fn())).toEqual({ ok: true });
    expect(register).toHaveBeenCalledWith(ALT_B, expect.any(Function));
    expect(unregister).not.toHaveBeenCalled();
  });

  it('unregisters the old accelerator when it changes', async () => {
    const { applyGlobalShortcut } = await freshModule();
    await applyGlobalShortcut(ALT_B, vi.fn());
    expect(await applyGlobalShortcut(SHIFT_B, vi.fn())).toEqual({ ok: true });
    expect(unregister).toHaveBeenCalledWith(ALT_B);
    expect(register).toHaveBeenLastCalledWith(SHIFT_B, expect.any(Function));
    expect(unregister.mock.invocationCallOrder[0]).toBeLessThan(
      register.mock.invocationCallOrder[1],
    );
  });

  it('unregisters when turned off', async () => {
    const { applyGlobalShortcut } = await freshModule();
    await applyGlobalShortcut(ALT_B, vi.fn());
    expect(await applyGlobalShortcut(null, vi.fn())).toEqual({ ok: true });
    expect(unregister).toHaveBeenCalledWith(ALT_B);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('does nothing when off and nothing is registered', async () => {
    const { applyGlobalShortcut } = await freshModule();
    expect(await applyGlobalShortcut(null, vi.fn())).toEqual({ ok: true });
    expect(unregister).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('clears a stale registration before registering', async () => {
    isRegistered.mockResolvedValue(true);
    const { applyGlobalShortcut } = await freshModule();
    expect(await applyGlobalShortcut(ALT_B, vi.fn())).toEqual({ ok: true });
    expect(unregister).toHaveBeenCalledWith(ALT_B);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('gives the failure message when registering fails, and does not throw', async () => {
    register.mockRejectedValue(new Error('already registered by another app'));
    const { applyGlobalShortcut, REGISTER_FAILED_MESSAGE } = await freshModule();
    expect(await applyGlobalShortcut(ALT_B, vi.fn())).toEqual({
      ok: false,
      reason: "Couldn't register this shortcut. Another app may be using it.",
    });
    expect(REGISTER_FAILED_MESSAGE).toBe(
      "Couldn't register this shortcut. Another app may be using it.",
    );
  });

  it('gives the failure message when unregistering fails', async () => {
    const { applyGlobalShortcut } = await freshModule();
    await applyGlobalShortcut(ALT_B, vi.fn());
    unregister.mockRejectedValue(new Error('boom'));
    const result = await applyGlobalShortcut(SHIFT_B, vi.fn());
    expect(result.ok).toBe(false);
  });

  it('recovers after a failure', async () => {
    register.mockRejectedValueOnce(new Error('taken'));
    const { applyGlobalShortcut } = await freshModule();
    expect((await applyGlobalShortcut(ALT_B, vi.fn())).ok).toBe(false);
    expect(await applyGlobalShortcut(SHIFT_B, vi.fn())).toEqual({ ok: true });
    // The failed one was never registered, so there is nothing of it to unregister.
    expect(unregister).not.toHaveBeenCalled();
  });

  it('toggles on press and ignores release', async () => {
    const onToggle = vi.fn();
    const { applyGlobalShortcut } = await freshModule();
    await applyGlobalShortcut(ALT_B, onToggle);
    const handler = register.mock.calls[0][1] as Handler;
    handler({ shortcut: ALT_B, id: 1, state: 'Released' });
    expect(onToggle).not.toHaveBeenCalled();
    handler({ shortcut: ALT_B, id: 1, state: 'Pressed' });
    handler({ shortcut: ALT_B, id: 1, state: 'Released' });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('runs overlapping calls in order', async () => {
    const { applyGlobalShortcut } = await freshModule();
    const first = applyGlobalShortcut(ALT_B, vi.fn());
    const second = applyGlobalShortcut(SHIFT_B, vi.fn());
    await Promise.all([first, second]);
    expect(register.mock.calls.map((call) => call[0])).toEqual([ALT_B, SHIFT_B]);
    expect(unregister).toHaveBeenCalledWith(ALT_B);
  });

  describe('in a plain browser', () => {
    beforeEach(() => isTauri.mockReturnValue(false));

    it('reports the desktop-only message instead of the failure message', async () => {
      const { applyGlobalShortcut } = await freshModule();
      expect(await applyGlobalShortcut(ALT_B, vi.fn())).toEqual({
        ok: false,
        reason: 'Available in the desktop app only.',
      });
    });

    it('does nothing for Off, and never calls Tauri', async () => {
      const { applyGlobalShortcut } = await freshModule();
      expect(await applyGlobalShortcut(null, vi.fn())).toEqual({ ok: true });
      expect(register).not.toHaveBeenCalled();
      expect(unregister).not.toHaveBeenCalled();
      expect(isRegistered).not.toHaveBeenCalled();
    });
  });
});
