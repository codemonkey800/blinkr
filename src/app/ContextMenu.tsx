import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import '../settings/settings.css';

export interface ContextMenuProps {
  /** Pointer position inside the window, in CSS pixels. */
  x: number;
  y: number;
  running: boolean;
  alwaysOnTop: boolean;
  /** `restoreFocus` is false when the user clicked elsewhere and focus should stay there. */
  onClose(restoreFocus: boolean): void;
  onOpenSettings(): void;
  onToggleRunning(): void;
  onToggleAlwaysOnTop(): void;
  /** Preview flash is disabled until a handler is provided. */
  onPreviewFlash?: () => void;
}

const EDGE = 4;

/** The right-click menu: a DOM menu, so it looks the same on every platform. */
export function ContextMenu({
  x,
  y,
  running,
  alwaysOnTop,
  onClose,
  onOpenSettings,
  onToggleRunning,
  onToggleAlwaysOnTop,
  onPreviewFlash,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const parent = menu?.offsetParent;
    if (!menu || !(parent instanceof HTMLElement)) return;
    const left = Math.max(EDGE, Math.min(x, parent.clientWidth - menu.offsetWidth - EDGE));
    const top = Math.max(EDGE, Math.min(y, parent.clientHeight - menu.offsetHeight - EDGE));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }, [x, y]);

  useEffect(() => {
    items()[0]?.focus({ preventScroll: true });
    // Focus the first item when the menu opens at a new spot.
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      onClose(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [onClose]);

  const onKeyDown = (event: KeyboardEvent) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | undefined;
    if (event.key === 'ArrowDown') next = (index + 1) % list.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + list.length) % list.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = list.length - 1;
    else if (event.key === 'Tab') {
      // The menu is a small modal list. Tab stays inside it.
      next = (index + (event.shiftKey ? -1 : 1) + list.length) % list.length;
    }
    if (next === undefined) return;
    event.preventDefault();
    list[next]?.focus();
  };

  const choose = (action: () => void) => () => {
    onClose(true);
    action();
  };

  return (
    <div
      ref={menuRef}
      className="menu"
      role="menu"
      aria-label="Window menu"
      style={{ left: x, top: y }}
      onKeyDown={onKeyDown}
    >
      <button type="button" role="menuitem" onClick={choose(onOpenSettings)}>
        Open settings <kbd>S</kbd>
      </button>
      <button type="button" role="menuitem" onClick={choose(onToggleRunning)}>
        {running ? 'Stop timer' : 'Start timer'} <kbd>Space</kbd>
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!onPreviewFlash}
        onClick={onPreviewFlash ? choose(onPreviewFlash) : undefined}
      >
        Preview flash
      </button>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={alwaysOnTop}
        onClick={choose(onToggleAlwaysOnTop)}
      >
        Keep on top <span aria-hidden="true">{alwaysOnTop ? '✓' : ''}</span>
      </button>
    </div>
  );
}
