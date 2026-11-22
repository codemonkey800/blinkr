import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App, { BAR_IDLE_MS } from './App';
import type { InitialState } from './app/devOverrides';
import { DEFAULT_SETTINGS } from './settings/model';

const INTERVAL_S = 3;
const DURATION_S = 2;

const initial: InitialState = {
  settings: {
    ...DEFAULT_SETTINGS,
    interval: { value: INTERVAL_S, unit: 'seconds' },
    flashDurationSeconds: DURATION_S,
  },
  autostart: false,
};

function setup() {
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  render(<App initial={initial} backend={null} />);
  return user;
}

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const bar = () => screen.getByTestId('control-bar');
const barVisible = () => bar().getAttribute('data-visible') === 'true';
const flashLayer = () => screen.queryByTestId('flash-layer');
const toggleButton = (name: 'Start' | 'Stop') => screen.getByRole('button', { name });
const gear = () => screen.getByRole('button', { name: 'Settings' });

/** Start with Space, then let the bar's hide state settle. */
async function startRunning(user: ReturnType<typeof setup>) {
  await user.keyboard(' ');
  expect(barVisible()).toBe(false);
}

beforeEach(() => {
  vi.useFakeTimers();
  // Testing Library only drains its own timers under fake timers when a `jest` global exists.
  vi.stubGlobal('jest', { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('App', () => {
  it('starts stopped, with the control bar showing Start and the gear', () => {
    setup();
    expect(barVisible()).toBe(true);
    expect(toggleButton('Start')).toBeTruthy();
    expect(gear()).toBeTruthy();
    expect(flashLayer()).toBeNull();
  });

  it('renders the flash surface full-window', () => {
    setup();
    expect(screen.getByTestId('flash-surface').style.backgroundColor).toBe('rgb(27, 30, 37)');
  });

  it('starts on Space, hides the bar, and renders nothing else', async () => {
    const user = setup();
    await startRunning(user);
    expect(flashLayer()).toBeNull();
    // No countdown or time: the only text is the (hidden) Stop button.
    expect(screen.getByRole('main').textContent).toBe('Stop');
  });

  it('reveals the bar with Stop on pointer movement and hides it after the idle delay', async () => {
    const user = setup();
    await startRunning(user);

    await user.pointer({ target: screen.getByRole('main'), coords: { clientX: 5, clientY: 5 } });
    expect(barVisible()).toBe(true);
    expect(toggleButton('Stop')).toBeTruthy();

    advance(BAR_IDLE_MS - 1);
    expect(barVisible()).toBe(true);
    advance(1);
    expect(barVisible()).toBe(false);
  });

  it('restarts the idle delay on each pointer movement', async () => {
    const user = setup();
    await startRunning(user);
    const main = screen.getByRole('main');

    fireEvent.pointerMove(main);
    advance(BAR_IDLE_MS - 500);
    fireEvent.pointerMove(main);
    advance(BAR_IDLE_MS - 500);
    expect(barVisible()).toBe(true);
    advance(500);
    expect(barVisible()).toBe(false);
  });

  it('hides the bar when the pointer leaves', async () => {
    const user = setup();
    await startRunning(user);
    const main = screen.getByRole('main');

    fireEvent.pointerMove(main);
    expect(barVisible()).toBe(true);
    fireEvent.pointerLeave(main);
    expect(barVisible()).toBe(false);
  });

  it('reveals the bar on a click and on Tab', async () => {
    const user = setup();
    await startRunning(user);

    fireEvent.click(screen.getByRole('main'));
    expect(barVisible()).toBe(true);
    advance(BAR_IDLE_MS);
    expect(barVisible()).toBe(false);

    await user.tab();
    expect(barVisible()).toBe(true);
  });

  it('stays up while a bar button has focus, then fades after it blurs', async () => {
    const user = setup();
    await startRunning(user);

    fireEvent.pointerMove(screen.getByRole('main'));
    act(() => toggleButton('Stop').focus());
    advance(BAR_IDLE_MS * 5);
    expect(barVisible()).toBe(true);

    fireEvent.pointerLeave(screen.getByRole('main'));
    expect(barVisible()).toBe(true);

    act(() => toggleButton('Stop').blur());
    expect(barVisible()).toBe(true);
    advance(BAR_IDLE_MS);
    expect(barVisible()).toBe(false);
  });

  it('keeps the bar buttons focusable while it is hidden', async () => {
    const user = setup();
    await startRunning(user);
    await user.tab();
    expect(document.activeElement).toBe(toggleButton('Stop'));
    expect(barVisible()).toBe(true);
  });

  it('toggles the timer with the Start and Stop buttons', async () => {
    const user = setup();

    await user.click(toggleButton('Start'));
    // A mouse start hides the bar at once, and the timer is running.
    expect(barVisible()).toBe(false);
    advance(INTERVAL_S * 1000);
    expect(flashLayer()).not.toBeNull();

    fireEvent.pointerMove(screen.getByRole('main'));
    await user.click(toggleButton('Stop'));
    expect(barVisible()).toBe(true);
    expect(toggleButton('Start')).toBeTruthy();
    expect(flashLayer()).toBeNull();
    advance(INTERVAL_S * 1000 * 3);
    expect(flashLayer()).toBeNull();
  });

  it('flashes after the interval and returns to idle after the duration, every cycle', async () => {
    const user = setup();
    await startRunning(user);

    advance(INTERVAL_S * 1000 - 1);
    expect(flashLayer()).toBeNull();
    advance(1);
    expect(flashLayer()).not.toBeNull();

    advance(DURATION_S * 1000 - 1);
    expect(flashLayer()).not.toBeNull();
    advance(1);
    expect(flashLayer()).toBeNull();

    // The interval is the idle time between flashes, so the next one starts a full interval later.
    advance(INTERVAL_S * 1000 - 1);
    expect(flashLayer()).toBeNull();
    advance(1);
    expect(flashLayer()).not.toBeNull();
    advance(DURATION_S * 1000);
    expect(flashLayer()).toBeNull();
  });

  it('keeps the flash layer under the control bar', async () => {
    const user = setup();
    await startRunning(user);
    advance(INTERVAL_S * 1000);
    const layer = screen.getByTestId('flash-layer');
    expect(layer.contains(bar())).toBe(false);
    expect(screen.getByRole('main').contains(bar())).toBe(true);
  });

  it('stops on Space', async () => {
    const user = setup();
    await startRunning(user);
    advance(INTERVAL_S * 1000);
    expect(flashLayer()).not.toBeNull();

    await user.keyboard(' ');
    expect(barVisible()).toBe(true);
    expect(toggleButton('Start')).toBeTruthy();
    expect(flashLayer()).toBeNull();
    advance(INTERVAL_S * 1000 * 3);
    expect(flashLayer()).toBeNull();
  });

  it('ignores Space typed in an input', async () => {
    const user = setup();
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();

    await user.keyboard(' ');
    expect(input.value).toBe(' ');
    expect(toggleButton('Start')).toBeTruthy();
    expect(barVisible()).toBe(true);
  });

  it('ignores Space typed in a textarea and a select', async () => {
    const user = setup();
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    document.body.append(textarea, select);

    textarea.focus();
    await user.keyboard(' ');
    select.focus();
    await user.keyboard(' ');
    expect(toggleButton('Start')).toBeTruthy();
  });

  it('presses a focused bar button once on Space, and keeps the bar up', async () => {
    const user = setup();
    act(() => toggleButton('Start').focus());

    await user.keyboard(' ');
    expect(toggleButton('Stop')).toBeTruthy();
    expect(barVisible()).toBe(true);

    await user.keyboard(' ');
    expect(toggleButton('Start')).toBeTruthy();
  });

  it('ignores Space with a modifier key held', async () => {
    const user = setup();
    await user.keyboard('{Control>} {/Control}');
    expect(toggleButton('Start')).toBeTruthy();
  });

  it('ignores a held-down Space', async () => {
    setup();
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(toggleButton('Stop')).toBeTruthy();
    fireEvent.keyDown(document.body, { key: ' ', repeat: true });
    expect(toggleButton('Stop')).toBeTruthy();
  });

  it('suppresses the context menu', () => {
    setup();
    expect(fireEvent.contextMenu(screen.getByRole('main'))).toBe(false);
  });

  it('starts at once with autostart', () => {
    render(<App initial={{ ...initial, autostart: true }} backend={null} />);
    expect(toggleButton('Stop')).toBeTruthy();
    expect(barVisible()).toBe(false);
    advance(INTERVAL_S * 1000);
    expect(flashLayer()).not.toBeNull();
  });

  it('labels the buttons with their shortcuts and never shows a countdown', () => {
    setup();
    expect(toggleButton('Start').getAttribute('title')).toBe('Start (Space)');
    expect(gear().getAttribute('title')).toBe('Settings (S)');
    expect(screen.getByRole('main').textContent).toBe('Start');
  });
});
