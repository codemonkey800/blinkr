import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App, { BAR_IDLE_MS } from './App';
import type { InitialState } from './app/devOverrides';
import type { KeyValueBackend } from './persistence/settingsStore';
import type { WindowControls } from './platform/window';
import { DEFAULT_SETTINGS, type Settings } from './settings/model';

const INTERVAL_S = 3;
const DURATION_S = 2;
const SAVE_MS = 300;

const initial: InitialState = {
  settings: {
    ...DEFAULT_SETTINGS,
    interval: { value: INTERVAL_S, unit: 'seconds' },
    flashDurationSeconds: DURATION_S,
  },
  autostart: false,
};

function memoryBackend(stored?: unknown) {
  const data = new Map<string, unknown>();
  if (stored !== undefined) data.set('settings', stored);
  const backend: KeyValueBackend & { data: Map<string, unknown>; writes: number } = {
    data,
    writes: 0,
    get: async (key) => data.get(key),
    async set(key, value) {
      backend.writes += 1;
      data.set(key, structuredClone(value));
    },
  };
  return backend;
}

type MemoryBackend = ReturnType<typeof memoryBackend>;

function fakeControls() {
  const setAlwaysOnTop = vi.fn<(on: boolean) => Promise<void>>(async () => {});
  const controls: WindowControls = {
    setAlwaysOnTop,
    setBorderless: async () => {},
    setFullscreen: async () => {},
    isFullscreen: async () => null,
    startDragging: async () => {},
  };
  return { controls, setAlwaysOnTop };
}

const settle = (ms = 0) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

interface SetupOptions {
  state?: InitialState;
  backend?: MemoryBackend | null;
}

async function setup({ state = initial, backend }: SetupOptions = {}) {
  // Stored settings replace the starting ones, so seed the store with them.
  const store = backend === undefined ? memoryBackend(state.settings) : backend;
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  const { controls, setAlwaysOnTop } = fakeControls();
  render(<App initial={state} backend={store} controls={controls} />);
  await settle();
  // Tests that turn storage off never read the backend back.
  return { user, backend: store as MemoryBackend, setAlwaysOnTop };
}

const main = () => screen.getByRole('main');
const bar = () => screen.getByTestId('control-bar');
const barVisible = () => bar().getAttribute('data-visible') === 'true';
// jsdom does not reflect the inert property, so read the attribute.
const barInert = () => bar().hasAttribute('inert');
const dialog = () => screen.queryByRole('dialog', { name: 'Settings' });
const gear = () => screen.getByRole('button', { name: 'Settings' });
const intervalInput = () => screen.getByLabelText('Interval');
const unitSelect = () => screen.getByLabelText('Interval unit');
const durationInput = () => screen.getByLabelText('Flash duration');
const startButton = () => within(screen.getByRole('dialog')).getByRole('button', { name: 'Start' });
const stored = (backend: ReturnType<typeof memoryBackend>) =>
  backend.data.get('settings') as Settings | undefined;
const flashLayer = () => screen.queryByTestId('flash-layer');
// The panel stays in the DOM while it slides out, so presence is not the same as open.
const panelEl = () => document.querySelector<HTMLElement>('.panel');
const isClosing = () => panelEl()?.getAttribute('data-state') === 'closing';
const EXIT_FALLBACK_MS = 500;

function animationEvent(type: string, animationName: string, target: Element = panelEl()!) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { animationName });
  act(() => void target.dispatchEvent(event));
}
const finishExit = () => animationEvent('animationend', 'panel-out');
const BAR_EXIT_FALLBACK_MS = 400;

function transitionEvent(type: string, propertyName: string, target: Element = bar()) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { propertyName });
  act(() => void target.dispatchEvent(event));
}
const finishBarFade = () => transitionEvent('transitionend', 'opacity');

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

async function replaceText(
  user: ReturnType<typeof userEvent.setup>,
  el: HTMLElement,
  text: string,
) {
  await user.clear(el);
  if (text !== '') await user.type(el, text);
}

