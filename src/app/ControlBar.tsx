import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react';

/**
 * Removes the covered bar if its fade never reports completion. The fade itself takes 0.25 s,
 * the opacity transition on `.bar` in App.css.
 */
export const BAR_EXIT_FALLBACK_MS = 400;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function GearIcon() {
  return (
    <svg className="bar__gear" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M6.81 2.84L7.03 1.07L8.97 1.07L9.19 2.84L10.81 3.51L12.21 2.41L13.59 3.79L12.49 5.19L13.16 6.81L14.93 7.03L14.93 8.97L13.16 9.19L12.49 10.81L13.59 12.21L12.21 13.59L10.81 12.49L9.19 13.16L8.97 14.93L7.03 14.93L6.81 13.16L5.19 12.49L3.79 13.59L2.41 12.21L3.51 10.81L2.84 9.19L1.07 8.97L1.07 7.03L2.84 6.81L3.51 5.19L2.41 3.79L3.79 2.41L5.19 3.51Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function ToggleGlyph({ running }: { running: boolean }) {
  return (
    <svg className="bar__glyph" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      {running ? (
        <rect x="2.5" y="2.5" width="7" height="7" rx="1.2" fill="currentColor" />
      ) : (
        <path
          d="M3.2 1.8v8.4L10 6z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export interface ControlBarProps {
  running: boolean;
  visible: boolean;
  /**
   * True while the settings panel is open or sliding out. The bar takes no pointer or keyboard
   * input from that moment. It fades out first, then leaves the window until this is false.
   */
  covered: boolean;
  onToggle(): void;
  onOpenSettings(): void;
  onFocusChange(within: boolean): void;
}

/**
 * Start or Stop and the settings gear, as one pill centered in the window. The stage fills the
 * window and centers the pill with grid (not a transform), and ignores the pointer itself, so
 * only the pill can be hit. Start and Stop share a fixed-width slot, so the pill never moves.
 */
export function ControlBar({
  running,
  visible,
  covered,
  onToggle,
  onOpenSettings,
  onFocusChange,
}: ControlBarProps) {
  // A pointer click should not leave sticky focus, which would pin the bar open.
  const releasePointerFocus = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0) event.currentTarget.blur();
  };

  // True once the fade-out that follows `covered` has finished and the bar may leave the layout.
  // Uncovering resets it, so the bar's return from display: none can fade in.
  const [exited, setExited] = useState(covered);
  const barRef = useRef<HTMLDivElement>(null);

  // The exit lifecycle. The bar stays rendered while it fades out, which it can only do from
  // display: other than none. Its own transition's end finishes the exit once. Reduced motion
  // and an already invisible bar have no transition to wait for, and a fallback timer covers a
  // transition that never reports. Uncovering or unmounting makes the exit stale, so none of its
  // events or timers can then hide the bar.
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!covered) {
      setExited(false);
      return;
    }
    if (!el || el.hidden) return;
    // Inert content must not keep focus. The window takes it back for the panel.
    const active = document.activeElement;
    if (active instanceof HTMLElement && el.contains(active)) active.blur();

    if (prefersReducedMotion() || Number.parseFloat(getComputedStyle(el).opacity) === 0) {
      setExited(true);
      return;
    }
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setExited(true);
    };
    // Only the bar's own opacity counts, not a button's background transition bubbling up.
    const onDone = (event: Event) => {
      if (event.target === el && (event as TransitionEvent).propertyName === 'opacity') finish();
    };
    el.addEventListener('transitionend', onDone);
    el.addEventListener('transitioncancel', onDone);
    const fallback = setTimeout(finish, BAR_EXIT_FALLBACK_MS);
    return () => {
      finished = true;
      clearTimeout(fallback);
      el.removeEventListener('transitionend', onDone);
      el.removeEventListener('transitioncancel', onDone);
    };
  }, [covered]);

  const label = running ? 'Stop' : 'Start';
  const shown = visible && !covered;

  return (
    <div className="bar-stage">
      <div
        ref={barRef}
        className={shown ? 'bar' : 'bar bar--away'}
        data-testid="control-bar"
        data-visible={shown}
        data-covered={covered}
        hidden={covered && exited}
        inert={covered}
        aria-hidden={covered || undefined}
        role="toolbar"
        aria-label="Window controls"
        onFocus={() => onFocusChange(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) onFocusChange(false);
        }}
      >
        <button
          type="button"
          className="bar__button bar__button--toggle"
          title={`${label} (Space)`}
          aria-keyshortcuts="Space"
          onClick={(event) => {
            releasePointerFocus(event);
            onToggle();
          }}
        >
          <ToggleGlyph running={running} />
          {label}
        </button>
        <span className="bar__separator" aria-hidden="true" />
        <button
          type="button"
          className="bar__button bar__button--gear"
          title="Settings (S)"
          aria-label="Settings"
          aria-keyshortcuts="S"
          onClick={(event) => {
            releasePointerFocus(event);
            onOpenSettings();
          }}
        >
          <GearIcon />
        </button>
      </div>
    </div>
  );
}
