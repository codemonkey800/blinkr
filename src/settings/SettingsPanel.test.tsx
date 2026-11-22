import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from './model';
import { EXIT_FALLBACK_MS, nextColor, SettingsPanel } from './SettingsPanel';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderPanel(props: Partial<Parameters<typeof SettingsPanel>[0]> = {}) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  const onToggleRunning = vi.fn();
  const { container } = render(
    <SettingsPanel
      settings={DEFAULT_SETTINGS}
      running={false}
      onChange={onChange}
      onClose={onClose}
      onToggleRunning={onToggleRunning}
      {...props}
    />,
  );
  return { container, onChange, onClose, onToggleRunning };
}

describe('SettingsPanel', () => {
  it('renders the Flash section between the colors and the window settings', () => {
    const { container } = renderPanel();
    const groups = Array.from(container.querySelectorAll('.body > *')).map((el) =>
      el.getAttribute('aria-label'),
    );
    expect(groups).toEqual(['Timing', 'Colors', 'Flash', 'Window']);
  });

  it('passes full settings with the new style, intensity, and rate to onChange', () => {
    const { onChange } = renderPanel();
    fireEvent.click(screen.getByRole('radio', { name: 'Hard blink' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, style: 'blink' });
    fireEvent.change(screen.getByLabelText('Intensity'), { target: { value: '80' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, intensity: 80 });
    fireEvent.change(screen.getByLabelText('Rate'), { target: { value: '2.5' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, rate: 2.5 });
  });

  it('disables Preview flash while a field is invalid and reports validity', () => {
    const onInvalidChange = vi.fn();
    const onPreviewFlash = vi.fn();
    const { unmount } = render(
      <SettingsPanel
        settings={DEFAULT_SETTINGS}
        running={false}
        onChange={vi.fn()}
        onClose={vi.fn()}
        onToggleRunning={vi.fn()}
        onPreviewFlash={onPreviewFlash}
        onInvalidChange={onInvalidChange}
      />,
    );
    const preview = screen.getByRole('button', { name: 'Preview flash' });
    expect(preview).toHaveProperty('disabled', false);
    fireEvent.click(preview);
    expect(onPreviewFlash).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Interval'), { target: { value: '0' } });
    expect(preview).toHaveProperty('disabled', true);
    expect(onInvalidChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(preview);
    expect(onPreviewFlash).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Interval'), { target: { value: '5' } });
    expect(preview).toHaveProperty('disabled', false);
    expect(onInvalidChange).toHaveBeenLastCalledWith(false);

    fireEvent.change(screen.getByLabelText('Flash duration'), { target: { value: '99' } });
    expect(onInvalidChange).toHaveBeenLastCalledWith(true);
    unmount();
    expect(onInvalidChange).toHaveBeenLastCalledWith(false);
  });

  it('passes full valid settings to onChange and nothing for an invalid edit', () => {
    const { onChange } = renderPanel();
    fireEvent.change(screen.getByLabelText('Flash duration'), { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, flashDurationSeconds: 5 });
    onChange.mockClear();
    fireEvent.change(screen.getByLabelText('Flash duration'), { target: { value: '99' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls the close and start handlers', () => {
    const { onClose, onToggleRunning } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onToggleRunning).toHaveBeenCalledTimes(1);
  });

  it('is a labelled, non-modal dialog', () => {
    renderPanel();
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog.hasAttribute('aria-modal')).toBe(false);
  });
});

describe('SettingsPanel exit', () => {
  const dialog = () => screen.getByRole('dialog', { name: 'Settings' });

  function end(type: string, name: string, target: Element = dialog()) {
    const event = new Event(type, { bubbles: true });
    Object.assign(event, { animationName: name });
    act(() => void target.dispatchEvent(event));
  }

  function renderClosable(closing: boolean) {
    const onExited = vi.fn();
    const props = {
      settings: DEFAULT_SETTINGS,
      running: false,
      onChange: vi.fn(),
      onClose: vi.fn(),
      onToggleRunning: vi.fn(),
      onExited,
    };
    const view = render(<SettingsPanel {...props} closing={closing} />);
    return {
      onExited,
      setClosing: (next: boolean) => view.rerender(<SettingsPanel {...props} closing={next} />),
    };
  }

  it('is interactive and not closing by default', () => {
    const { onExited } = renderClosable(false);
    expect(dialog().hasAttribute('inert')).toBe(false);
    expect(dialog().getAttribute('data-state')).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Interval'));
    expect(onExited).not.toHaveBeenCalled();
  });

  it('goes inert, drops focus, and calls onExited once when its own exit animation ends', () => {
    const { onExited, setClosing } = renderClosable(false);
    setClosing(true);
    expect(dialog().hasAttribute('inert')).toBe(true);
    expect(dialog().getAttribute('data-state')).toBe('closing');
    expect(dialog().contains(document.activeElement)).toBe(false);
    end('animationend', 'panel-out', screen.getByLabelText('Interval'));
    end('animationend', 'panel-in');
    expect(onExited).not.toHaveBeenCalled();
    end('animationend', 'panel-out');
    end('animationcancel', 'panel-out');
    vi.advanceTimersByTime(5000);
    expect(onExited).toHaveBeenCalledTimes(1);
  });

  it('calls onExited from the fallback timer when no event arrives', () => {
    const { onExited, setClosing } = renderClosable(false);
    setClosing(true);
    vi.advanceTimersByTime(EXIT_FALLBACK_MS - 1);
    expect(onExited).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExited).toHaveBeenCalledTimes(1);
  });

  it('calls onExited at once under reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
    const { onExited, setClosing } = renderClosable(false);
    setClosing(true);
    expect(onExited).toHaveBeenCalledTimes(1);
  });

  it('reopening cancels the pending exit and refocuses the first field', () => {
    const { onExited, setClosing } = renderClosable(false);
    setClosing(true);
    vi.advanceTimersByTime(100);
    setClosing(false);
    expect(dialog().hasAttribute('inert')).toBe(false);
    expect(dialog().getAttribute('data-state')).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Interval'));
    end('animationend', 'panel-out');
    end('animationcancel', 'panel-out');
    vi.advanceTimersByTime(5000);
    expect(onExited).not.toHaveBeenCalled();
  });

  it('records where the panel was when the animation switches', () => {
    const { setClosing } = renderClosable(false);
    vi.spyOn(dialog(), 'getBoundingClientRect').mockReturnValue({ right: 500 } as DOMRect);
    vi.spyOn(dialog().parentElement!, 'getBoundingClientRect').mockReturnValue({
      right: 380,
    } as DOMRect);
    setClosing(true);
    expect(dialog().style.getPropertyValue('--panel-from')).toBe('120px');
  });
});

describe('nextColor', () => {
  it('offers the first palette color that is not in use', () => {
    expect(nextColor(['#ffb547'])).toBe('#46c2cb');
    expect(nextColor([])).toBe('#ffb547');
  });

  it('falls back to white when the palette is used up', () => {
    const palette = ['#ffb547', '#46c2cb', '#ff6f91', '#8f86ff', '#8bd35c', '#f2f2f2'];
    expect(nextColor(palette)).toBe('#ffffff');
  });
});

describe('global shortcut field', () => {
  const select = () => screen.getByLabelText('Global start and stop shortcut') as HTMLSelectElement;

  it('offers Off and the three accelerators, with Off by default', () => {
    renderPanel();
    expect(Array.from(select().options).map((o) => [o.value, o.textContent])).toEqual([
      ['', 'Off'],
      ['CommandOrControl+Alt+B', 'Cmd/Ctrl+Alt+B'],
      ['CommandOrControl+Shift+B', 'Cmd/Ctrl+Shift+B'],
      ['CommandOrControl+Alt+Space', 'Cmd/Ctrl+Alt+Space'],
    ]);
    expect(select().value).toBe('');
  });

  it('shows the stored accelerator', () => {
    renderPanel({
      settings: { ...DEFAULT_SETTINGS, globalShortcut: 'CommandOrControl+Shift+B' },
    });
    expect(select().value).toBe('CommandOrControl+Shift+B');
  });

  it('saves a choice, and null for Off', () => {
    const { onChange } = renderPanel();
    fireEvent.change(select(), { target: { value: 'CommandOrControl+Alt+Space' } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS,
      globalShortcut: 'CommandOrControl+Alt+Space',
    });
    fireEvent.change(select(), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, globalShortcut: null });
  });

  it('always shows the Wayland help text', () => {
    renderPanel();
    expect(
      screen.getByText('May not work on Linux with Wayland. Space in the window always works.'),
    ).toBeTruthy();
  });

  it('shows no error unless one is passed, then shows it', () => {
    const { container } = renderPanel();
    expect(container.querySelector('.err')).toBeNull();
    cleanup();
    renderPanel({ shortcutError: "Couldn't register this shortcut. Another app may be using it." });
    expect(
      screen.getByText("Couldn't register this shortcut. Another app may be using it."),
    ).toBeTruthy();
    expect(select().getAttribute('aria-invalid')).toBe('true');
  });
});