function openContextMenu(x = 100, y = 80) {
  fireEvent.contextMenu(main(), { clientX: x, clientY: y });
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

describe('opening the panel', () => {
  it('opens from the gear button and moves focus into the panel', async () => {
    const { user } = await setup();
    expect(dialog()).toBeNull();
    await user.click(gear());
    expect(dialog()).not.toBeNull();
    expect(document.activeElement).toBe(intervalInput());
  });

  it('opens with the S key', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    expect(dialog()).not.toBeNull();
    expect(document.activeElement).toBe(intervalInput());
  });

  it('opens from Open settings in the right-click menu', async () => {
    const { user } = await setup();
    openContextMenu();
    await user.click(screen.getByRole('menuitem', { name: /Open settings/ }));
    expect(dialog()).not.toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not open from a click on the empty window', async () => {
    const { user } = await setup();
    await user.click(main());
    await user.click(screen.getByTestId('flash-surface'));
    expect(dialog()).toBeNull();
  });

  it('does not open while typing the letter s in a field', async () => {
    const { user } = await setup();
    await user.click(gear());
    await user.type(durationInput(), 's');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('hides the control bar while the panel is open and until it has finished closing', async () => {
    const { user } = await setup();
    expect(bar().hidden).toBe(false);
    await user.keyboard('s');
    finishBarFade();
    expect(bar().hidden).toBe(true);
    expect(bar().getAttribute('data-visible')).toBe('false');
    await user.keyboard('{Escape}');
    // Still sliding out: the controls would otherwise show under the panel's edge.
    expect(isClosing()).toBe(true);
    expect(bar().hidden).toBe(true);
    expect(bar().getAttribute('data-visible')).toBe('false');
    finishExit();
    expect(bar().hidden).toBe(false);
    expect(bar().getAttribute('data-visible')).toBe('true');
  });

  it('shows the control bar at once under reduced motion', async () => {
    stubReducedMotion(true);
    const { user } = await setup();
    await user.keyboard('s');
    await user.keyboard('{Escape}');
    expect(dialog()).toBeNull();
    expect(bar().hidden).toBe(false);
    expect(bar().getAttribute('data-visible')).toBe('true');
  });

  it('keeps a running timer hidden when the pointer moves while the panel slides out', async () => {
    const { user } = await setup({ state: { ...initial, autostart: true } });
    await user.keyboard('s');
    await user.keyboard('{Escape}');
    fireEvent.pointerMove(main());
    finishExit();
    expect(bar().hidden).toBe(false);
    expect(bar().getAttribute('data-visible')).toBe('false');
    fireEvent.pointerMove(main());
    expect(bar().getAttribute('data-visible')).toBe('true');
  });

  it('opening while running leaves the timer running', async () => {
    const { user } = await setup({ state: { ...initial, autostart: true } });
    await user.keyboard('s');
    expect(dialog()).not.toBeNull();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Stop' })).toBeTruthy();
    await settle(INTERVAL_S * 1000);
    expect(flashLayer()).not.toBeNull();
  });
});

describe('closing the panel', () => {
  it('closes on Escape and returns focus to the keyboard-focused gear once the panel is gone', async () => {
    const { user } = await setup();
    act(() => gear().focus());
    await user.keyboard('{Enter}');
    expect(dialog()).not.toBeNull();
    await user.keyboard('{Escape}');
    // The gear is hidden while the panel slides out, so the window holds focus until it is back.
    expect(isClosing()).toBe(true);
    expect(document.activeElement).toBe(main());
    finishExit();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(gear());
  });

  it('still returns focus to the gear after a reopen and a second close mid-exit', async () => {
    const { user } = await setup();
    act(() => gear().focus());
    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');
    await user.keyboard('s');
    expect(isClosing()).toBe(false);
    await user.keyboard('{Escape}');
    finishExit();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(gear());
  });

  it('closes with the close button and returns focus to the window after a pointer open', async () => {
    const { user } = await setup();
    await user.click(gear());
    await user.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(document.activeElement).toBe(main());
    expect(isClosing()).toBe(true);
    finishExit();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(main());
  });

  it('closes on a click outside the panel', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.click(screen.getByTestId('flash-surface'));
    expect(isClosing()).toBe(true);
    finishExit();
    expect(dialog()).toBeNull();
  });

  it('stays open for a click inside the panel', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.click(screen.getByText('Always on top'));
    await user.click(screen.getByRole('heading', { name: 'Settings' }));
    expect(dialog()).not.toBeNull();
    expect(isClosing()).toBe(false);
  });

  it('closes when the timer starts from the panel, and starts the timer at once', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.click(startButton());
    // The timer is running while the panel is still sliding out.
    expect(isClosing()).toBe(true);
    expect(dialog()).not.toBeNull();
    expect(bar().getAttribute('data-visible')).toBe('false');
    finishExit();
    expect(dialog()).toBeNull();
    await settle(INTERVAL_S * 1000);
    expect(flashLayer()).not.toBeNull();
  });

  it('does not delay or reset the schedule while the panel slides out', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.click(startButton());
    // The slide never ends, so only the fallback removes the panel.
    await settle(INTERVAL_S * 1000 - 1);
    expect(flashLayer()).toBeNull();
    expect(dialog()).toBeNull();
    await settle(1);
    expect(flashLayer()).not.toBeNull();
  });

  it('closes when the timer starts with Space', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    // Focus on the panel's own controls would press them, so send Space from the window.
    act(() => (document.activeElement as HTMLElement).blur());
    await user.keyboard(' ');
    expect(isClosing()).toBe(true);
    finishExit();
    expect(dialog()).toBeNull();
    await settle(INTERVAL_S * 1000);
    expect(flashLayer()).not.toBeNull();
  });

  it('closes when the timer starts from the right-click menu', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    openContextMenu();
    await user.click(screen.getByRole('menuitem', { name: /Start timer/ }));
    expect(isClosing()).toBe(true);
    finishExit();
    expect(dialog()).toBeNull();
  });

  it('Stop in the panel stops the timer and leaves the panel open', async () => {
    const { user } = await setup({ state: { ...initial, autostart: true } });
    await user.keyboard('s');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Stop' }));
    expect(dialog()).not.toBeNull();
    expect(isClosing()).toBe(false);
    expect(startButton()).toBeTruthy();
  });
});

