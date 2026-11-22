import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { WindowControls } from '../platform/window';

/** How far the pointer must travel with the button held before a press becomes a drag, in px. */
export const DRAG_THRESHOLD_PX = 4;

/** Anything here handles its own presses. A drag never starts on or inside it. */
const NO_DRAG = '.bar, .panel, .menu, button, a, input, select, textarea, [contenteditable]';

interface Press {
  pointerId: number;
  x: number;
  y: number;
}

/**
 * In a borderless window there is no title bar, so a press on the bare window moves it. The
 * press only becomes a drag once the pointer has moved a few pixels, so a plain click still
 * reveals the control bar. Returns the pointer-down handler for the window element.
 */
export function useWindowDrag(
  enabled: boolean,
  controls: WindowControls,
): (event: ReactPointerEvent) => void {
  const stopTracking = useRef<(() => void) | null>(null);

  const cancel = useCallback(() => {
    stopTracking.current?.();
    stopTracking.current = null;
  }, []);

  // Turning the mode off, or unmounting, abandons a press in progress.
  useEffect(() => {
    if (!enabled) cancel();
    return cancel;
  }, [enabled, cancel]);

  return useCallback(
    (event: ReactPointerEvent) => {
      if (!enabled || event.button !== 0 || !event.isPrimary) return;
      if (event.target instanceof Element && event.target.closest(NO_DRAG)) return;
      cancel();
      const press: Press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };

      const onMove = (move: PointerEvent) => {
        if (move.pointerId !== press.pointerId) return;
        if (Math.hypot(move.clientX - press.x, move.clientY - press.y) < DRAG_THRESHOLD_PX) return;
        cancel();
        void controls.startDragging();
      };
      const onEnd = (end: PointerEvent) => {
        if (end.pointerId === press.pointerId) cancel();
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onEnd);
      document.addEventListener('pointercancel', onEnd);
      stopTracking.current = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onEnd);
        document.removeEventListener('pointercancel', onEnd);
      };
    },
    [enabled, controls, cancel],
  );
}
