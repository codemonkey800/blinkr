import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// jsdom cannot run layout, so this only guards the CSS rule. The bug it prevents:
// `.app { overflow: hidden }` is still a scroll container. While the settings panel
// slides in from translateX(100%), it adds 380px of scrollable overflow, and WebKit
// (the macOS Tauri webview) scrolls `.app` to reveal the focused interval input even
// with preventScroll. The panel then overshoots to the left edge and snaps back when
// the animation ends. `overflow: clip` makes `.app` unscrollable.
describe('.app layout', () => {
  it('clips overflow instead of making .app a scroll container', () => {
    const css = readFileSync('src/App.css', 'utf8');
    const rule = /(?:^|\})\s*\.app\s*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/overflow\s*:\s*clip\s*;/);
  });
});