describe('panel exit lifecycle', () => {
  it('stays mounted until its own exit animation ends', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.keyboard('{Escape}');
    expect(dialog()).not.toBeNull();
    await settle(EXIT_FALLBACK_MS - 1);
    expect(dialog()).not.toBeNull();
    finishExit();
    expect(dialog()).toBeNull();
  });

  it('ignores descendant and unrelated animation events', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.keyboard('{Escape}');
    const child = screen.getByRole('button', { name: 'Close settings' });
    animationEvent('animationend', 'panel-out', child);
    animationEvent('animationend', 'panel-in');
    animationEvent('animationend', 'something-else');
    animationEvent('transitionend', 'panel-out');
    expect(dialog()).not.toBeNull();
    finishExit();
    expect(dialog()).toBeNull();
  });

  it('treats a cancelled exit animation as finished', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.keyboard('{Escape}');
    animationEvent('animationcancel', 'panel-out');
    expect(dialog()).toBeNull();
  });

  it('removes the panel after a fallback delay if no completion event arrives', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.keyboard('{Escape}');
    await settle(EXIT_FALLBACK_MS);
    expect(dialog()).toBeNull();
  });

  it('removes the panel at once under reduced motion', async () => {
    stubReducedMotion(true);
    const { user } = await setup();
    await user.keyboard('s');
    await user.keyboard('{Escape}');
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(main());
  });

  it('still waits for the slide when reduced motion is off', async () => {
    stubReducedMotion(false);
    const { user } = await setup();
    await user.keyboard('s');
    await user.keyboard('{Escape}');
    expect(dialog()).not.toBeNull();
  });

  it('ignores repeated closes', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.keyboard('{Escape}');
    const el = panelEl();
    await user.keyboard('{Escape}{Escape}');
    await user.click(screen.getByTestId('flash-surface'));
    expect(panelEl()).toBe(el);
    expect(isClosing()).toBe(true);
    await settle(EXIT_FALLBACK_MS - 1);
    expect(dialog()).not.toBeNull();
    finishExit();
    expect(dialog()).toBeNull();
    // Nothing is left to complete, and a late event does not matter.
    await settle(EXIT_FALLBACK_MS);
    expect(dialog()).toBeNull();
  });

  it('closes during entry like any other close', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    // The entry animation is still running: its end has not been seen.
    await user.keyboard('{Escape}');
    expect(isClosing()).toBe(true);
    animationEvent('animationend', 'panel-in');
    expect(dialog()).not.toBeNull();
    finishExit();
    expect(dialog()).toBeNull();
  });

  it('reopens the same panel during exit, and a stale completion does not remove it', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    const el = panelEl();
    await user.keyboard('{Escape}');
    await settle(100);
    await user.keyboard('s');
    expect(panelEl()).toBe(el);
    expect(isClosing()).toBe(false);
    expect(document.activeElement).toBe(intervalInput());
    // Still covered: inert and, once its fade is over, gone.
    expect(barInert()).toBe(true);
    finishBarFade();
    expect(bar().hidden).toBe(true);
    // The old exit's cancel and end events, and its fallback timer, all arrive late.
    animationEvent('animationcancel', 'panel-out');
    finishExit();
    await settle(EXIT_FALLBACK_MS * 2);
    expect(panelEl()).toBe(el);
    expect(dialog()).not.toBeNull();
    // A new close works normally.
    await user.keyboard('{Escape}');
    expect(isClosing()).toBe(true);
    finishExit();
    expect(dialog()).toBeNull();
  });

  it('gives the fallback a fresh start after a reopen and second close', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.keyboard('{Escape}');
    await settle(EXIT_FALLBACK_MS - 100);
    await user.keyboard('s');
    await user.keyboard('{Escape}');
    await settle(EXIT_FALLBACK_MS - 1);
    expect(dialog()).not.toBeNull();
    await settle(1);
    expect(dialog()).toBeNull();
  });

  it('continues the slide from where it was, with no jump, when it is interrupted', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    const el = panelEl()!;
    const right = vi.spyOn(el, 'getBoundingClientRect');
    right.mockReturnValue({ right: 940 } as DOMRect);
    vi.spyOn(el.parentElement!, 'getBoundingClientRect').mockReturnValue({
      right: 760,
    } as DOMRect);
    await user.keyboard('{Escape}');
    expect(el.style.getPropertyValue('--panel-from')).toBe('180px');
    right.mockReturnValue({ right: 800 } as DOMRect);
    await user.keyboard('s');
    expect(el.style.getPropertyValue('--panel-from')).toBe('40px');
  });

  it('makes the closing panel inert and a reopen interactive again', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.keyboard('{Escape}');
    expect(panelEl()?.hasAttribute('inert')).toBe(true);
    expect(panelEl()?.contains(document.activeElement)).toBe(false);
    await user.keyboard('s');
    expect(panelEl()?.hasAttribute('inert')).toBe(false);
  });

  it('does not leave focus inside the closing panel when the saved target is gone', async () => {
    const { user } = await setup();
    openContextMenu();
    await user.click(screen.getByRole('menuitem', { name: /Open settings/ }));
    expect(document.activeElement).toBe(intervalInput());
    await user.keyboard('{Escape}');
    expect(panelEl()?.contains(document.activeElement)).toBe(false);
  });

  it('removes the panel when the app unmounts mid-exit without errors', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.keyboard('{Escape}');
    cleanup();
    await settle(EXIT_FALLBACK_MS * 2);
    expect(panelEl()).toBeNull();
  });
});

