import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flashWarning, FlashSection, formatRate, type FlashFields } from './FlashSection';
import { DEFAULT_SETTINGS } from './model';

afterEach(cleanup);

const base: FlashFields = { style: 'pulse', intensity: 60, rate: 1 };

function renderSection(fields: Partial<FlashFields> = {}) {
  const onChange = vi.fn();
  const view = render(<FlashSection settings={{ ...base, ...fields }} onChange={onChange} />);
  return { ...view, onChange, fields: { ...base, ...fields } };
}

const warning = () => screen.getByRole('note');
const isStrong = () => warning().getAttribute('data-strong') === 'true';

const CALM = /Flashing can trigger seizures in people with photosensitive epilepsy/;

describe('photosensitivity warning', () => {
  it('is always visible, as a note, with the calm copy for the defaults', () => {
    renderSection({
      style: DEFAULT_SETTINGS.style,
      intensity: DEFAULT_SETTINGS.intensity,
      rate: DEFAULT_SETTINGS.rate,
    });
    expect(warning().textContent).toContain(
      'Flashing can trigger seizures in people with photosensitive epilepsy. Stop if anyone feels unwell.',
    );
    expect(isStrong()).toBe(false);
    expect(warning().textContent).not.toContain('Strong flashing');
  });

  it('is described by both sliders', () => {
    renderSection();
    const id = warning().id;
    expect(screen.getByLabelText('Intensity').getAttribute('aria-describedby')).toBe(id);
    expect(screen.getByLabelText('Rate').getAttribute('aria-describedby')).toBe(id);
  });

  describe('rate threshold', () => {
    it.each([0.25, 1, 2])('stays calm at %s per second', (rate) => {
      renderSection({ rate });
      expect(isStrong()).toBe(false);
      expect(warning().textContent).toMatch(CALM);
    });

    it.each([2.25, 2.5, 3])('turns strong above 2 per second, at %s', (rate) => {
      renderSection({ rate });
      expect(isStrong()).toBe(true);
      expect(warning().textContent).toContain('Strong flashing');
      expect(warning().textContent).toContain(
        'Rates above 2 per second are more likely to trigger seizures. Lower the rate.',
      );
    });
  });

  describe('blink intensity threshold', () => {
    it.each([10, 60, 70])('stays calm for a hard blink at %s%%', (intensity) => {
      renderSection({ style: 'blink', intensity });
      expect(isStrong()).toBe(false);
    });

    it.each([71, 75, 100])('turns strong for a hard blink at %s%%', (intensity) => {
      renderSection({ style: 'blink', intensity });
      expect(isStrong()).toBe(true);
      expect(warning().textContent).toContain(
        'Hard blinks above 70% are more likely to trigger seizures. Lower the intensity or switch to a smooth pulse.',
      );
    });

    it('stays calm for a smooth pulse at any intensity', () => {
      renderSection({ style: 'pulse', intensity: 100 });
      expect(isStrong()).toBe(false);
    });
  });

  it('has its own copy when the rate and the blink are both strong', () => {
    renderSection({ style: 'blink', intensity: 85, rate: 2.5 });
    expect(isStrong()).toBe(true);
    expect(warning().textContent).toContain(
      'Fast, hard blinking is more likely to trigger seizures. Lower the rate and intensity, or switch to a smooth pulse.',
    );
  });

  it('switches state as the sliders move', () => {
    const { rerender, onChange } = renderSection();
    expect(isStrong()).toBe(false);
    rerender(<FlashSection settings={{ ...base, rate: 2.5 }} onChange={onChange} />);
    expect(isStrong()).toBe(true);
    rerender(<FlashSection settings={{ ...base, rate: 2 }} onChange={onChange} />);
    expect(isStrong()).toBe(false);
  });

  it('flashWarning agrees with the strong flag for each state', () => {
    expect(flashWarning(base)).toEqual({ strong: false, body: expect.stringMatching(CALM) });
    expect(flashWarning({ ...base, rate: 2.25 }).strong).toBe(true);
    expect(flashWarning({ style: 'blink', intensity: 75, rate: 1 }).title).toBe('Strong flashing');
  });
});

describe('sliders', () => {
  it('bounds and steps the intensity slider at 10 to 100 percent', () => {
    renderSection();
    const slider = screen.getByLabelText('Intensity') as HTMLInputElement;
    expect(slider.type).toBe('range');
    expect(slider.min).toBe('10');
    expect(slider.max).toBe('100');
    expect(slider.step).toBe('5');
    expect(slider.value).toBe('60');
  });

  it('bounds and steps the rate slider at 0.25 to 3 per second in 0.25 steps', () => {
    renderSection();
    const slider = screen.getByLabelText('Rate') as HTMLInputElement;
    expect(slider.type).toBe('range');
    expect(slider.min).toBe('0.25');
    expect(slider.max).toBe('3');
    expect(slider.step).toBe('0.25');
    expect(slider.value).toBe('1');
  });

  it('shows each current value', () => {
    renderSection({ intensity: 85, rate: 2.5 });
    expect(
      screen.getByLabelText('Intensity').closest('.field')?.querySelector('output'),
    ).toHaveProperty('textContent', '85%');
    expect(screen.getByLabelText('Rate').closest('.field')?.querySelector('output')).toHaveProperty(
      'textContent',
      '2.5 per second',
    );
    expect(formatRate(1)).toBe('1 per second');
    expect(formatRate(0.25)).toBe('0.25 per second');
  });

  it('reports changes as numbers', () => {
    const { onChange } = renderSection();
    fireEvent.change(screen.getByLabelText('Intensity'), { target: { value: '100' } });
    expect(onChange).toHaveBeenLastCalledWith({ intensity: 100 });
    fireEvent.change(screen.getByLabelText('Rate'), { target: { value: '0.25' } });
    expect(onChange).toHaveBeenLastCalledWith({ rate: 0.25 });
  });

  it('takes focus from the keyboard, as native range inputs, which handle the arrow keys', async () => {
    const user = userEvent.setup();
    render(<FlashSection settings={base} onChange={vi.fn()} />);
    await user.tab(); // the first radio in the style group
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Intensity'));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Rate'));
  });
});

describe('style toggle', () => {
  it('offers smooth pulse and hard blink, with the current one checked', () => {
    renderSection({ style: 'blink' });
    const group = screen.getByRole('radiogroup', { name: 'Style' });
    expect(group).toBeTruthy();
    expect((screen.getByRole('radio', { name: 'Smooth pulse' }) as HTMLInputElement).checked).toBe(
      false,
    );
    expect((screen.getByRole('radio', { name: 'Hard blink' }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('reports the chosen style', () => {
    const { onChange } = renderSection({ style: 'pulse' });
    fireEvent.click(screen.getByRole('radio', { name: 'Hard blink' }));
    expect(onChange).toHaveBeenLastCalledWith({ style: 'blink' });
  });

  it('is operable by keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FlashSection settings={base} onChange={onChange} />);
    screen.getByRole('radio', { name: 'Smooth pulse' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith({ style: 'blink' });
  });
});
