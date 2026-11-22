import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { InitialState } from './app/devOverrides';
import type { KeyValueBackend } from './persistence/settingsStore';
import type { WindowControls } from './platform/window';
import { MAX_PRESETS, presetValuesFrom, type Preset } from './presets/presets';
import { DEFAULT_SETTINGS, type Settings } from './settings/model';

const INTERVAL_S = 3;
const DURATION_S = 2;
const SAVE_MS = 300;

const base: Settings = {
  ...DEFAULT_SETTINGS,
  interval: { value: INTERVAL_S, unit: 'seconds' },
  flashDurationSeconds: DURATION_S,
};
const initial: InitialState = { settings: base, autostart: false };

const slow: Preset = {
  id: 'slow',
  name: 'Slow',
  values: presetValuesFrom({
    ...base,
    interval: { value: 10, unit: 'seconds' },
    flashDurationSeconds: 1,
    colors: ['#ff0000', '#00ff00'],
    style: 'blink',
    intensity: 40,
    rate: 2,
    idleColor: '#101010',
  }),
};
// Same timing as the starting settings, so applying it can only restart on purpose.
const same: Preset = { id: 'same', name: 'Same', values: presetValuesFrom(base) };

function memoryBackend(settings: Settings, presets?: Preset[]) {
  const data = new Map<string, unknown>([['settings', settings]]);
  if (presets) data.set('presets', presets);
  const backend: KeyValueBackend & { data: Map<string, unknown> } = {
    data,
    get: async (key) => data.get(key),
    async set(key, value) {
      data.set(key, structuredClone(value));
    },
  };
  return backend;
}

const controls: WindowControls = {
  setAlwaysOnTop: async () => {},
  setBorderless: async () => {},
  setFullscreen: async () => {},
  isFullscreen: async () => null,
  startDragging: async () => {},
};

const settle = (ms = 0) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

async function setup(presets?: Preset[], state: InitialState = initial) {
  const backend = memoryBackend(state.settings, presets);
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  render(<App initial={state} backend={backend} controls={controls} />);
  await settle();
  await user.keyboard('s');
  await settle();
  return { user, backend };
}

const picker = () => screen.getByLabelText('Preset') as HTMLSelectElement;
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const maybeButton = (name: string) => screen.queryByRole('button', { name });
const nameInput = () => screen.getByRole('textbox') as HTMLInputElement;
const storedPresets = (backend: { data: Map<string, unknown> }) =>
  backend.data.get('presets') as Preset[] | undefined;
const storedSettings = (backend: { data: Map<string, unknown> }) =>
  backend.data.get('settings') as Settings;
const optionNames = () => Array.from(picker().options).map((o) => o.textContent);
const flashLayer = () => screen.queryByTestId('flash-layer');