describe('right-click menu', () => {
  it('lists the four items, with Preview flash enabled', async () => {
    await setup();
    openContextMenu();
    const menu = screen.getByRole('menu', { name: 'Window menu' });
    const names = Array.from(menu.querySelectorAll('button')).map((el) =>
      el.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(names).toEqual(['Open settings S', 'Start timer Space', 'Preview flash', 'Keep on top']);
    expect(within(menu).getByRole('menuitem', { name: 'Preview flash' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('starts and stops the timer', async () => {
    const { user } = await setup();
    openContextMenu();
    await user.click(screen.getByRole('menuitem', { name: /Start timer/ }));
    expect(screen.queryByRole('menu')).toBeNull();
    await settle(INTERVAL_S * 1000);
    expect(flashLayer()).not.toBeNull();
    openContextMenu();
    await user.click(screen.getByRole('menuitem', { name: /Stop timer/ }));
    expect(flashLayer()).toBeNull();
  });

  it('toggles Keep on top through the adapter and saves it', async () => {
    const { user, backend, setAlwaysOnTop } = await setup();
    openContextMenu();
    expect(screen.getByRole('menuitemcheckbox', { name: /Keep on top/ })).toHaveProperty(
      'ariaChecked',
      'false',
    );
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Keep on top/ }));
    expect(setAlwaysOnTop).toHaveBeenLastCalledWith(true);
    await settle(SAVE_MS);
    expect(stored(backend)?.alwaysOnTop).toBe(true);
    openContextMenu();
    expect(
      screen.getByRole('menuitemcheckbox', { name: /Keep on top/ }).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('moves with the arrow keys and closes on Escape', async () => {
    const { user } = await setup();
    openContextMenu();
    const items = Array.from(
      screen.getByRole('menu').querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    );
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[1]);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(document.activeElement).toBe(items.at(-1));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(main());
  });

  it('closes on a click elsewhere', async () => {
    const { user } = await setup();
    openContextMenu();
    await user.click(screen.getByTestId('flash-surface'));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('validation', () => {
  const INTERVAL_ERROR = 'Interval must be between 1 second and 24 hours.';
  const DURATION_ERROR = 'Flash duration must be between 0.5 and 30 seconds.';

  it('has no errors and an enabled Start with the defaults', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    expect(intervalInput().getAttribute('aria-invalid')).toBe('false');
    expect(intervalInput().hasAttribute('aria-describedby')).toBe(false);
    expect(durationInput().getAttribute('aria-invalid')).toBe('false');
    expect(startButton()).toHaveProperty('disabled', false);
    expect(screen.queryByText('Fix the highlighted fields to start.')).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['zero', '0'],
    ['below one second', '0.5'],
    ['negative', '-3'],
    ['above 24 hours in seconds', '86401'],
  ])('flags a %s interval and disables Start', async (_name, text) => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.selectOptions(unitSelect(), 'seconds');
    await replaceText(user, intervalInput(), text);

    expect(intervalInput().getAttribute('aria-invalid')).toBe('true');
    const describedBy = intervalInput().getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toBe(INTERVAL_ERROR);
    expect(startButton()).toHaveProperty('disabled', true);
    expect(screen.getByText('Fix the highlighted fields to start.')).toBeTruthy();
    expect(durationInput().getAttribute('aria-invalid')).toBe('false');
  });

  it('flags an interval over 24 hours in hours', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.selectOptions(unitSelect(), 'hours');
    await replaceText(user, intervalInput(), '25');
    expect(screen.getByText(INTERVAL_ERROR)).toBeTruthy();
    expect(startButton()).toHaveProperty('disabled', true);
  });

  it.each([
    ['empty', ''],
    ['below the minimum', '0.4'],
    ['above the maximum', '31'],
    ['zero', '0'],
  ])('flags a %s flash duration and disables Start', async (_name, text) => {
    const { user } = await setup();
    await user.keyboard('s');
    await replaceText(user, durationInput(), text);

    expect(durationInput().getAttribute('aria-invalid')).toBe('true');
    const describedBy = durationInput().getAttribute('aria-describedby');
    expect(document.getElementById(describedBy as string)?.textContent).toBe(DURATION_ERROR);
    expect(startButton()).toHaveProperty('disabled', true);
    expect(intervalInput().getAttribute('aria-invalid')).toBe('false');
  });

  it('accepts the limits exactly', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.selectOptions(unitSelect(), 'seconds');
    await replaceText(user, intervalInput(), '1');
    await replaceText(user, durationInput(), '0.5');
    expect(startButton()).toHaveProperty('disabled', false);
    await replaceText(user, durationInput(), '30');
    expect(startButton()).toHaveProperty('disabled', false);
    await user.selectOptions(unitSelect(), 'hours');
    await replaceText(user, intervalInput(), '24');
    expect(startButton()).toHaveProperty('disabled', false);
  });

  it('clears the errors and re-enables Start once both fields are fixed', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await replaceText(user, intervalInput(), '0');
    await replaceText(user, durationInput(), '99');
    expect(startButton()).toHaveProperty('disabled', true);
    await replaceText(user, intervalInput(), '5');
    expect(startButton()).toHaveProperty('disabled', true);
    await replaceText(user, durationInput(), '4');
    expect(startButton()).toHaveProperty('disabled', false);
    expect(screen.queryByText(INTERVAL_ERROR)).toBeNull();
    expect(screen.queryByText(DURATION_ERROR)).toBeNull();
  });

  it('does not start from the panel while invalid, and Stop is never disabled', async () => {
    const { user } = await setup({ state: { ...initial, autostart: true } });
    await user.keyboard('s');
    await replaceText(user, intervalInput(), '0');
    const stop = within(screen.getByRole('dialog')).getByRole('button', { name: 'Stop' });
    expect(stop).toHaveProperty('disabled', false);
    expect(screen.queryByText('Fix the highlighted fields to start.')).toBeNull();
    await user.click(stop);
    expect(startButton()).toHaveProperty('disabled', true);
  });

  it('starts over from the saved values after closing with an invalid draft', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await replaceText(user, intervalInput(), '0');
    await user.keyboard('{Escape}');
    finishExit();
    expect(dialog()).toBeNull();
    await user.keyboard('s');
    expect((intervalInput() as HTMLInputElement).value).toBe(String(INTERVAL_S));
    expect(startButton()).toHaveProperty('disabled', false);
  });

  it('keeps the draft when the panel is reopened before its exit finishes', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await replaceText(user, intervalInput(), '0');
    await user.keyboard('{Escape}');
    // Focus left the field, so the S key opens settings again instead of typing.
    await user.keyboard('s');
    expect((intervalInput() as HTMLInputElement).value).toBe('0');
    expect(startButton()).toHaveProperty('disabled', true);
    await user.keyboard('{Escape}');
    finishExit();
    await user.keyboard('s');
    expect((intervalInput() as HTMLInputElement).value).toBe(String(INTERVAL_S));
  });
});

describe('saving', () => {
  it('saves a valid edit once, after the debounce', async () => {
    const { user, backend } = await setup();
    await user.keyboard('s');
    await user.selectOptions(unitSelect(), 'minutes');
    await replaceText(user, intervalInput(), '15');
    await replaceText(user, durationInput(), '4');

    expect(backend.writes).toBe(0);
    await settle(SAVE_MS - 1);
    expect(backend.writes).toBe(0);
    await settle(1);
    expect(backend.writes).toBe(1);
    expect(stored(backend)).toMatchObject({
      interval: { value: 15, unit: 'minutes' },
      flashDurationSeconds: 4,
    });
  });

  it('never saves an invalid value', async () => {
    const { user, backend } = await setup();
    await user.keyboard('s');
    await replaceText(user, intervalInput(), '0');
    await replaceText(user, durationInput(), '0.4');
    await settle(SAVE_MS * 3);
    expect(backend.writes).toBe(0);

    await replaceText(user, intervalInput(), '7');
    await replaceText(user, durationInput(), '');
    await settle(SAVE_MS);
    expect(stored(backend)?.interval).toEqual({ value: 7, unit: 'seconds' });
    expect(stored(backend)?.flashDurationSeconds).toBe(DURATION_S);
  });

  it('does not write anything for the settings it just loaded', async () => {
    const backend = memoryBackend({ ...DEFAULT_SETTINGS, alwaysOnTop: true });
    await setup({ backend });
    await settle(SAVE_MS * 2);
    expect(backend.writes).toBe(0);
  });

  it('flushes a pending save on pagehide without waiting', async () => {
    const { user, backend } = await setup();
    await user.keyboard('s');
    await replaceText(user, durationInput(), '6');
    expect(backend.writes).toBe(0);
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(stored(backend)?.flashDurationSeconds).toBe(6);
  });

  it('writes nothing when storage is turned off', async () => {
    const { user } = await setup({ backend: null });
    await user.keyboard('s');
    await replaceText(user, durationInput(), '6');
    await settle(SAVE_MS * 2);
    expect(screen.getByLabelText('Flash duration')).toHaveProperty('value', '6');
  });
});

describe('stored settings', () => {
  const custom: Settings = {
    ...DEFAULT_SETTINGS,
    interval: { value: 20, unit: 'minutes' },
    flashDurationSeconds: 5,
    colors: ['#ff0000', '#00ff00'],
    idleColor: '#102030',
    alwaysOnTop: true,
  };

  it('applies stored settings once they load', async () => {
    const { user } = await setup({ backend: memoryBackend(custom) });
    expect(screen.getByTestId('flash-surface').style.backgroundColor).toBe('rgb(16, 32, 48)');
    await user.keyboard('s');
    expect((intervalInput() as HTMLInputElement).value).toBe('20');
    expect((unitSelect() as HTMLSelectElement).value).toBe('minutes');
    expect((durationInput() as HTMLInputElement).value).toBe('5');
    expect(screen.getByLabelText('Color 1')).toHaveProperty('value', '#ff0000');
    expect(screen.getByLabelText('Color 2')).toHaveProperty('value', '#00ff00');
    expect(screen.getByLabelText('Idle color')).toHaveProperty('value', '#102030');
    expect(screen.getByRole('switch', { name: 'Always on top' })).toHaveProperty('checked', true);
  });

  it('renders the idle surface before the stored settings arrive', async () => {
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const { controls } = fakeControls();
    render(<App initial={initial} backend={memoryBackend(custom)} controls={controls} />);
    expect(screen.getByTestId('flash-surface').style.backgroundColor).toBe('rgb(27, 30, 37)');
    expect(user).toBeTruthy();
    await settle();
    expect(screen.getByTestId('flash-surface').style.backgroundColor).toBe('rgb(16, 32, 48)');
  });

  it('falls back to defaults for missing and invalid stored fields', async () => {
    const { user } = await setup({
      backend: memoryBackend({
        interval: { value: 0, unit: 'seconds' },
        idleColor: '#102030',
        junk: 1,
      }),
    });
    await user.keyboard('s');
    expect((intervalInput() as HTMLInputElement).value).toBe('10');
    expect((unitSelect() as HTMLSelectElement).value).toBe('minutes');
    expect(screen.getByLabelText('Idle color')).toHaveProperty('value', '#102030');
  });

  it('starts stopped even with stored settings', async () => {
    await setup({ backend: memoryBackend(custom) });
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
    expect(flashLayer()).toBeNull();
  });

  it('keeps an edit made before the stored settings arrived', async () => {
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const { controls } = fakeControls();
    const backend = memoryBackend(custom);
    render(<App initial={initial} backend={backend} controls={controls} />);
    await user.keyboard('s');
    await replaceText(user, durationInput(), '9');
    await settle(SAVE_MS);
    expect(stored(backend)?.flashDurationSeconds).toBe(9);
  });
});

describe('always on top', () => {
  it('applies the stored value through the adapter at load', async () => {
    const { setAlwaysOnTop } = await setup({
      backend: memoryBackend({ ...DEFAULT_SETTINGS, alwaysOnTop: true }),
    });
    expect(setAlwaysOnTop).toHaveBeenLastCalledWith(true);
  });

  it('applies the switch in the panel through the adapter and saves it', async () => {
    const { user, backend, setAlwaysOnTop } = await setup();
    expect(setAlwaysOnTop).toHaveBeenLastCalledWith(false);
    await user.keyboard('s');
    await user.click(screen.getByRole('switch', { name: 'Always on top' }));
    expect(setAlwaysOnTop).toHaveBeenLastCalledWith(true);
    await settle(SAVE_MS);
    expect(stored(backend)?.alwaysOnTop).toBe(true);
    await user.click(screen.getByRole('switch', { name: 'Always on top' }));
    expect(setAlwaysOnTop).toHaveBeenLastCalledWith(false);
  });
});

describe('colors', () => {
  const colorInputs = () => screen.getAllByLabelText(/^Color \d$/);
  const addButton = () => screen.getByRole('button', { name: 'Add color' });

  it('starts with one color and no remove button', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    expect(colorInputs()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Remove color/ })).toBeNull();
    expect(screen.getByText('1 of 6')).toBeTruthy();
  });

  it('adds up to 6 colors, then disables Add', async () => {
    const { user, backend } = await setup();
    await user.keyboard('s');
    for (let count = 2; count <= 6; count += 1) {
      await user.click(addButton());
      expect(colorInputs()).toHaveLength(count);
      expect(screen.getByText(`${count} of 6`)).toBeTruthy();
    }
    expect(addButton()).toHaveProperty('disabled', true);
    await user.click(addButton());
    expect(colorInputs()).toHaveLength(6);
    // Each new color is different from the others.
    expect(new Set(colorInputs().map((el) => (el as HTMLInputElement).value)).size).toBe(6);
    await settle(SAVE_MS);
    expect(stored(backend)?.colors).toHaveLength(6);
  });

  it('focuses the new color after adding', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.click(addButton());
    expect(document.activeElement).toBe(screen.getByLabelText('Color 2'));
  });

  it('removes down to 1 color, then hides Remove', async () => {
    const { user, backend } = await setup();
    await user.keyboard('s');
    for (let i = 0; i < 5; i += 1) await user.click(addButton());
    expect(colorInputs()).toHaveLength(6);

    for (let count = 5; count >= 1; count -= 1) {
      await user.click(screen.getByRole('button', { name: 'Remove color 1' }));
      expect(colorInputs()).toHaveLength(count);
    }
    expect(screen.queryByRole('button', { name: /^Remove color/ })).toBeNull();
    expect(addButton()).toHaveProperty('disabled', false);
    await settle(SAVE_MS);
    expect(stored(backend)?.colors).toHaveLength(1);
  });

  it('removes the chosen color and focuses its neighbor', async () => {
    const { user, backend } = await setup();
    await user.keyboard('s');
    await user.click(addButton());
    await user.click(addButton());
    const [first, , third] = colorInputs().map((el) => (el as HTMLInputElement).value);
    await user.click(screen.getByRole('button', { name: 'Remove color 2' }));
    expect(colorInputs().map((el) => (el as HTMLInputElement).value)).toEqual([first, third]);
    expect(document.activeElement).toBe(screen.getByLabelText('Color 1'));
    await settle(SAVE_MS);
    expect(stored(backend)?.colors).toEqual([first, third]);
  });

  it('edits a color and the idle color', async () => {
    const { user, backend } = await setup();
    await user.keyboard('s');
    fireEvent.change(screen.getByLabelText('Color 1'), { target: { value: '#123456' } });
    fireEvent.change(screen.getByLabelText('Idle color'), { target: { value: '#654321' } });
    expect(screen.getByTestId('flash-surface').style.backgroundColor).toBe('rgb(101, 67, 33)');
    await settle(SAVE_MS);
    expect(stored(backend)?.colors).toEqual(['#123456']);
    expect(stored(backend)?.idleColor).toBe('#654321');
  });
});

