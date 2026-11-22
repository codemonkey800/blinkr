import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { InitialState } from './app/devOverrides';
import { DEFAULT_SETTINGS, type Settings } from './settings/model';

const INTERVAL_S = 3;
const DURATION_S = 2;

function initialWith(patch: Partial<Settings> = {}): InitialState {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      interval: { value: INTERVAL_S, unit: 'seconds' },
      flashDurationSeconds: DURATION_S,
      ...patch,
    },
    autostart: false,
  };
}

function setup(patch: Partial<Settings> = {}) {
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  render(<App initial={initialWith(patch)} backend={null} />);
  return user;
}

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const flashLayer = () => screen.queryByTestId('flash-layer');
const openMenu = () =>
  fireEvent.contextMenu(screen.getByRole('main'), { clientX: 100, clientY: 80 });
const gear = () => screen.getByRole('button', { name: 'Settings' });
const panelPreview = () =>
  screen.getByRole('dialog').querySelector<HTMLButtonElement>('footer .btn:not(.primary)')!;

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

describe('preview flash', () => {
  it('flashes for the flash duration with the P key, then ends', async () => {
    const user = setup();
    expect(flashLayer()).toBeNull();
    await user.keyboard('p');
    expect(flashLayer()).not.toBeNull();
    advance(DURATION_S * 1000 - 1);
    expect(flashLayer()).not.toBeNull();
    advance(1);
    expect(flashLayer()).toBeNull();
  });

  it('also answers to a capital P', async () => {
    const user = setup();
    await user.keyboard('P');
    expect(flashLayer()).not.toBeNull();
  });

  it('plays with the current settings in the real window surface', async () => {
    const user = setup({ style: 'blink', intensity: 80, rate: 2, colors: ['#ff0000'] });
    await user.keyboard('p');
    const layer = flashLayer()!;
    expect(screen.getByTestId('flash-surface').contains(layer)).toBe(true);
    expect(layer.classList.contains('flash-layer--blink')).toBe(true);
    expect(layer.style.getPropertyValue('--flash-peak')).toBe('0.8');
    expect(layer.style.getPropertyValue('--flash-period')).toBe('0.5s');
    expect(layer.style.getPropertyValue('--flash-color')).toBe('#ff0000');
  });

  it('uses the flash duration setting for the length', async () => {
    const user = setup({ flashDurationSeconds: 5 });
    await user.keyboard('p');
    advance(4999);
    expect(flashLayer()).not.toBeNull();
    advance(1);
    expect(flashLayer()).toBeNull();
  });

  it('does not start the timer', async () => {
    const user = setup();
    await user.keyboard('p');
    advance(DURATION_S * 1000);
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
    advance(60_000);
    expect(flashLayer()).toBeNull();
  });

  it('restarts the preview when pressed again', async () => {
    const user = setup();
    await user.keyboard('p');
    const first = flashLayer();
    advance(1500);
    await user.keyboard('p');
    const second = flashLayer();
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    // The first preview would have ended at 2 s. The restarted one runs a full 2 s from 1.5 s.
    advance(1000); // 2.5 s
    expect(flashLayer()).not.toBeNull();
    advance(999);
    expect(flashLayer()).not.toBeNull();
    advance(1); // 3.5 s
    expect(flashLayer()).toBeNull();
  });

  it('ignores key repeat', async () => {
    setup();
    fireEvent.keyDown(document, { key: 'p' });
    const first = flashLayer();
    advance(500);
    fireEvent.keyDown(document, { key: 'p', repeat: true });
    expect(flashLayer()).toBe(first);
  });

  it('ignores P with a modifier and P typed into a field', async () => {
    const user = setup();
    await user.keyboard('{Control>}p{/Control}');
    await user.keyboard('{Meta>}p{/Meta}');
    expect(flashLayer()).toBeNull();
    await user.click(gear());
    await user.type(screen.getByLabelText('Interval'), 'p');
    expect(flashLayer()).toBeNull();
  });

  it('plays from the right-click menu and closes the menu', async () => {
    const user = setup();
    openMenu();
    const item = screen.getByRole('menuitem', { name: 'Preview flash' });
    expect(item).toHaveProperty('disabled', false);
    await user.click(item);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(flashLayer()).not.toBeNull();
    advance(DURATION_S * 1000);
    expect(flashLayer()).toBeNull();
  });

  it('plays from the panel button and leaves the panel open', async () => {
    const user = setup();
    await user.click(gear());
    await user.click(panelPreview());
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(flashLayer()).not.toBeNull();
    advance(DURATION_S * 1000);
    expect(flashLayer()).toBeNull();
  });

  it('previews the style, intensity, and rate edited in the panel', async () => {
    const user = setup();
    await user.click(gear());
    fireEvent.click(screen.getByRole('radio', { name: 'Hard blink' }));
    fireEvent.change(screen.getByLabelText('Intensity'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Rate'), { target: { value: '0.5' } });
    await user.click(panelPreview());
    const layer = flashLayer()!;
    expect(layer.classList.contains('flash-layer--blink')).toBe(true);
    expect(layer.style.getPropertyValue('--flash-peak')).toBe('0.4');
    expect(layer.style.getPropertyValue('--flash-period')).toBe('2s');
  });
});

describe('preview flash while a field is invalid', () => {
  it('disables the button and ignores the P key until the field is fixed', async () => {
    const user = setup();
    await user.click(gear());
    const duration = screen.getByLabelText('Flash duration');
    fireEvent.change(duration, { target: { value: '99' } });
    expect(panelPreview().disabled).toBe(true);

    // Move focus off the field so the key reaches the window.
    screen.getByRole('button', { name: 'Close settings' }).focus();
    await user.keyboard('p');
    expect(flashLayer()).toBeNull();

    fireEvent.change(duration, { target: { value: '3' } });
    expect(panelPreview().disabled).toBe(false);
    await user.keyboard('p');
    expect(flashLayer()).not.toBeNull();
  });

  it('is disabled for an invalid interval too', async () => {
    const user = setup();
    await user.click(gear());
    fireEvent.change(screen.getByLabelText('Interval'), { target: { value: '0' } });
    expect(panelPreview().disabled).toBe(true);
  });

  it('works again after closing a panel that held an invalid field', async () => {
    const user = setup();
    await user.click(gear());
    fireEvent.change(screen.getByLabelText('Flash duration'), { target: { value: '99' } });
    await user.click(screen.getByRole('button', { name: 'Close settings' }));
    await user.keyboard('p');
    expect(flashLayer()).not.toBeNull();
  });
});

describe('preview flash and the timer', () => {
  it('does not change the timer schedule', async () => {
    const user = setup();
    await user.keyboard(' ');
    // Idle for 3 s, flash from 3 s to 5 s. A preview in the first second must not shift that.
    advance(500);
    await user.keyboard('p');
    expect(flashLayer()).not.toBeNull();
    advance(DURATION_S * 1000); // preview ended at 2.5 s
    expect(flashLayer()).toBeNull();
    advance(499); // 2.999 s
    expect(flashLayer()).toBeNull();
    advance(1); // 3 s: the timer's own flash begins on schedule
    expect(flashLayer()).not.toBeNull();
    advance(1999);
    expect(flashLayer()).not.toBeNull();
    advance(1); // 5 s
    expect(flashLayer()).toBeNull();
    advance(3000); // the next flash comes 5 s after the last one began
    expect(flashLayer()).not.toBeNull();
  });

  it('leaves a running timer running', async () => {
    const user = setup();
    await user.keyboard(' ');
    await user.keyboard('p');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
  });

  it('gives way to the timer flash, which wins, and does not come back', async () => {
    const user = setup();
    await user.keyboard(' ');
    advance(2500);
    await user.keyboard('p'); // would run to 4.5 s
    const preview = flashLayer();
    expect(preview).not.toBeNull();
    advance(500); // 3 s: the timer's flash begins
    const timerLayer = flashLayer();
    expect(timerLayer).not.toBeNull();
    expect(timerLayer).not.toBe(preview);
    advance(1999); // 4.999 s, past when the preview would have ended
    expect(flashLayer()).toBe(timerLayer);
    advance(1); // 5 s: the timer's flash ends and nothing is left over
    expect(flashLayer()).toBeNull();
  });

  it('does not interrupt a timer flash that is already playing', async () => {
    const user = setup();
    await user.keyboard(' ');
    advance(3500);
    const timerLayer = flashLayer();
    expect(timerLayer).not.toBeNull();
    await user.keyboard('p');
    expect(flashLayer()).toBe(timerLayer);
    advance(1500); // 5 s
    expect(flashLayer()).toBeNull();
  });
});