async function saveAs(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(button('Save as new'));
  await user.clear(nameInput());
  if (name) await user.type(nameInput(), name);
  await user.click(button('Save preset'));
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

describe('preset picker', () => {
  it('sits above the timing group and lists saved presets', async () => {
    await setup([slow, same]);
    const groups = Array.from(document.querySelectorAll('.panel .body > *')).map((el) =>
      el.getAttribute('aria-label'),
    );
    expect(groups.slice(0, 2)).toEqual(['Presets', 'Timing']);
    expect(optionNames()).toEqual(['No preset', 'Slow', 'Same']);
    expect(picker().value).toBe('');
    expect(button('Rename').disabled).toBe(true);
    expect(button('Delete').disabled).toBe(true);
  });

  it('says there are none saved when the list is empty', async () => {
    await setup();
    expect(optionNames()).toEqual(['No saved presets']);
  });

  it('applies the preset values to the fields and to storage', async () => {
    const { user, backend } = await setup([slow]);
    await user.selectOptions(picker(), 'slow');
    await settle(SAVE_MS);

    expect((screen.getByLabelText('Interval') as HTMLInputElement).value).toBe('10');
    expect((screen.getByLabelText('Flash duration') as HTMLInputElement).value).toBe('1');
    expect(screen.getAllByLabelText(/^Color \d$/)).toHaveLength(2);
    expect(storedSettings(backend)).toMatchObject({ ...slow.values });
    expect(button('Rename').disabled).toBe(false);
    expect(screen.queryByText('Modified')).toBeNull();
  });

  it('leaves window settings alone when applying', async () => {
    const state = { ...initial, settings: { ...base, alwaysOnTop: true, borderless: true } };
    const { user, backend } = await setup([slow], state);
    await user.selectOptions(picker(), 'slow');
    await settle(SAVE_MS);
    expect(storedSettings(backend)).toMatchObject({ alwaysOnTop: true, borderless: true });
  });

  it('clears an invalid field when a preset is applied', async () => {
    const { user } = await setup([slow]);
    await user.clear(screen.getByLabelText('Interval'));
    expect(screen.getByText(/Interval must be between/)).toBeTruthy();
    await user.selectOptions(picker(), 'slow');
    expect(screen.queryByText(/Interval must be between/)).toBeNull();
    expect((screen.getByLabelText('Interval') as HTMLInputElement).value).toBe('10');
  });

  it('choosing no preset keeps the values and clears the selection', async () => {
    const { user } = await setup([slow]);
    await user.selectOptions(picker(), 'slow');
    await user.selectOptions(picker(), '');
    expect(picker().value).toBe('');
    expect((screen.getByLabelText('Interval') as HTMLInputElement).value).toBe('10');
    expect(button('Rename').disabled).toBe(true);
  });
});

describe('save as new', () => {
  it('asks for a name inline, without window.prompt', async () => {
    const prompt = vi.fn();
    vi.stubGlobal('prompt', prompt);
    const { user } = await setup();
    await user.click(button('Save as new'));
    expect(nameInput()).toBe(document.activeElement);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('saves the current values under the trimmed name and selects it', async () => {
    const { user, backend } = await setup();
    await user.type(screen.getByLabelText('Interval'), '0');
    await saveAs(user, '  Desk break ');
    await settle();

    const saved = storedPresets(backend);
    expect(saved).toHaveLength(1);
    expect(saved?.[0]).toMatchObject({
      name: 'Desk break',
      values: { ...presetValuesFrom(base), interval: { value: 30, unit: 'seconds' } },
    });
    expect(saved?.[0]?.id).toBeTruthy();
    expect(optionNames()).toEqual(['No preset', 'Desk break']);
    expect(picker().selectedOptions[0]?.textContent).toBe('Desk break');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText('Modified')).toBeNull();
  });

  it('submits with Enter and cancels with Escape without closing the panel', async () => {
    const { user, backend } = await setup();
    await user.click(button('Save as new'));
    await user.type(nameInput(), 'Quick{Enter}');
    await settle();
    expect(storedPresets(backend)?.map((p) => p.name)).toEqual(['Quick']);

    await user.click(button('Save as new'));
    await user.type(nameInput(), 'Never{Escape}');
    await settle();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();
    expect(storedPresets(backend)?.map((p) => p.name)).toEqual(['Quick']);
  });

  it('cancels with the Cancel button', async () => {
    const { user, backend } = await setup();
    await user.click(button('Save as new'));
    await user.type(nameInput(), 'Nope');
    await user.click(button('Cancel'));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(storedPresets(backend)).toBeUndefined();
  });

  it('refuses an empty name and a name over 40 characters', async () => {
    const { user, backend } = await setup();
    await user.click(button('Save as new'));
    await user.click(button('Save preset'));
    expect(screen.getByText('Enter a name.')).toBeTruthy();
    expect(nameInput().getAttribute('aria-invalid')).toBe('true');

    await user.type(nameInput(), 'x'.repeat(41));
    expect(screen.getByText('Names can be up to 40 characters.')).toBeTruthy();
    await user.click(button('Save preset'));
    expect(storedPresets(backend)).toBeUndefined();

    await user.clear(nameInput());
    await user.type(nameInput(), 'x'.repeat(40));
    expect(screen.queryByText(/up to 40 characters/)).toBeNull();
    await user.click(button('Save preset'));
    await settle();
    expect(storedPresets(backend)?.[0]?.name).toBe('x'.repeat(40));
  });

  it('shows an inline error for a duplicate name, without regard to case', async () => {
    const { user, backend } = await setup([slow]);
    await user.click(button('Save as new'));
    await user.type(nameInput(), ' sLOW ');
    expect(screen.getByText('A preset with this name already exists.')).toBeTruthy();
    expect(nameInput().getAttribute('aria-describedby')).toBe(
      screen.getByText('A preset with this name already exists.').closest('p')?.id,
    );
    await user.click(button('Save preset'));
    expect(storedPresets(backend)).toEqual([slow]);
    expect(screen.getByRole('textbox')).toBeTruthy();

    await user.clear(nameInput());
    await user.type(nameInput(), 'Slower');
    expect(screen.queryByText(/already exists/)).toBeNull();
  });
});

describe('the 20 preset limit', () => {
  const many = (n: number): Preset[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      name: `Preset ${i}`,
      values: slow.values,
    }));

  it('allows the 20th preset', async () => {
    const { user, backend } = await setup(many(MAX_PRESETS - 1));
    expect(button('Save as new').disabled).toBe(false);
    await saveAs(user, 'Last one');
    await settle();
    expect(storedPresets(backend)).toHaveLength(MAX_PRESETS);
  });

  it('disables Save as new at 20 and says why', async () => {
    const { user } = await setup(many(MAX_PRESETS));
    const save = button('Save as new');
    expect(save.disabled).toBe(true);
    const reason = screen.getByText(/You can save up to 20 presets/);
    expect(save.getAttribute('aria-describedby')).toBe(reason.id);
    expect(save.title).toMatch(/up to 20 presets/);
    await user.click(save);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('frees the button again once one is deleted', async () => {
    const { user } = await setup(many(MAX_PRESETS));
    await user.selectOptions(picker(), 'p3');
    await user.click(button('Delete'));
    expect(button('Save as new').disabled).toBe(false);
    expect(screen.queryByText(/You can save up to 20 presets/)).toBeNull();
  });
});

describe('rename and delete', () => {
  it('renames the selected preset in place', async () => {
    const { user, backend } = await setup([slow, same]);
    await user.selectOptions(picker(), 'same');
    await user.click(button('Rename'));
    expect(nameInput().value).toBe('Same');
    await user.clear(nameInput());
    await user.type(nameInput(), 'Steady');
    await user.click(button('Rename preset'));
    await settle();

    expect(storedPresets(backend)?.map((p) => [p.id, p.name])).toEqual([
      ['slow', 'Slow'],
      ['same', 'Steady'],
    ]);
    expect(picker().value).toBe('same');
    expect(optionNames()).toEqual(['No preset', 'Slow', 'Steady']);
  });

  it('lets a preset be renamed to a different case of its own name', async () => {
    const { user, backend } = await setup([slow]);
    await user.selectOptions(picker(), 'slow');
    await user.click(button('Rename'));
    await user.clear(nameInput());
    await user.type(nameInput(), 'SLOW');
    expect(screen.queryByText(/already exists/)).toBeNull();
    await user.click(button('Rename preset'));
    await settle();
    expect(storedPresets(backend)?.[0]?.name).toBe('SLOW');
  });

  it('shows the duplicate error when renaming onto another preset', async () => {
    const { user, backend } = await setup([slow, same]);
    await user.selectOptions(picker(), 'same');
    await user.click(button('Rename'));
    await user.clear(nameInput());
    await user.type(nameInput(), 'slow');
    expect(screen.getByText('A preset with this name already exists.')).toBeTruthy();
    await user.click(button('Rename preset'));
    await settle();
    expect(storedPresets(backend)).toEqual([slow, same]);
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('deletes the selected preset, keeps the values, and clears the selection', async () => {
    const { user, backend } = await setup([slow, same]);
    await user.selectOptions(picker(), 'slow');
    await user.click(button('Delete'));
    await settle();

    expect(storedPresets(backend)?.map((p) => p.id)).toEqual(['same']);
    expect(optionNames()).toEqual(['No preset', 'Same']);
    expect(picker().value).toBe('');
    expect((screen.getByLabelText('Interval') as HTMLInputElement).value).toBe('10');
    expect(button('Delete').disabled).toBe(true);
  });

  it('keeps the selection when a different preset is not the one deleted', async () => {
    const { user } = await setup([slow, same]);
    await user.selectOptions(picker(), 'same');
    await user.click(button('Delete'));
    expect(optionNames()).toEqual(['No preset', 'Slow']);
  });
});

describe('modified marker and Update preset', () => {
  it('marks a preset modified after an edit, without saving the edit to it', async () => {
    const { user, backend } = await setup([slow]);
    await user.selectOptions(picker(), 'slow');
    expect(screen.queryByText('Modified')).toBeNull();
    expect(maybeButton('Update preset')).toBeNull();

    await user.type(screen.getByLabelText('Interval'), '5');
    await settle(SAVE_MS);

    expect(screen.getByText('Modified')).toBeTruthy();
    expect(maybeButton('Update preset')).not.toBeNull();
    expect(picker().value).toBe('slow');
    // The setting is saved, the preset is not.
    expect(storedSettings(backend).interval).toEqual({ value: 105, unit: 'seconds' });
    expect(storedPresets(backend)).toEqual([slow]);
  });

  it('marks modified for edits to look fields too', async () => {
    const { user } = await setup([slow]);
    await user.selectOptions(picker(), 'slow');
    await user.click(screen.getByRole('radio', { name: 'Smooth pulse' }));
    expect(screen.getByText('Modified')).toBeTruthy();
  });

  it('does not mark modified for a window setting', async () => {
    const { user } = await setup([slow]);
    await user.selectOptions(picker(), 'slow');
    await user.click(screen.getByRole('switch', { name: 'Always on top' }));
    expect(screen.queryByText('Modified')).toBeNull();
  });

  it('clears the marker when the edit is undone', async () => {
    const { user } = await setup([slow]);
    await user.selectOptions(picker(), 'slow');
    await user.type(screen.getByLabelText('Interval'), '5');
    expect(screen.getByText('Modified')).toBeTruthy();
    await user.clear(screen.getByLabelText('Interval'));
    await user.type(screen.getByLabelText('Interval'), '10');
    expect(screen.queryByText('Modified')).toBeNull();
  });

  it('shows no marker when no preset is selected', async () => {
    const { user } = await setup([slow]);
    await user.type(screen.getByLabelText('Interval'), '5');
    expect(screen.queryByText('Modified')).toBeNull();
  });

  it('Update preset saves the current values over the selected preset', async () => {
    const { user, backend } = await setup([slow, same]);
    await user.selectOptions(picker(), 'slow');
    await user.type(screen.getByLabelText('Interval'), '5');
    await user.click(button('Update preset'));
    await settle();

    const saved = storedPresets(backend);
    expect(saved?.map((p) => p.id)).toEqual(['slow', 'same']);
    expect(saved?.[0]?.name).toBe('Slow');
    expect(saved?.[0]?.values).toMatchObject({
      interval: { value: 105, unit: 'seconds' },
      colors: ['#ff0000', '#00ff00'],
    });
    expect(saved?.[1]).toEqual(same);
    expect(screen.queryByText('Modified')).toBeNull();
    expect(maybeButton('Update preset')).toBeNull();
  });

  it('applying the preset again discards an unsaved edit', async () => {
    const { user } = await setup([slow, same]);
    await user.selectOptions(picker(), 'slow');
    await user.type(screen.getByLabelText('Interval'), '5');
    await user.selectOptions(picker(), 'same');
    await user.selectOptions(picker(), 'slow');
    expect((screen.getByLabelText('Interval') as HTMLInputElement).value).toBe('10');
    expect(screen.queryByText('Modified')).toBeNull();
  });

  it('cannot save while a field is invalid', async () => {
    const { user } = await setup([slow]);
    await user.selectOptions(picker(), 'slow');
    await user.type(screen.getByLabelText('Interval'), '5');
    await user.clear(screen.getByLabelText('Flash duration'));
    expect(button('Update preset').disabled).toBe(true);
    expect(button('Save as new').disabled).toBe(true);
    expect(button('Save as new').title).toMatch(/highlighted fields/);
  });
});

describe('applying while running', () => {
  it('restarts the timer from now, even when the timing is the same', async () => {
    const { user } = await setup([same], { ...initial, autostart: true });
    // The first flash is due INTERVAL_S after the start.
    await settle(2000);
    await user.selectOptions(picker(), 'same');

    // The original schedule would flash at 3 s, which is 1 s from now.
    await settle(1500);
    expect(flashLayer()).toBeNull();
    await settle(1500);
    expect(flashLayer()).not.toBeNull();
  });

  it('runs on the preset timing after the restart', async () => {
    const { user } = await setup([slow], { ...initial, autostart: true });
    await settle(2000);
    await user.selectOptions(picker(), 'slow');
    await settle(9_000);
    expect(flashLayer()).toBeNull();
    await settle(1_000);
    expect(flashLayer()).not.toBeNull();
    // The preset's flash is 1 s long.
    await settle(1_000);
    expect(flashLayer()).toBeNull();
  });

  it('ends a flash in progress', async () => {
    const { user } = await setup([same], { ...initial, autostart: true });
    await settle(INTERVAL_S * 1000 + 500);
    expect(flashLayer()).not.toBeNull();
    await user.selectOptions(picker(), 'same');
    expect(flashLayer()).toBeNull();
  });

  it('does not start a stopped timer', async () => {
    const { user } = await setup([same]);
    await user.selectOptions(picker(), 'same');
    await settle(INTERVAL_S * 1000 * 2);
    expect(flashLayer()).toBeNull();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Start' })).toBeTruthy();
  });

  it('does not restart when no preset is chosen', async () => {
    const { user } = await setup([same], { ...initial, autostart: true });
    await user.selectOptions(picker(), 'same');
    await settle(1000);
    await user.selectOptions(picker(), '');
    await settle(2000);
    expect(flashLayer()).not.toBeNull();
  });
});

describe('persistence across a reload', () => {
  it('shows presets saved earlier', async () => {
    const first = await setup();
    await saveAs(first.user, 'Kept');
    await settle();
    const saved = storedPresets(first.backend);
    cleanup();

    await setup(saved);
    expect(optionNames()).toEqual(['No preset', 'Kept']);
  });

  it('works with storage off', async () => {
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    render(<App initial={initial} backend={null} controls={controls} />);
    await settle();
    await user.keyboard('s');
    await settle();
    await saveAs(user, 'Memory only');
    expect(optionNames()).toEqual(['No preset', 'Memory only']);
  });
});