describe('timing changes while running', () => {
  it('restarts the schedule from now when the interval changes', async () => {
    const { user } = await setup({ state: { ...initial, autostart: true } });
    await settle(2000);
    await user.keyboard('s');
    await user.selectOptions(unitSelect(), 'seconds');
    await replaceText(user, intervalInput(), '10');
    await user.keyboard('{Escape}');

    // The original schedule would have flashed 1 s from now.
    await settle(9_000);
    expect(flashLayer()).toBeNull();
    await settle(1_000);
    expect(flashLayer()).not.toBeNull();
    await settle(DURATION_S * 1000);
    expect(flashLayer()).toBeNull();
  });

  it('restarts when the flash duration changes', async () => {
    const { user } = await setup({ state: { ...initial, autostart: true } });
    await settle(INTERVAL_S * 1000 + 500);
    expect(flashLayer()).not.toBeNull();
    await user.keyboard('s');
    await replaceText(user, durationInput(), '1');
    // A restart goes back to waiting, so the flash in progress ends.
    expect(flashLayer()).toBeNull();
    await settle(INTERVAL_S * 1000);
    expect(flashLayer()).not.toBeNull();
  });

  it('does not restart for an invalid value', async () => {
    const { user } = await setup({ state: { ...initial, autostart: true } });
    await settle(2000);
    await user.keyboard('s');
    await replaceText(user, intervalInput(), '0');
    await settle(1000);
    expect(flashLayer()).not.toBeNull();
  });

  it('does not restart when only colors change', async () => {
    const { user } = await setup({ state: { ...initial, autostart: true } });
    await settle(2000);
    await user.keyboard('s');
    await user.click(screen.getByRole('button', { name: 'Add color' }));
    await settle(1000);
    expect(flashLayer()).not.toBeNull();
  });
});

