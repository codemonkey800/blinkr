import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlashSurface } from './FlashSurface';

const COLORS = ['#ff0000', '#00ff00', '#0000ff'];

type Props = Parameters<typeof FlashSurface>[0];

function props(overrides: Partial<Props> = {}): Props {
  return {
    idleColor: '#1b1e25',
    colors: COLORS,
    style: 'pulse',
    intensity: 60,
    rate: 1,
    flashing: true,
    flashKey: 1,
    ...overrides,
  };
}

function layer(): HTMLElement {
  return screen.getByTestId('flash-layer');
}

function prop(name: string): string {
  return layer().style.getPropertyValue(name);
}

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: matches && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('FlashSurface', () => {
  it('renders only the idle color when not flashing', () => {
    render(<FlashSurface {...props({ flashing: false })} />);
    expect(screen.getByTestId('flash-surface').style.backgroundColor).toBe('rgb(27, 30, 37)');
    expect(screen.queryByTestId('flash-layer')).toBeNull();
  });

  it('renders children', () => {
    render(
      <FlashSurface {...props({ flashing: false })}>
        <p>hello</p>
      </FlashSurface>,
    );
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('sets the custom properties for a pulse flash', () => {
    render(<FlashSurface {...props({ style: 'pulse', intensity: 60, rate: 2 })} />);
    expect(layer().className).toContain('flash-layer--pulse');
    expect(prop('--flash-color')).toBe('#ff0000');
    expect(prop('--flash-peak')).toBe('0.6');
    expect(prop('--flash-period')).toBe('0.5s');
  });

  it('sets the custom properties for a blink flash', () => {
    render(<FlashSurface {...props({ style: 'blink', intensity: 100, rate: 0.25 })} />);
    expect(layer().className).toContain('flash-layer--blink');
    expect(prop('--flash-color')).toBe('#ff0000');
    expect(prop('--flash-peak')).toBe('1');
    expect(prop('--flash-period')).toBe('4s');
  });

  it('is hidden from assistive tech', () => {
    render(<FlashSurface {...props()} />);
    expect(layer().getAttribute('aria-hidden')).toBe('true');
  });

  it('advances one color per animationiteration and wraps around', () => {
    render(<FlashSurface {...props()} />);
    const seen = [prop('--flash-color')];
    for (let i = 0; i < 4; i++) {
      fireEvent.animationIteration(layer());
      seen.push(prop('--flash-color'));
    }
    expect(seen).toEqual(['#ff0000', '#00ff00', '#0000ff', '#ff0000', '#00ff00']);
  });

  it('keeps the same color with a single color', () => {
    render(<FlashSurface {...props({ colors: ['#123456'] })} />);
    fireEvent.animationIteration(layer());
    fireEvent.animationIteration(layer());
    expect(prop('--flash-color')).toBe('#123456');
  });

  it('restarts at the first color when flashKey changes', () => {
    const { rerender } = render(<FlashSurface {...props({ flashKey: 1 })} />);
    fireEvent.animationIteration(layer());
    fireEvent.animationIteration(layer());
    expect(prop('--flash-color')).toBe('#0000ff');
    const before = layer();

    rerender(<FlashSurface {...props({ flashKey: 2 })} />);
    expect(prop('--flash-color')).toBe('#ff0000');
    expect(layer()).not.toBe(before);
  });

  it('starts at the first color again after a flash ends and another begins', () => {
    const { rerender } = render(<FlashSurface {...props({ flashKey: 1 })} />);
    fireEvent.animationIteration(layer());
    rerender(<FlashSurface {...props({ flashing: false, flashKey: 1 })} />);
    expect(screen.queryByTestId('flash-layer')).toBeNull();
    rerender(<FlashSurface {...props({ flashing: true, flashKey: 2 })} />);
    expect(prop('--flash-color')).toBe('#ff0000');
  });

  it('has no reduced-motion class by default', () => {
    mockReducedMotion(false);
    render(<FlashSurface {...props()} />);
    expect(layer().className).not.toContain('flash-layer--reduced');
  });

  it('uses the reduced-motion class and the first color when matchMedia reports it', () => {
    mockReducedMotion(true);
    render(<FlashSurface {...props({ style: 'blink' })} />);
    expect(layer().className).toContain('flash-layer--reduced');
    expect(prop('--flash-color')).toBe('#ff0000');
    expect(prop('--flash-peak')).toBe('0.6');
    fireEvent.animationIteration(layer());
    expect(prop('--flash-color')).toBe('#ff0000');
  });

  it('works when matchMedia is unavailable', () => {
    render(<FlashSurface {...props()} />);
    expect(layer().className).not.toContain('flash-layer--reduced');
  });
});
