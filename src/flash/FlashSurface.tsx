import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { FlashStyle } from '../settings/model';
import { colorForPulse } from './colors';
import './flash.css';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener?.('change', onChange);
  return () => query.removeEventListener?.('change', onChange);
}

function reducedMotionSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);
}

interface FlashLayerProps {
  colors: string[];
  style: FlashStyle;
  intensity: number;
  rate: number;
}

/** Remounted per flash (keyed by flashKey), so the pulse count and the animation restart at 0. */
function FlashLayer({ colors, style, intensity, rate }: FlashLayerProps) {
  const [pulseIndex, setPulseIndex] = useState(0);
  const reduced = usePrefersReducedMotion();
  const layerRef = useRef<HTMLDivElement>(null);

  // A native listener, because React rewrites the event name where AnimationEvent is missing (jsdom).
  useEffect(() => {
    const node = layerRef.current;
    if (node === null) return;
    const onIteration = () => setPulseIndex((index) => index + 1);
    node.addEventListener('animationiteration', onIteration);
    return () => node.removeEventListener('animationiteration', onIteration);
  }, []);

  const color = colorForPulse(colors, reduced ? 0 : pulseIndex);
  const layerStyle = {
    '--flash-color': color,
    '--flash-peak': intensity / 100,
    '--flash-period': `${1 / rate}s`,
  } as CSSProperties;

  const className = ['flash-layer', `flash-layer--${style}`, reduced ? 'flash-layer--reduced' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      ref={layerRef}
      data-testid="flash-layer"
      aria-hidden="true"
      style={layerStyle}
    />
  );
}

export function FlashSurface(props: {
  idleColor: string;
  colors: string[];
  style: FlashStyle;
  intensity: number;
  rate: number;
  flashing: boolean; // true for the flash's duration
  flashKey: number; // changes per flash so the animation restarts at 0
  children?: ReactNode;
}) {
  const { idleColor, colors, style, intensity, rate, flashing, flashKey, children } = props;

  return (
    <div
      className="flash-surface"
      data-testid="flash-surface"
      style={{ backgroundColor: idleColor }}
    >
      <div className="flash-surface__content">{children}</div>
      {flashing ? (
        <FlashLayer
          key={flashKey}
          colors={colors}
          style={style}
          intensity={intensity}
          rate={rate}
        />
      ) : null}
    </div>
  );
}