describe('control bar exit', () => {
  const openers: [string, (user: ReturnType<typeof userEvent.setup>) => Promise<void>][] = [
    ['the gear', (user) => user.click(gear())],
    ['the S key', (user) => user.keyboard('s')],
    [
      'the context menu',
      async (user) => {
        openContextMenu();
        await user.click(screen.getByRole('menuitem', { name: /Open settings/ }));
      },
    ],
  ];

  it.each(openers)(
    'opening from %s opens the panel at once and fades the bar out',
    async (_, open) => {
      const { user } = await setup();
      await open(user);
      // The drawer does not wait for the bar.
      expect(dialog()).not.toBeNull();
      expect(isClosing()).toBe(false);
      // The bar is still rendered, so its fade can run, but it takes no input.
      expect(bar().hidden).toBe(false);
      expect(bar().getAttribute('data-visible')).toBe('false');
      expect(bar().getAttribute('data-covered')).toBe('true');
      expect(barInert()).toBe(true);
      expect(bar().getAttribute('aria-hidden')).toBe('true');
      expect(bar().contains(document.activeElement)).toBe(false);
      expect(document.activeElement).toBe(intervalInput());
      finishBarFade();
      expect(bar().hidden).toBe(true);
      expect(dialog()).not.toBeNull();
    },
  );

  it('removes the bar when the fade never reports completion, after the fallback delay', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await settle(BAR_EXIT_FALLBACK_MS - 1);
    expect(bar().hidden).toBe(false);
    await settle(1);
    expect(bar().hidden).toBe(true);
  });

  it('ignores transition events that are not the bar fading its opacity', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    transitionEvent('transitionend', 'opacity', bar().querySelector('button')!);
    transitionEvent('transitionend', 'background-color');
    expect(bar().hidden).toBe(false);
    finishBarFade();
    expect(bar().hidden).toBe(true);
  });

  it('also finishes when the fade is cancelled', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    transitionEvent('transitioncancel', 'opacity');
    expect(bar().hidden).toBe(true);
  });

  it('keeps the bar covered through the drawer exit, then returns it', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    finishBarFade();
    await user.keyboard('{Escape}');
    expect(isClosing()).toBe(true);
    expect(bar().hidden).toBe(true);
    expect(barInert()).toBe(true);
    await settle(EXIT_FALLBACK_MS - 1);
    expect(bar().hidden).toBe(true);
    finishExit();
    expect(bar().hidden).toBe(false);
    expect(barInert()).toBe(false);
    expect(bar().hasAttribute('aria-hidden')).toBe(false);
    expect(barVisible()).toBe(true);
  });

  it('is removed from the window again by a second open after returning', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    finishBarFade();
    await user.keyboard('{Escape}');
    finishExit();
    expect(bar().hidden).toBe(false);
    await user.keyboard('s');
    expect(bar().hidden).toBe(false);
    expect(barInert()).toBe(true);
    finishBarFade();
    expect(bar().hidden).toBe(true);
  });

  it('does not let a stale fallback timer hide a bar that was uncovered and covered again', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await settle(50);
    await user.keyboard('{Escape}');
    // The panel leaves before the first fade would have timed out.
    finishExit();
    expect(bar().hidden).toBe(false);
    expect(barInert()).toBe(false);
    expect(barVisible()).toBe(true);
    await settle(50);
    await user.keyboard('s');
    // The first exit's timer would have fired here. The second exit's has not.
    await settle(BAR_EXIT_FALLBACK_MS - 100 + 10);
    expect(bar().hidden).toBe(false);
    expect(barInert()).toBe(true);
    await settle(100);
    expect(bar().hidden).toBe(true);
  });

  it('does not let a stale transition end hide an uncovered bar', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    await user.keyboard('{Escape}');
    finishExit();
    expect(barVisible()).toBe(true);
    finishBarFade();
    await settle(BAR_EXIT_FALLBACK_MS * 2);
    expect(bar().hidden).toBe(false);
    expect(barVisible()).toBe(true);
  });

  it('stays covered across a reopen mid drawer exit without restarting or finishing early', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    finishBarFade();
    await user.keyboard('{Escape}');
    await settle(100);
    await user.keyboard('s');
    expect(bar().hidden).toBe(true);
    expect(barInert()).toBe(true);
    await settle(EXIT_FALLBACK_MS * 2);
    expect(bar().hidden).toBe(true);
  });

  it('removes the bar at once under reduced motion, with no event to wait for', async () => {
    stubReducedMotion(true);
    const { user } = await setup();
    await user.keyboard('s');
    expect(bar().hidden).toBe(true);
    expect(barInert()).toBe(true);
    expect(dialog()).not.toBeNull();
    await user.keyboard('{Escape}');
    expect(bar().hidden).toBe(false);
    expect(barVisible()).toBe(true);
  });

  it('fades out a bar that was running and only held by the pointer, the same way', async () => {
    const { user } = await setup({ state: { ...initial, autostart: true } });
    fireEvent.pointerMove(main());
    expect(barVisible()).toBe(true);
    await user.keyboard('s');
    expect(bar().hidden).toBe(false);
    expect(barInert()).toBe(true);
    expect(barVisible()).toBe(false);
    // The idle timer is gone, so the bar cannot come back while the panel is open.
    await settle(BAR_IDLE_MS * 2);
    fireEvent.pointerMove(main());
    expect(barVisible()).toBe(false);
    expect(bar().hidden).toBe(true);
  });

  it('survives the window closing during the fade', async () => {
    const { user } = await setup();
    await user.keyboard('s');
    cleanup();
    await settle(BAR_EXIT_FALLBACK_MS * 2);
  });
});
