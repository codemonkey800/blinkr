---
nexus-plan: 2
title: Blinkr timer application
branch: feat/blinkr-app
base: main
tasks: blinkr-app.tasks.yaml
setup:
  - pnpm install --frozen-lockfile
checks:
  - |
    node --input-type=module <<'NODE'
    import assert from 'node:assert/strict';
    import { execFileSync } from 'node:child_process';
    import { readFileSync } from 'node:fs';
    import test from 'node:test';

    test('preserve the existing Blinkr product requirements', () => {
      const original = execFileSync('git', ['show', '39238ccdaa2730364d2b8a0a33b5ddfbc84a6b2d:README.md'], { encoding: 'utf8' });
      const requirements = original.split('\n## Status\n')[0];
      const normalize = (value) => value.replace(/\s+/g, ' ').trim();
      assert.ok(normalize(readFileSync('README.md', 'utf8')).startsWith(normalize(requirements)));
    });
    NODE
  - pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm build && pnpm test
  - pnpm build && cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check && cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings && cargo test --manifest-path src-tauri/Cargo.toml --locked
parallel: 3
review: per-phase
commit-style: 'conventional, scope required, e.g. feat(timer): schedule flashes from absolute deadlines'
---

# Blinkr timer application

## Goal

Build the Blinkr product described in `README.md` on top of the existing Tauri 2 + React
scaffold. Blinkr is a blank, resizable window that flashes a color for a few seconds on a
repeating interval, with no countdown and no audio. Phase 1 delivers the core: the
drift-free repeating timer, the flash engine, the full settings panel with validation and
the photosensitivity warning, start and stop, persistence, always-on-top, and flash
preview. Phase 2 adds borderless and fullscreen modes, a global start/stop hotkey, and
saved presets. The user approves the mockup, then checks the flash and the settings panel
by eye before the run goes further.

## Context

- Layout: `src/main.tsx` is a placeholder React 19 entry; `src/styles.css` holds its CSS.
  `src-tauri/src/lib.rs` is a bare `tauri::Builder`; `src-tauri/tauri.conf.json` has one
  760×480 resizable window (label `main`) and CSP
  `default-src 'self'; img-src 'self' asset:; style-src 'self'; script-src 'self'`.
  No capability files exist yet. `tests/infrastructure.test.mjs` holds Node tests.
- Commands: `pnpm install --frozen-lockfile`, `pnpm format` (Prettier; run it before
  committing, `format:check` covers `design/` too), `pnpm lint`, `pnpm build` (typecheck
  plus Vite), `pnpm test`. `dist/` is gitignored and Tauri's Rust build reads it, so run
  `pnpm build` before any Cargo command. Read Node and Vitest summary lines for counts.
- Pin dependencies exactly, as `package.json` and `Cargo.toml` do. Verified compatible
  with Tauri 2.12.7: `tauri-plugin-store` 2.5.1 with `@tauri-apps/plugin-store` 2.5.1, and
  `tauri-plugin-global-shortcut` 2.4.1 with `@tauri-apps/plugin-global-shortcut` 2.4.1.
- Least privilege: every native call needs an explicit permission in
  `src-tauri/capabilities/main.json` for window `main`. List only commands the code calls,
  such as `core:window:allow-set-always-on-top`, never a plugin's `default` set.
  `tests/capabilities.test.mjs` asserts the exact list; update it with each permission.
  Valid identifiers appear in `src-tauri/gen/schemas/desktop-schema.json` after a Cargo build.
- Frontend code must run in a plain browser at `pnpm dev`. Guard Tauri calls with
  `isTauri()` from `@tauri-apps/api/core` and fall back to `localStorage` or a no-op.
- CSP: never inject `<style>` tags or relax the CSP. React `style` props and CSS custom
  properties set through the DOM are allowed. Ship no web fonts or remote assets.
- Settings rules: missing or invalid stored fields fall back to their defaults and unknown
  fields are dropped, so later tasks add fields without a migration. The app always starts
  stopped. The approved mockup at `design/mockups/blinkr.html` is the visual spec for UI.
- The window has a minimal control bar: Start or Stop plus a settings gear. It shows when
  stopped and, while running, only after pointer movement, fading out when idle. It never
  shows a countdown or time.
- Controls redesign: T19 creates `design/mockups/controls.html` (new), H4 approves a
  specific option, and T20 implements it. Centering horizontally and vertically is the
  proposed direction, pending H4. After approval, that page and H4's verdict supersede
  `design/mockups/blinkr.html` for the window controls only. Preserve the existing
  settings drawer, timer, shortcuts, and visibility behavior unless H4 explicitly changes
  a control interaction. Never implement a proposed option before H4 approves it.
- Settings drawer theme: once H4 approves, the drawer's colors and edge follow the dark
  drawer in `design/mockups/controls.html`. Its layout, copy, and behavior still follow
  `design/mockups/blinkr.html`. T21 owns the restyle. The right-click menu stays light.
- Verification: the browser tools are headless only. Use `mcp__chrome__*` against the Vite
  server. Port 1420 is strict and other tasks may hold it. Check with `lsof -i :1420`; for
  browser-only checks run `pnpm exec vite --port <free port>` and stop it when done.
  Native visual inspection on macOS fails because accessibility automation is denied, so
  report native visuals as unverified, not as a blocker. Windows, Linux, and remote CI are
  unverified locally.
- Out of scope: audio, any visible countdown or clock, task, calendar, or notification
  integration, network access, signing, releases, publishing, and pushing.

## Done means

- All three checks pass after the task. `pnpm test` runs both the Node tests and Vitest,
  and each runs at least one test.
- Vitest tests cover every state, limit, and edge case the task body names. Logic tests use
  fake timers or injected clocks, never real waiting.
- No audio, countdown, or remaining-time readout is added. The CSP in
  `src-tauri/tauri.conf.json` is unchanged.
- `src-tauri/capabilities/main.json` grants exactly the permissions the code calls, and
  `tests/capabilities.test.mjs` asserts that list.
- Code that calls Tauri still works in a plain browser without throwing.
- UI matches the approved mockup in layout, copy, and states, unless the H task verdict
  changed it.
- The README requirements above its Status heading are unchanged.

## Decisions

- **Mockups are run tasks.** T1 builds them with the frontend-design skill and H1 is the
  user's review. UI tasks wait for H1; engine and persistence work runs during the review.
- **Default flash is a smooth pulse at moderate intensity.** Hard blink stays selectable.
  Proposed defaults: pulse, 60% intensity, 1 pulse/s, amber, 2 s flash every 10 min.
- **Rate is capped at 3 flashes per second**, the common photosensitivity limit. The warning
  is always visible and turns stronger above 2/s, or for blink above 70% intensity.
- **Minimal window controls** (user, at H1): "invisible timer" means no countdown, not no
  UI. A small Start/Stop and gear bar shows when stopped; while running the window is
  blank until the pointer moves. T15 revises the mockup; H1 reviews the revised page.
- **Settings appear on demand only**: the gear, right-click, or `S`. Starting the timer hides
  them.
- **The schedule is computed from absolute deadlines**, so late timers never accumulate
  drift. The flash itself is CSS-driven. `backgroundThrottling: disabled` is set too, but
  only macOS 14+ supports it.
- **Under reduced motion, the flash holds steady** at its intensity for its duration, with
  no oscillation. This is a planner default; H1 can overturn it.
- **Persistence uses the Tauri store plugin**, with `localStorage` in a plain browser.
- **Global hotkey defaults to off.** It is platform-specific: Linux under Wayland may refuse
  it, and the UI says so.
- **Phasing follows the user's split.** Phase 1 is the core and always-on-top. Phase 2 is
  borderless and fullscreen, the hotkey, and presets.
- **Checkpoints:** H1 reviews the mockup, H2 checks the flash after the engine lands, and H3
  checks the settings panel.
- **Revisit the window controls** (user, 2026-11-22): add new mockups for Start/Stop and
  Settings, exploring placement at the center instead of near the bottom. T19 presents
  alternatives, H4 records the chosen design, and T20 implements only that choice.
  Centered placement and button styling remain proposals until H4; approval of H1 or H3
  does not approve this redesign. H3 stays open for its existing settings review.

## Planner notes

- Research, 2026-11-21: at base, all three checks pass on a clean tree. Clippy took about
  14 s warm. In the main checkout `format:check` flags a globally gitignored
  `.claude/settings.local.json`; fresh worktrees don't have it.
- `node --test "tests/**/*.test.mjs"` (quoted glob, expanded by Node 24) found all 3 tests.
  Use that form so it also works in Windows CI.
- Permission identifiers confirmed in `src-tauri/gen/schemas/desktop-schema.json`:
  `core:window:allow-set-always-on-top`, `allow-set-fullscreen`, `allow-is-fullscreen`,
  `allow-set-decorations`, `allow-start-dragging`, `allow-start-resize-dragging`.
- The Tauri `backgroundThrottling` window option only works on macOS 14+. Linux and Windows
  rely on absolute-deadline scheduling plus re-evaluation on `visibilitychange`.
- Ruled out: building mockups during planning, at the user's request. A native menu for
  right-click, which needs menu permissions; a DOM menu is simpler. Persisting the running
  state.

- 2026-11-21: the user found the first mockup too blank and chose minimal controls. Request
  changes on H1 needs a pinned comment, so T15 revises the mockup instead and H1 stays open
  to review the revised page. T5 and T8 wait on T15.

- 2026-11-21: the Nexus frames viewer renders mockups without running scripts. T15's
  frames injected title bars and control bars from JS, so they showed empty there. T16
  makes every frame static HTML. Check mockups with JS disabled before calling them done.

- 2026-11-22: during H3 the user saw the settings panel overshoot left, then snap back
  right. It reproduces only in WebKit, the macOS webview. Chrome is fine. The panel's
  `translateX(100%)` start overflows `.app`, which is `overflow: hidden` and so still
  scrollable. WebKit scrolls it 380 px despite `preventScroll`. Injecting
  `overflow: clip` fixed it in Playwright WebKit. T17 applies the fix and H3 stays open.
  Headless Chrome checks can miss WebKit-only bugs. Playwright WebKit installs into a temp
  directory and gives a cheap WebKit check.

- 2026-11-22: added T19 -> H4 -> T20 to phase 1 for the requested control redesign.
  The run worktree was clean and no task was live when this change was prepared.
  Current controls are in `src/App.tsx` and `src/App.css` (`bottom: 24px`);
  `design/mockups/blinkr.html` documents the earlier bottom placement. Keep that earlier
  page as reference and make `design/mockups/controls.html` a separate review page.
  Mockup frames must contain static HTML, because Nexus renders them without scripts.
  Phase 2 already waits for all of phase 1, including the new implementation and H4.

- 2026-11-22: H4 round 1 asked for a dark settings drawer and the compact pill (Option A).
  R1 made both the single direction in `controls.html`. C1 asked for a drawer restyle task,
  so T21 was added after H4 and T18. It runs in parallel with T20. Their files don't
  overlap: T21 owns `src/settings/`, and T20 owns `src/App.*` and `src/app/`. The drawer CSS
  lives in `src/settings/settings.css`, not `src/styles.css`. There, `.panel, .menu` share
  one light token block, so T21 splits it and keeps the menu light. The mockup drawer is
  abridged, with no warning, error, slider, or swatch states, so T21 derives those against
  the page's contrast targets: 4.5 for text and 3 for outlines. The mockup's
  "Abridged for review. The real drawer is unchanged." copy predates the dark decision and
  refers to content, not colors. If H4 rejects the dark drawer, skip T21.

## Log

<!-- Written by Nexus: findings, review cycles, checkpoint verdicts, the final report. -->

### 2026-11-21 · T2 · done
Dev dependencies are pinned exactly: vitest 5.1.1, jsdom 31.0.1, @testing-library/react 16.3.3, @testing-library/dom 10.4.2, @testing-library/user-event 14.6.13.
`pnpm test` is now `node --test "tests/**/*.test.mjs" && vitest run`. Node runs 3 tests and Vitest runs 89. The Node suite needs `dist/`, so run `pnpm build` first.
LIMITS keys: INTERVAL_MIN_MS, INTERVAL_MAX_MS, FLASH_DURATION_MIN, FLASH_DURATION_MAX, MIN_COLORS, MAX_COLORS, INTENSITY_MIN, INTENSITY_MAX, RATE_MIN, RATE_MAX, RATE_STEP.
Decisions where the spec was silent:
- Interval values may be fractional, and only the total of 1 s to 24 h is checked.
- Rate must be a multiple of 0.25.
- `validateSettings` accepts hex colors in either case. `sanitizeSettings` lowercases them.
- `sanitizeSettings` returns fresh copies of the default colors and interval, and it survives throwing getters on `raw`.
Cargo fmt, clippy and test also pass.

### 2026-11-21 · T4 · done
Layout: `FlashSurface` renders `.flash-surface` (relative, full height, `overflow: hidden`, `backgroundColor` from `idleColor`). It holds a `.flash-surface__content` wrapper for `children`, then the flash layer, which sits on top of `children` with `pointer-events: none` and `aria-hidden`. The layer exists only while `flashing` is true. Test ids are `flash-surface` and `flash-layer`.
The layer is a `FlashLayer` keyed by `flashKey`, so a new key remounts it. That restarts the CSS animation and the pulse count at the first color.
Custom properties on the layer: `--flash-color`, `--flash-peak` (intensity/100), `--flash-period` (`${1/rate}s`). Style classes are `flash-layer--pulse` and `flash-layer--blink`. Keyframes are `blinkr-flash-pulse` (ease-in-out) and `blinkr-flash-blink` (step-end, on for the first half of the period).
Reduced motion: a `useSyncExternalStore` hook reads `matchMedia('(prefers-reduced-motion: reduce)')` and adds `flash-layer--reduced`. That class shows the first color steady at peak with `animation: none`. The CSS also has a matching `@media` rule. A missing `matchMedia` counts as not reduced.
Decision: `animationiteration` uses a native listener on the layer via `useEffect`, not React's `onAnimationIteration`. React rewrites that event name when `AnimationEvent` is missing, as in jsdom, so the prop never fires there. Tests fire the event with `fireEvent.animationIteration`.
Decision: `colorForPulse` wraps with modulo, including negative indexes. An empty list returns `DEFAULT_SETTINGS.colors[0]`.
`FlashSurface` is not imported by `src/main.tsx` yet. The next task should mount it with `flashing` and a `flashKey` that increments per flash.

### 2026-11-21 · T3 · done
useBlinkTimer takes `{ intervalMs, flashMs, now? }` and returns `{ running, phase, start, stop, restart }`. Callers pass `intervalMs(settings.interval)` and `settings.flashDurationSeconds * 1000`.
`phase` is null while stopped. While running it is `{ kind: 'idle', cycle, endsAt }` or `{ kind: 'flash', cycle, startedAt, endsAt }`.
The hook only re-renders when kind, cycle or endsAt changes.
`start()` is a no-op while running. `restart()` while stopped starts the timer.
Changing intervalMs or flashMs while running restarts from now. While stopped it does nothing.
`phaseAt` throws RangeError for intervalMs <= 0, flashMs < 0 or non-finite values. A zero flashMs is allowed and never flashes.
Hook tests need an explicit `cleanup()` in afterEach, because Vitest globals are off and Testing Library doesn't auto-clean.

### 2026-11-21 · T6 · done
Capability permissions are exactly store:allow-get, store:allow-load, store:allow-save and store:allow-set. Later tasks that add native calls must add the identifier to src-tauri/capabilities/main.json and to EXPECTED_PERMISSIONS in tests/capabilities.test.mjs. Check identifiers in src-tauri/gen/schemas/desktop-schema.json, which is gitignored and generated by a Cargo build.
The Tauri store file is blinkr.json, loaded with autoSave: false, and every set is followed by an explicit save. The settings key is 'settings'. Browser localStorage keys are prefixed 'blinkr:'. The key is an internal parameter (loadValue and saveValue) so phase 2 can store presets under another key in the same store.
Decisions where the spec was silent:
- defaultBackend falls back to browserBackend with a console.warn if the Tauri store fails to open.
- browserBackend.get returns undefined for corrupt JSON.
- createDebouncedSaver defaults to 300 ms and serializes writes through a promise chain. flush clears the timer, writes any pending value, and awaits in-flight writes.
- loadSettings and saveSettings log with console.warn on failure and never throw.
Node runs 5 tests and Vitest runs 102. Cargo fmt, clippy and test also pass. pnpm format reformatted pnpm-lock.yaml (Prettier style), which is why its diff is large. A frozen-lockfile install still passes.
Not verified: real store reads and writes in the native app (visual or native inspection unavailable locally).

### 2026-11-21 · T7 · done
windowControls() returns a no-op object when !isTauri(). Otherwise setAlwaysOnTop(on) calls getCurrentWindow().setAlwaysOnTop(on) inside try/catch and logs with console.warn on failure; it never throws.
Capability permissions are now core:window:allow-set-always-on-top plus the four store:* ones, asserted in tests/capabilities.test.mjs.
tauri.conf.json main window has label "main" and backgroundThrottling "disabled" (macOS 14+ only). CSP, size and resizable are unchanged.
Decision: no Co-Authored-By trailer, per the plan-run rule.
Node runs 6 tests and Vitest runs 146. Cargo fmt, clippy and test pass.
Not verified: native always-on-top and background-throttling behaviour (native inspection unavailable locally).

### 2026-11-21 · T1 · done
Mockup is one self-contained page: system fonts, no remote assets, inline CSS and JS. Flash uses CSS keyframes (pulse, blink, hue2 to hue6) driven by custom properties --peak, --period, --count, --shape, --hues, --cycle, --shift, --cur, --c1..--c6. Implementers should port these.
Decisions for the reviewer to confirm:
1. Panel is a 380px right drawer. Below 560px window width it fills the window. Controls scroll, Preview flash and Start are pinned in the footer. Order: [later: preset], interval + duration, colors + idle, style, intensity + warning, rate, always on top, [later: borderless, fullscreen, global shortcut].
2. A click anywhere opens settings, also while running. Clicking while settings are open does nothing. Only Escape or the close button closes them.
3. Right-click menu is drawn in-app with two items: Settings (S) and Start/Stop (Space). Arrow keys move, Escape closes.
4. S and Space work only when the window has focus and the target is not an input, select, or button.
5. Start hides the panel. If the panel is opened while running, the button reads Stop and the panel stays until closed.
6. Hint shows only when stopped and no panel is open: "Click or press S for settings. Press Space to start." Faint, bottom centre, keycap outlines.
7. Pulse count: whole pulses fit the duration, n = max(1, floor(duration x rate)), period = duration / n. The effective rate is never above the set rate. A 2s flash at 0.25/s is one 2s pulse.
8. Several colors: each pulse takes the next color, and the sequence continues across flashes (offset kept per window).
9. Warning is always visible, not dismissible. Calm text, then a red "Strong flashing" state when rate > 2/s or blink > 70% (both exclusive). The message names the cause.
10. Start is disabled when interval or duration is invalid. Stop is never disabled. Preview flash is disabled only for an invalid duration. Error copy: "Interval must be between 1 second and 24 hours." and "Flash duration must be between 0.5 and 30 seconds."
11. Intensity step 5%, rate step 0.25, interval and duration accept decimals.
12. Reduced motion holds the flash steady at peak for the whole duration, for every style.
13. Panel is light (#f2f3f5) over the dark idle window. Controls are ink (#1f2529), never amber, so the flash color is the only color in the product.
14. Idle color default is #1b1d20. All proposed defaults and limits from the task are used as given.
15. Not specified, left unvalidated: a flash duration longer than the interval. Reviewer should say if it needs a rule.
16. The mockup's running demo flashes every 5 seconds regardless of interval. That is a page convenience only.

### 2026-11-21 · T15 · done
Choices for the reviewer to confirm (all also listed in "Choices to confirm" on the page):
1. Bar is a translucent dark pill (rgba(22,24,27,.78), thin light edge, light controls), neutral and never amber. Start/Stop are text, the gear is an icon with accessible name "Settings".
2. Tooltips carry the shortcuts: "Start (Space)", "Stop (Space)", "Settings (S)". The hint text is removed.
3. While stopped, the bar always shows. While running it is hidden until pointer move, click on the window, or Tab/keyboard focus. It fades 2 s after the last pointer move (even if the pointer rests on the bar), on pointer leave, and never while a bar button has keyboard focus (:focus-visible).
4. Hidden-while-running buttons stay focusable (opacity 0, no pointer events), so Tab reaches them and focus reveals the bar.
5. Starting from the bar by mouse hides the bar at once. Keyboard-activated Start keeps it up. Pointer movement brings it back.
6. Closing settings while running leaves the bar hidden, unless a keyboard-initiated focus return reveals it.
7. Click on the empty window never opens settings. Running, it only reveals the bar. Stopped, it does nothing.
8. Bar is hidden while settings are open and returns on close. The panel keeps its own Start/Stop.
9. Reduced motion: no fade (instant show and hide).
10. S and Space still ignore input, select, textarea and button targets, so Space on a focused bar button presses it.
11. "Reaching settings" now has four frames (Gear button, Right-click menu, S key, While running).
12. Implementer hint for later tasks: the bar sits at bottom 24px, z-index below the panel and menu, and above the flash layer.
Verification: demo logic driven by scripted events in headless Chrome. No native or cross-platform visual check.

### 2026-11-21 · T16 · done
Title bars, Start/Stop/gear bars, the live window (hero and the three settings-open windows), flash demo traces, flash styles and summary lines, the three warning examples, the whole-panel view and the Later panel are now written as static HTML. The script only binds behaviour. The code that built them (panelHTML and helpers, barHTML, traceSVG, describe, chromeHTML) is removed.
Static markup was captured from the original page's DOM after its script ran, then the script was cut down to bind existing elements.
Verification with scripts stripped (copy in /tmp/t16/nojs/): all 1,280 elements match the original page with scripts on in geometry, display, opacity, background and text. All 15 title bars and all 6 static control bars are present.
Verification with scripts on: Start/Stop, status line, pointer reveal and 2 s fade, gear, S, Space, panel close, add color, validation, and Play flash all work. No console errors.
Checks: format:check, lint, build, test (6 Node, 146 Vitest), README check, and the cargo fmt, clippy and test commands all pass.
Screenshots, gitignored, in the worktree: .nexus/t16-shots/nojs-full.png (full page, scripts off, 1280x11981) and .nexus/t16-shots/nojs-top.png (top of page, scripts off).
Native and cross-platform visuals are unverified, as the plan states.

### 2026-11-21 · H1 · approved
Approved.

### 2026-11-21 · T5 · done
The format:check failure was `.claude/settings.local.json`, a git-ignored file Nexus writes into every worktree. Commit 1a5dbf3 adds `.claude/` to `.prettierignore`. Later tasks need no change.
App takes an optional `initial?: InitialState` prop of `{ settings, autostart }`. main.tsx builds it with `readInitialState(window.location.search, import.meta.env.DEV)`, so production returns plain defaults and ignores every param. Settings live in one `useState` in App, which later tasks can lift. `setSettings` is not destructured yet because lint would flag it unused.
Dev params: interval (seconds), duration, style, intensity, rate, colors (hex without #), idle, autostart=1. Every value goes through sanitizeSettings, and a bad value falls back to its default.
The bar is always in the DOM. While hidden it has opacity 0 and no pointer events, but its buttons stay focusable. Tests read `data-visible` on `data-testid="control-bar"`. The bar is a sibling of FlashSurface inside `<main class="app">`, so it renders above the flash layer (z-index 2, bottom 24px).
`openSettings` in App is a no-op wired to the gear, the `S` key and right-click. The settings task should replace it. The context menu is always suppressed.
Space is handled by a document keydown listener. It ignores form fields, buttons (which handle Space natively), modifier keys and key repeat. Tab reveals the bar while running.
A pointer click on a bar button blurs it (event.detail > 0) so the bar does not stay pinned open. Keyboard focus on a bar button keeps the bar up.
App tests use fake timers and stub a `jest` global, because Testing Library otherwise hangs under Vitest fake timers with user-event.
Live check was headless Chrome on Vite port 5391, now stopped. With interval=3 and duration=2, three flashes came 5 s apart with a 0.6 peak, and the layer was removed between flashes. The bar was hidden while running, appeared on hover, and faded after about 2 s. There were no console errors. Screenshots are in `.nexus/t5-shots/` and git-ignored. Native Tauri visuals and Windows/Linux are unverified. Production-build param ignoring is covered by unit tests only.
URLs for H2 (Vite dev only, use your own port): `/` starts stopped; `/?interval=3&duration=2&autostart=1` flashes every 5 s; `/?interval=1&duration=30&rate=0.25&style=blink&intensity=80&colors=ff4d4d,4dd2ff&autostart=1` gives a long two-color flash.

### 2026-11-21 · H2 · approved
Approved.

### 2026-11-21 · T8 · done
Panel and menu:
- The panel renders only while open. It slides in with a CSS animation and has no slide-out.
- Draft state per field lives in SettingsPanel. Each edit goes through applyDraft, which keeps the last valid value for any invalid field. onChange fires only when the merged settings actually change, so invalid values never reach settings or storage.
- Opening while running leaves the timer alone. Starting from the panel, Space, the bar, or the menu closes the panel.
- Close paths are Escape, the close button, and a pointerdown outside the panel. Focus moves to the interval input on open. On close it returns to the previously focused element inside the window, or to the main window element (now tabIndex -1).
- The control bar gets `hidden` while the panel is open.
- The menu is the DOM component ContextMenu. Its items are Open settings, Start/Stop timer, Preview flash, and Keep on top (menuitemcheckbox). It has arrow, Home, End, and Tab navigation and closes on Escape or an outside click.
- Preview flash in the menu is disabled until a handler is passed as `onPreviewFlash`. T9 should pass one from App and add the `P` key.
- Right-click inside the panel keeps the native menu only on form fields.

For T9:
- SettingsPanel has `<div data-slot="flash">{flashSection}</div>`, hidden when empty. It sits between the Colors group and the Window group. Pass the section through the `flashSection` prop, or render it inside SettingsPanel directly.
- The footer `.actions` grid auto-fits, so a Preview flash button can be added beside Start.
- Drafts only cover interval, unit, duration, colors, and idle color. Always on top reads straight from `settings`.

Persistence and window:
- useSettings(initial, backend, controls) owns state, load, the debounced saver (300 ms default), the pagehide flush, a flush on unmount, and the always-on-top effect. The effect runs on mount and on every change, so the adapter is called with false at startup.
- `backend` undefined uses defaultBackend(). `backend` null turns storage off. Tests pass an in-memory backend through the new `backend` prop and a fake adapter through the new `controls` prop.
- An edit made before the stored settings arrive wins over them and is saved. Stored settings load after the first render, so the idle surface shows at once.
- InitialState has a new optional `overridden`, set by readInitialState when any recognized URL param is present in dev. main.tsx passes `backend={null}` then, so a stale saved value cannot undo the URL params and nothing is written back. T5's URL examples keep working.

Decisions where the spec was silent:
- Timing restart: the task says to call the timer's `restart`. useBlinkTimer already restarts by itself when intervalMs or flashMs change while running. An explicit call from the change handler would use stale values, so App does not call it. Tests cover the restart: an interval change, a duration change, no restart for an invalid value, and no restart for a color-only change.
- Error copy: validateSettings messages for interval and duration now match the mockup and plan decision 10 ("Interval must be between 1 second and 24 hours." and "Flash duration must be between 0.5 and 30 seconds."). model.ts and model.test.ts were updated.
- The mockup puts the idle color in the Colors group. That layout is kept, not the task text's "Window: idle color".
- The mockup's menu has only Settings and Start. The task's four items are used instead.
- The panel's Start/Stop button is the only footer action for now. The mockup's footer also has Preview flash, which T9 adds.

Verification: headless Chrome on Vite port 5473, now stopped. Screenshot at .nexus/t8-panel.png (git-ignored). Capability permissions are unchanged, since T6 and T7 already cover every native call.

### 2026-11-21 · T9 · done
Flash section: SettingsPanel now renders FlashSection directly as the group labelled Flash, between Colors and Window. The `flashSection` prop is removed.
Warning: it has `role="note"` and sits under the intensity slider, as in the mockup. Both sliders reference it through aria-describedby. It switches to the strong state through `isStrongFlash`, with separate copy for fast, hard blink and both. Strong threshold tests cover rate at 2 and 2.25 and blink at 70 and 71, plus the 75 to 100 range.
Sliders: intensity runs 10 to 100 in steps of 5, from the mockup, since the task gave no step. The model still accepts any whole percent. Rate runs 0.25 to 3 in steps of 0.25. Both show their values. Range arrow keys are native, so Vitest only checks focus order, and real arrow-key stepping was checked in headless Chrome.
Mockup preview shape: the approved mockup has no flash-shape preview in the Flash section, so none was built.
Preview flash: App holds a preview key that is negative (so it never equals a timer cycle) plus a timeout for the flash duration. It renders through the same FlashSurface. It never touches useBlinkTimer. Pressing again restarts it. If the timer's flash starts, the preview ends and does not resume. Pressing P during a timer flash does nothing.
Disabled when invalid: SettingsPanel reports invalid state through the new `onInvalidChange` prop, and resets it to false on unmount. The panel button, the `P` key and the menu all honor it. Preview flash in the panel footer sits before Start.
The `P` key follows the Space and S rules: ignored in form fields (including a focused slider) and with modifiers, and ignores key repeat.
Warning role: the mockup used role="status", but the task says role="note", so the task wins.
Tests: one T8 menu test now expects Preview flash enabled. New App.preview.test.tsx and FlashSection.test.tsx. Vitest runs 304 tests. Node runs 6.
Capabilities and CSP are unchanged, and no native calls were added.

### 2026-11-21 · T10 · done
No files changed and no commits made. Vite ran on port 5199 because port 1420 was held by another process. Vite and the native app are stopped.

Screenshots are in `<worktree>/node_modules/.t10-shots/` (gitignored): 01-stopped, 02-settings-via-gear, 03-context-menu, 04-settings-3s-1s, 05-running-blank, 06-running-flash, 07-running-bar-revealed, 08-stopped-again, 09-after-reload-persisted, 10-invalid-interval-0, 11-flash-section-normal, 12-rate-3-strong-warning, 13-preview-flash (all .png). They do not live under `dist/` because `pnpm tauri build` runs `pnpm build`, which empties `dist/`.

Browser findings, all passing:
- Settings open via the gear, `S`, and the right-click menu's "Open settings". The menu lists Open settings, Start timer, Preview flash, Keep on top.
- The control bar is visible (opacity 1) when stopped. While running it is hidden (opacity 0), reappears on pointermove, and fades after about 2 s.
- With 3 s interval and 1 s duration, Start closed the panel and the window was blank. Flash-layer computed opacity was sampled every 50 ms. Flashes started at about 3.0 s and 7.2 s, each lasting about 1 s, with peak opacity about 0.6 (intensity 60%). Flashes are spaced 3 s after the previous flash ends.
- Space stops the timer and the bar shows "Start".
- After reload the settings persisted in localStorage key `blinkr:settings` (3 seconds, 1 second) and the app came up stopped.
- Interval 0 or -5 shows "Interval must be between 1 second and 24 hours." Start and Preview flash are disabled and the invalid value is not stored. Flash duration 0 or 999 also disables Start.
- Rate 3 sets the note's data-strong to true, with text "Strong flashing: Rates above 2 per second are more likely to trigger seizures. Lower the rate." The normal state is data-strong=false.
- Preview flash flashes for about 1 s without starting the timer. Before the final reload there were no console errors or warnings except the favicon 404. After the reload the log was empty.
- Right-click and pointer movement were driven by synthetic contextmenu and pointermove events, because the Chrome tools have no right-click or hover-move action.

Native findings:
- `pnpm tauri build --bundles app --ci` exited 0 and produced `src-tauri/target/release/bundle/macos/Blinkr.app` (10.42 MiB).
- Launched with `open -n`. The process was still up 12 s later and was then killed.
- The store file could not be checked. `~/Library/Application Support/dev.blinkr.desktop/` was never created, since no setting could be changed. System Events keystrokes fail with error 1002 (not allowed to send keystrokes).
- Native visuals and keep-on-top are unverified for the same reason.
- Windows, Linux and CI are unverified.

Defects:

- not blocking · favicon.ico 404 in browser console · index.html (no icon link and no public/favicon.ico)
  GET http://127.0.0.1:5199/favicon.ico: 404; console: [error] Failed to load resource: the server responded with a status of 404 (Not Found)
- not blocking · Native store write not verifiable headlessly · src-tauri (blinkr.json under dev.blinkr.desktop)
  App Support dir dev.blinkr.desktop absent after 12 s of running. No setting could be changed because osascript keystrokes are denied (error 1002).

No commits: nothing to integrate.

### 2026-11-22 · T17 · done
The fix (`overflow: clip` after an `overflow: hidden` fallback on `.app`) and the guard test `src/app/layout.test.ts` were committed by the earlier attempt in f839557. I verified them live in Playwright WebKit at 760x480 on Vite port 5391, then stopped Vite.
Samples are the panel's left edge per animation frame (px); sl is `.app` scrollLeft.
Before (clip line removed temporarily, restored with git checkout):
  gear: 743, 195, 71, 3, then 380; sl 380 mid-animation then 0; not monotonic
  S: 746, 161, 28, then 380; sl 380 then 0; not monotonic
  context-menu: 740, 193, 68, 2, then 380; sl 380 then 0; not monotonic
After (fixed):
  gear: 748, 545, 410, 380; sl 0 throughout; monotonic
  S: 746, 543, 408, 380; sl 0 throughout; monotonic
  context-menu: 732, 564, 443, 381, 380; sl 0 throughout; monotonic
Checks all pass: README requirements, format:check, lint, build, pnpm test (6 Node tests, 305 Vitest tests in 15 files), cargo fmt, clippy and test.
Playwright lives in /tmp/pwk, outside the repo. The panel animation, focus code and CSP are unchanged. Native app visuals are unverified because accessibility automation is denied.

### 2026-11-22 · T18 · done
App state is panel: 'closed' | 'open' | 'closing', and panelOpen is derived from it. SettingsPanel takes closing and onExited.
The panel sets data-state="closing" and --panel-from imperatively in a layout effect, not through React props. This is deliberate: it reads the on-screen offset before the animation switches, so interrupted closes and reopens do not jump.
Exit completion needs the panel's own animationend or animationcancel for panel-out, a matchMedia reduced-motion check, or a 500 ms fallback timer. Stale completions are guarded by effect cleanup and a functional state update.
Reopening during exit keeps the same panel instance and its draft. Only a full close then reopen discards invalid drafts.
I did not use a computed-style check for animation-name none. jsdom reports none, which would have made the exit finish immediately in tests.
Live check in Playwright (Chromium via headless shell 1234, WebKit), Vite on port 5395, stopped afterwards. Script is /tmp/pwk/close.mjs, outside the repo.
Samples are the panel's left edge in px per frame at 760x480. WebKit Close button: 380, 387, 417, 462, 523, 595, 676, 760. Chromium Escape: 380, 394, 430, 482, 544, 620, 705. WebKit reopen mid-exit: 380, 405, 509, 456, 411, 383, 380. WebKit close during entry: 746, 707, 665, 623, 584, 549, 539, then 541 up to 760.
All close paths were monotonic toward the right in both engines, at 760x480 and 360x480. The exception is outside click at 360x480, which is not testable because the panel is full width. scrollLeft stayed 0 in every sample.
Reduced motion removed the panel within 150 ms in both engines and at both sizes.
Native app visuals are unverified because accessibility automation is denied.

### 2026-11-22 · T19 · done
Mockup: design/mockups/controls.html. Screenshots (Chromium and WebKit, JS on and off, per section): /tmp/shots19/. Recommendation: Option A, compact pill (164x54: Start/Stop 100x44 with play/stop glyph, gear 44x44), centered with grid (position absolute, inset 0, place-items center), not a transform. Option B is Start/Stop 148x52 over Settings 128x44, 12px gap, centered as one group, so Start/Stop sits 28px above exact center.
Verified in both engines: all 38 static frames centered at 0px offset; Start and Stop share one box (fixed-width slot); static frames render with JS off; live demo behaves per spec. In WebKit, Tab does not focus buttons by default (Safari preference), so the Tab check in the demo needs Option+Tab there.
Contrast computed in the generator: label at least 5.7, edge at least 3.6, on dark idle, light idle, and 60% amber mid flash.
H4 decisions: option (A recommended, B, or A with changes); placement (group center, both axes); styling (dark pill/buttons with light ring, glyph plus label, 44px hit areas); and P1: keep controls hidden until the drawer finishes closing, then fade in (recommended yes). If yes, T20 changes ControlBar `covered` from panelOpen to panel !== 'closed', with reduced motion returning immediately. No other interaction change is proposed.
Noted risk, no guard proposed: centered controls appear where the pointer rests, so a click right after moving to the middle can hit Start or Stop. Hidden controls keep pointer-events none, as today.
The drawer in the mockup is abridged (Interval, Flash duration, Colors, Idle color, Always on top, footer), not the full panel. The drawer keeps its own Start/Stop in the footer.
Native app visuals unverified (accessibility automation denied). Windows, Linux and remote CI unverified. Cargo checks pass; cargo test runs 0 tests, as before.

### 2026-11-22 · H4 · changes requested
Changes requested at round 1: 2 comments, sent to R1.

Design review of `design/mockups/controls.html`, round 1:

1. region over <section> "Blinkr Start Settings Interval 10 minutes Flash duration 3 …" in scene "Settings drawer open"
   - selector: `body > main:nth-of-type(1) > section:nth-of-type(7)` at fx 0.21, fy 0.27, fw 0.28, fh 0.69
   - **user:** let's make the settings sidebar dark theme
   - screenshot 1 attached
2. region over <div> "Start" in scene "Stopped"
   - selector: `body > main:nth-of-type(1) > section:nth-of-type(4) > div:nth-of-type(1) > figure:nth-of-type(1) > div:nth-of-type(1)` at fx 0.35, fy 0.44, fw 0.28, fh 0.18
   - **user:** I like option A, let's rewrite the mockups to be centered around option A
   - screenshot 2 attached

### 2026-11-22 · R1 · done
Both threads resolved. controls.html now shows only Option A (centered compact pill, 164x54) with a dark settings drawer; Option B is removed everywhere, including the demo's option switch.
Dark drawer palette: sheet #25282c, ink #eef0f2, muted #a9b2ba, field #17191c, field outline #7b848c, unit cell #2f3338, switch track #3c4248 with outline #8d969e, Preview button outline #aab2b9, Start button light fill #f2f3f5 with dark text. A 1px rim at 14% white and a shadow separate it from a light idle color. Focus rings inside the drawer are white. Contrast is computed in the generator (/tmp/gen-r1/gen.mjs, outside the repo) and listed on the page; all pairs meet 4.5 for text and 3 for outlines.
Still open for H4: placement, styling, the dark drawer, and P1 (controls stay hidden until the drawer finishes closing; T20 changes ControlBar `covered` from panelOpen to panel !== 'closed').
Checked in WebKit and Chromium, JS on and off; demo works, no console errors. Native app visuals, Windows, Linux and remote CI unverified.

### 2026-11-22 · H4 · approved
Approved.

Approved at round 2.

### 2026-11-22 · T21 · done
H4 approved, so the drawer is dark. Only src/settings/settings.css changed. The .menu keeps its light tokens (--ink, --sheet). .panel has its own dark token block plus color-scheme: dark, border-left rgba(255 255 255 / 14%) and box-shadow -12px 0 28px rgba(0 0 0 / 45%). New .panel-only tokens: --on-ink, --unit, --btn-line, --focus, --track-line, --range-track.
Decisions: disabled .btn and .add no longer use opacity; they use a dashed outline, muted text and no fill (.add gets the field fill) so text and outlines stay at or above target. The checked switch thumb is --on-ink (dark) on a light track. The remove button is a sheet-colored circle with an ink border. Warnings: calm is amber, strong is red with a 4px left border and the title.
Live check: Chromium (headless shell) and WebKit, 760x480 and 360x480, dark idle and ?idle=f2f3f5, Vite on free port 5471, stopped. Screenshots in /tmp/t21/shots, scripts in /tmp/t21 (outside repo). Compared against the mockup "Drawer open · Light idle" frame; it matches. Every measured pair meets its target; lowest margins are the field outline (3.89) and the range unfilled track (3.30), both 3:1 targets. Full ratio table is in the final message. Firefox range-track rules use the same tokens but were not run. Native app visuals unverified.
Caveats: the left shadow extends about 40px, so a faint dark smear shows at the window's right edge during the first frames of panel-in. In WebKit, one mouse click on the switch did not toggle it, while Space did; the switch markup is unchanged.
Checks: README check, format:check, lint, build, Vitest (15 files, 328 tests), Node tests (6), cargo fmt, clippy, and cargo test all pass.

### 2026-11-22 · T20 · done
Implemented H4's Option A: a 164x54 pill centered in `.app` by grid via `.bar-stage`, which ignores the pointer. Start/Stop has a fixed 100px slot, play/stop glyphs, 44px targets and an unchanged accessible name and shortcut hints. ControlBar moved to `src/app/ControlBar.tsx`, with CSS in `src/App.css`. T17's `overflow: hidden` then `overflow: clip` and T18's exit lifecycle are untouched. No countdown, audio, dependency, capability or CSP change.
H4's verdict was a generic "Approved", so I applied P1 as the recommended and demoed behavior. `covered` is now `panel !== 'closed'` and `reveal()` is a no-op until the panel is closed. The pill fades in with a CSS animation, because a transition cannot run from `display: none`. Reduced motion disables the animation and transition and the panel exit finishes at once.
Focus restore moved from the start of closing to the closed state, since the gear is `display: none` while closing. During closing, focus sits on `main`. `panelReturn` uses `??=` so a reopen mid-exit keeps the first saved target.
Live check in Playwright, Chromium (headless shell 1234) and WebKit, on Vite port 5472 (stopped), at 760x480, 360x480 and 320x240. Script is /tmp/pwk/t20.mjs, screenshots are in /tmp/shots20/ and measurements are in /tmp/shots20/results.txt. The pill center equals the viewport center at every size with 0px Start/Stop shift. `.app` scrollLeft and scrollTop stayed 0 and there was no overflow. There were no console errors.
Unverified: native app visuals, Windows, Linux and remote CI. Jsdom does not verify positioning. In WebKit, Tab needs Option+Tab, so the keyboard checks used that.
T21 can restyle the drawer without touching `src/App.*` or `src/app/`.

### 2026-11-22 · T22 · done
ControlBar now has an exit lifecycle: while `covered`, the bar stays rendered but inert and aria-hidden (data-covered attribute), fades via the existing 0.25s opacity transition, and sets `hidden` only after its own opacity transitionend or transitioncancel. A 400ms fallback timer (BAR_EXIT_FALLBACK_MS) covers a missing event. Reduced motion, or a computed opacity of 0, finishes at once. The effect cleanup on uncover or unmount cancels the timer and listeners. Focus inside the bar is blurred when it is covered, so focusWithin cannot stick. No change to App.tsx, the drawer, the reveal rules, the idle timer, or the CSS animation and transition values; App.css only has a comment update.
Existing tests that asserted `hidden` straight after opening now call a finishBarFade helper first. 12 new tests are in the "control bar exit" describe block. jsdom does not reflect the inert property, so tests read the attribute.
Browser verification used Playwright Chromium (headless shell 1234) and WebKit on Vite port 5493, since stopped. Scripts are /tmp/pwk/t22.mjs and t22b.mjs. Results are in /tmp/shots22/results.txt and results-b.txt, with screenshots in /tmp/shots22/.
The attribution line from the harness was omitted from the commit because the plan-run rules forbid attribution.
Unverified: native app visuals, Windows, Linux and remote CI.

### 2026-11-22 · H3 · approved
Approved.

### 2026-11-22 · Phase 1 · review cycle 1
Pass 1 (T2, T4): T2 (Vitest + settings model) and T4 (CSS flash surface) match their task bodies, with the required tests present and truthful. The only defect is a P2: sanitizeSettings can still throw on nested hostile getters, which JSON-sourced settings never contain.
Pass 2 (T3, T6, T7): T3 timer, T6 persistence and T7 window adapter match their task bodies; no defects found in this slice.
Pass 3 (T1): T1 adds only the self-contained mockup design/mockups/blinkr.html, and it covers every state the task body lists. One P2: in the live demo, Space and the right-click menu's Start bypass the validation that disables the panel's Start button.
Pass 4 (T15): T15 only changes the mockup page `design/mockups/blinkr.html`: the control bar's styles, the static frames, the copy and the live demo's bar logic. The demo logic matches the task body. There is one minor note: after a mouse click on a bar button, S does nothing in Chromium.
Pass 5 (T16): T16 moves all frame content (title bars, control bars, live windows, demo traces, warning specimens, full and Later panels) into static HTML and reduces the script to binding behaviour; the remaining script agrees with the static markup. One P2: the reduced-motion demo figure carries a duplicate class attribute.
Pass 6 (T5): T5 wires App, the control bar, keys and dev URL overrides as the task asks; tests cover every listed case with fake timers and would fail if the behaviour broke. No P0 or P1 defects in this slice.
Pass 7 (T8): T8 builds the settings panel, right-click menu, persistence wiring and always-on-top effect as specified, with tests for each named path. No P0 or P1 defects; three P2 notes on a Space-key bypass of the disabled Start, early-edit overwrite of stored fields, and a weak storage-off test.
Pass 8 (T9, T17): T9's flash section, warning, sliders and preview flash, and T17's overflow: clip fix with its guard test, match their task bodies, and the tests exercise the named states with fake timers. Only two low-impact notes remain: flash-field edits now bypass the panel's documented all-fields-valid onChange contract, and the 5% intensity step can snap a stored non-multiple value.
Pass 9 (T18): T18 keeps SettingsPanel mounted through a closing state. Its own panel-out animationend or animationcancel, a reduced-motion check, or a 500 ms fallback finishes the exit. Effect cleanup and a functional state update guard stale completions. No defects found in this slice.
Pass 10 (T19): T19 adds only the self-contained mockup page design/mockups/controls.html, with no production code changes. The static frames cover every state the task names at all three sizes, and nothing found blocks H4.
Pass 11 (R1): Pass 11 (R1) changes only the design/mockups/controls.html mockup: Option B is removed, the compact pill stays, and the abridged drawer is restyled dark. Every Option B selector, frame and demo toggle was removed cleanly, and no dangling references remain.
Pass 12 (T21, T20, T22): T20 (centered pill controls), T21 (dark drawer) and T22 (control bar exit lifecycle) match their task bodies with no P0/P1 defects; one P2: an interrupted fade-in's transitioncancel can end the bar's exit fade early.
Seams pass: Seams pass found no disagreements between tasks. Types, prop contracts, CSS class and animation names, the store and window adapters, preview keys and capability permissions all line up across the merged slices.
Consolidation: The 13 passes produced 10 distinct P2 findings and no P0 or P1. The eight with the most impact are listed below. Two minor mockup findings went past the 8-finding cap and are recorded in declined so a person still sees them.

Notes:
- F1 · P2 · An edit before load overwrites all stored settings — src/settings/useSettings.ts:44
- F2 · P2 · Space starts the timer while a panel field is invalid — src/App.tsx:255
- F3 · P2 · Interrupted fade-in ends the covered bar's fade-out at once — src/app/ControlBar.tsx:113
- F4 · P2 · Flash edits commit while another panel field is invalid — src/settings/SettingsPanel.tsx:236
- F5 · P2 · Intensity slider step can disagree with the stored value — src/settings/FlashSection.tsx:96
- F6 · P2 · The storage-off test does not check storage — src/App.settings.test.tsx:472
- F7 · P2 · sanitizeSettings throws on a nested throwing getter — src/settings/model.ts:140
- F8 · P2 · Mockup's Space and menu Start ignore validation — design/mockups/blinkr.html:2087

Suspicions:
- Blink may show the previous color for a frame at each iteration boundary — src/flash/FlashSurface.tsx:49 · The color advances through a React state update after the animationiteration event. Blink's keyframe 0% is at peak opacity, so the new iteration may paint the old color at peak until the re-render lands. · confirm by: Record frames in WebKit with blink at 3/s and three colors, and look for one frame of the prior color at each period start.
- Pressing on a bar button and dragging off can keep the bar open while running — src/App.tsx:52 · A mousedown focuses the button, and focus is released only in onClick. If the pointer is released off the button, no click fires, focusWithin stays true, and the bar never hides. · confirm by: While running in headless Chrome, mousedown on Stop, move off, mouseup elsewhere, wait 3 s, and read data-visible on the control bar.
- A second right-click while the menu is open may lose the focus return target — src/App.tsx:283 · The menu's document pointerdown listener closes it and nulls menuReturn. The contextmenu handler then reads a possibly stale menu and keeps menuReturn null, so Escape focuses main instead of the original element. · confirm by: Focus the gear with the keyboard, right-click twice, press Escape, and check which element has focus.
- bar-in animation and the opacity transition both run on every reveal — src/App.css:47 · `.bar--away` sets animation: none, so each change from away to shown restarts bar-in alongside the opacity transition. A reveal in the middle of a fade-out may jump to 0 first. · confirm by: Measure opacity over time in WebKit when the pointer moves during the 2-second idle fade-out.

Spec check:
- extra: createDebouncedSaver(b, ms?) (src/persistence/settingsStore.ts) — The saver adds write serialization. This strengthens it and does not change behaviour.
- extra: (none) .prettierignore adds .claude/ (.prettierignore) — No task asked for this. It is tooling only.
- extra: (none) InitialState.overridden turns storage off when dev URL params are present (src/app/devOverrides.ts) — No task asked for this. It keeps T5's URL examples working and is tested.
- extra: A style toggle, an intensity slider 10–100% (src/settings/FlashSection.tsx) — The step of 5 comes from the mockup. The task gave no step.
- extra: T20: Retain the existing show/hide behavior unless H4 explicitly changes it (src/App.tsx reveal()) — The bar now also stays out while the panel is closing. T22 later mandates the same behaviour.
- misunderstood: Start is disabled while any field is invalid. (src/App.tsx) — The button is disabled, but Space still starts the timer while the panel is open with an invalid field.
- unverifiable: Native and WebKit visuals: flash pulse and blink, panel slide-out, bar fade, and the T17 overflow fix (Tauri build on macOS) — A person should check these by eye in the native window. One case to watch is the reopen-mid-exit jump from 405 to 509 in one frame.
- unverifiable: Store file 'blinkr.json', saved after each set. backgroundThrottling disabled. Always on top. (src-tauri/tauri.conf.json, src-tauri/capabilities/main.json) — Native persistence across restarts, background timing and always-on-top were not exercised.
- unverifiable: Production builds ignore them. (src/main.tsx) — Load a production build with ?autostart=1 and confirm the app starts stopped.
- unverifiable: UI matches the approved mockup in layout, copy, and states, unless the H task verdict changed it. (design/mockups/blinkr.html, design/mockups/controls.html) — Compare the panel, menu, pill-only bar, dark drawer and bar readability over light idle colors. Also confirm the mockup has no flash-shape preview.
- unverifiable: T21: Text needs 4.5:1 and outlines 3:1 (/tmp/t21) — Spot-check the reported field outline ratio of 3.89 and range track ratio of 3.30.
- unverifiable: Screenshot mockups in Chromium and WebKit, including with scripts disabled (.nexus/t16-shots, /tmp/shots19, /tmp/shots20, /tmp/shots22) — The artifacts live outside the diff. The T1 frontend-design skill step is not visible either.

Declined to judge:
- Mockup P2: S is ignored after a mouse click on a bar button (design/mockups/blinkr.html, line 2386). The keydown handler skips button targets, and Chromium keeps focus on the clicked button. — Past the 8-finding cap. It affects the mockup only. The fix is to skip only Space for button targets and let S through.
- Mockup P2: the reduced-motion demo figure has a duplicate class attribute (design/mockups/blinkr.html, line 2105). — Past the 8-finding cap. It renders correctly today. The fix is to delete the second class="shot demo".
- Duplicated constants: the strong-flash thresholds in model.ts and FlashSection.tsx, prefersReducedMotion in three components, and UNITS in two files. — The copies agree today. This is a maintainability point, not a defect.
- Each keystroke in Interval restarts a running timer, for example passing through 1 s while typing 10. — This follows from the task's restart-on-timing-change requirement. The debounce keeps intermediate values out of storage.
- Test hygiene: a schedule test title that does not match its assertions, a weak unmount-mid-exit test, and a test that redefines BAR_EXIT_FALLBACK_MS instead of importing it. — These tests are weak or cosmetic but cost nobody a result. The values agree today.
- The debounced saver is not flushed when the window closes. — No task asked for this. App lifecycle wiring was not in scope.
- Moving the pointer while the panel slides out after Start can reveal the control bar. — It lasts at most one 0.22 s exit and matches the running-state reveal rule.
- Space with keyboard focus on the gear presses the gear instead of toggling the timer. P on a focused button triggers preview. — This is normal button behaviour, and the task only excludes form fields.

Checked:
- Capability list against the native store and window calls, plus plugin registration — src-tauri/capabilities/main.json, src-tauri/src/lib.rs, src/persistence/settingsStore.ts, src/platform/window.ts: load, get, set, save and set-always-on-top are all granted and asserted. The store plugin is registered.
- Timer edge cases: delay overflow, an early fire, a timing change mid-run, stop then start in one batch, and a StrictMode double autostart — src/timer/useBlinkTimer.ts: All of these are handled. The epoch bump re-arms the timer, and start() is idempotent.
- The debounced save chain wedging, or the browser backend throwing synchronously — src/persistence/settingsStore.ts: saveSettings never rejects, and the async methods turn throws into rejections, which are caught.
- Flash CSS: reduced-motion precedence, blink step-end halves, and class and variable names — src/flash/flash.css, src/flash/FlashSurface.tsx: The reduced-motion rule wins on source order, the blink halves are correct, and all names match.
- SettingsPanel exit lifecycle: stale completions, the onExitedRef order, a key remount while closing, and the 500 ms fallback — src/settings/SettingsPanel.tsx, src/App.tsx, src/settings/settings.css: Cleanup guards stale exits, panel-out fits inside the fallback, and Start is not delayed by the exit.
- ControlBar fade: stale timers, the 400 ms fallback, the hidden rule, and pointer events on the stage — src/app/ControlBar.tsx, src/App.css: Cleanup runs on a covered change and on unmount, the 0.25 s transition fits the fallback, and the stage passes pointer events through.
- Where focus lands when the panel closes — src/App.tsx, src/settings/SettingsPanel.tsx: The child blurs first, then App focuses the return target or main. Focus never ends up inside inert content.
- Dev overrides against the storage backend contract — src/main.tsx, src/app/devOverrides.ts, src/settings/useSettings.ts: An overridden state maps to a null backend, so the app neither loads nor saves. The defaults are copied fresh.
- Preview flash keys colliding with timer cycle keys — src/App.tsx, src/timer/schedule.ts, src/flash/FlashSurface.tsx: Preview keys are negative and color comes from pulseIndex, so the keys never collide.
- The menu's Preview flash meeting an invalid draft, or onInvalidChange staying true — src/App.tsx, src/settings/SettingsPanel.tsx: Pointerdown closes the panel first, and cleanup resets the invalid flag on unmount.
- S, Space or P firing while typing or on panel controls — src/App.tsx: The isFormField and isButton guards cover inputs, including radios and ranges, and buttons.
- Mockup helpers or Option B selectors removed but still referenced — design/mockups/blinkr.html, design/mockups/controls.html: No dangling references remain, and every frame is static HTML.

### 2026-11-22 · T11 · done
WindowControls now also has setBorderless, setFullscreen, isFullscreen and startDragging. Any test fake of WindowControls must supply them; App.settings.test.tsx's fakeControls was updated.
isFullscreen() returns boolean | null; null (plain browser or failed call) means unknown and never triggers a resync, so a browser resize cannot reset a stored fullscreen setting.
Apply effects and the resize resync (250 ms trailing debounce) live in useSettings. Dragging is in useWindowDrag, attached to the main element's pointerdown. The drag threshold is 4 px, measured as distance.
Escape leaves fullscreen only when panel === 'closed' (not while closing) and no menu is open.
Fullscreen help copy follows the mockup ("Fullscreen", not "Full screen"). Borderless help adds the Linux resize note. Added .toggle + .toggle spacing in settings.css.
Native visuals (macOS, Windows, Linux) and real Tauri drag and fullscreen behavior are unverified locally; tests use mocks.

### 2026-11-22 · T12 · done
The hotkey is wired in App.tsx through a ref to the current toggle, so it behaves like Space. The panel gets a new optional shortcutError prop, which is the reason string from applyGlobalShortcut. In a browser the reason is the desktop-only message, and on failure it is the "Couldn't register this shortcut. Another app may be using it." message. Off succeeds in a browser without calling Tauri.
Native registration under Tauri was not exercised; macOS accessibility automation is denied. The browser layout was checked in Chrome only, not WebKit, because Playwright is not installed. Windows, Linux and CI are unverified.

### 2026-11-22 · T13 · done
Decisions:
- The picker is the first group in the panel body, above Timing, as in the mockup. The task said "header", but the mockup puts it at the top of the body so the sticky header stays unchanged.
- SettingsPanel takes an optional `presets` prop (PresetControls), so existing panel tests still pass. The picker is left out when it is missing.
- The selected preset id lives in App state and is not persisted. The app starts with none selected. "Modified" is derived by comparing current settings to the selected preset's values.
- Applying a preset calls the timer's restart() when running. The timer's own timing-change effect also restarts, which is harmless.
- Save as new and Update preset are disabled while a panel field is invalid, so last-valid values are not saved while invalid text is shown.
- Delete is immediate, with no confirm step; the mockup shows none.
- usePresets opens its own backend via defaultBackend() when none is given, so in Tauri it calls Store.load for blinkr.json a second time. This relies on the plugin returning the already loaded store.
- sanitizePresets drops entries with a bad or repeated id, an invalid or repeated name, or non-object values. It keeps at most 20 entries.
- No capability changes were needed; the existing store get, set, load and save permissions cover presets.
- Visuals: checked in headless Chrome on the Vite server, which renders the picker and Modified state correctly. The local Playwright WebKit build is mismatched and hung, so WebKit and native were not checked.
- The commit has no Co-Authored-By, per the plan-run rules.

### 2026-11-22 · T14 · done
README Status rewritten. Added Usage (control bar, keys S/Space/P/Escape, right-click menu, presets, window modes, photosensitivity with the 3 per second cap), Platform notes (hotkey off by default and Wayland, Linux borderless resize, throttling disabled on macOS 14+ only), the 12 native permissions matching capabilities/main.json, and the Still unverified list. Everything above Status is unchanged and the preserve check passes.
Checks: format:check, lint, build and pnpm test pass (6 Node, 458 Vitest). cargo fmt, clippy -D warnings and cargo test pass.
Live check, headless Chrome on Vite port 5391, stopped afterwards: saved preset "Quick 3s" and the picker selected it; Borderless and Fullscreen toggles threw no errors; hotkey select showed "Available in the desktop app only." with the invalid state. A 3 s interval with 2 s flash gave flash at 3109 ms, idle at 5108, flash at 8104, idle at 10176. Console: only a 404 for /favicon.ico.
Screenshot of the settings drawer was inspected, then deleted to keep the tree clean. The drawer rendered correctly with the toggles, hotkey error and Wayland note.
macOS: pnpm tauri build --bundles app --ci produced Blinkr.app (10.63 MiB). open launched it and the process was still running after 14 s, without port 1420. I then stopped it.
Unverified: native visuals on macOS (accessibility denied), Windows, Linux, remote CI, Wayland, real Tauri drag, fullscreen and hotkey registration.

Defects:

- not blocking · index.html has no favicon link, so browsers request /favicon.ico and get a 404 · index.html
  GET /favicon.ico: 404 in the Vite dev server, one console error in headless Chrome

### 2026-11-22 · Phase 2 · review cycle 1
Pass 1 (T11): T11 adds borderless and fullscreen settings, adapter methods, the four capabilities, the drag hook, Escape-to-leave-fullscreen and a debounced resize resync, all matching the task body and tested. No P0 or P1 defects found; two timing suspicions need a live check.
Pass 2 (T12): T12 matches its task body and Done means: exact pins, plugin registered on desktop only, the three permissions mirrored in the capabilities test, a sanitized model field, a queued register and unregister that never throws, press-only toggling, the panel select with its help and error copy, and every required test. One P2 only: a failed unregister leaves the old accelerator live while the module believes none is registered.
Pass 3 (T13, T14): T13 presets and T14 README/live check match their task bodies and Done means; no defects found. One unconfirmed native risk: presets and settings each call Store.load on the same file.
Seams pass: Seams pass over T11 to T14 found no disagreements that break behaviour. Model fields, preset keys, the shared store, permissions, drag exclusions and test helpers all agree. One README line overstates how Escape behaves in the preset name field.
Consolidation: Four passes over T11 to T14 found no P0 or P1 defects. Two distinct P2 findings remain: a failed shortcut unregister is forgotten, and the README overstates Escape in the preset name field. Four timing and native-store suspicions need a live check.

Notes:
- F9 · P2 · Failed unregister leaves the old shortcut live but forgotten — src/platform/shortcut.ts:19
- F10 · P2 · README says Escape works everywhere, but the preset name field swallows it — README.md:122

Suspicions:
- Resync may revert a fresh fullscreen toggle on macOS — src/settings/useSettings.ts:98 · The 250 ms trailing debounce assumes resize events keep firing until the OS reports the new state. If the macOS fullscreen animation pauses resize events for over 250 ms while isFullscreen still returns the old value, the resync writes the old value back and undoes the toggle. · confirm by: In the native macOS app, toggle Full screen on and off several times from settings and confirm the switch and window stay in agreement.
- A resync before load would discard the stored settings — src/settings/useSettings.ts:98 · update() before the store loads sets earlyEdit, which replaces every stored field with in-memory defaults and saves them. A resize debounce firing before loadSettings resolves, with isFullscreen true, would do this. · confirm by: A test whose backend resolves after FULLSCREEN_RESYNC_MS, with isFullscreen returning true and a resize at mount, asserting the other stored fields survive.
- Stale registration after a dev page reload when the setting is Off — src/platform/shortcut.ts:24 · The isRegistered cleanup runs only for the accelerator being registered. A reload that comes up with Off leaves an earlier Rust-side registration with a dead channel in place. · confirm by: In a Tauri dev build, register A, reload the webview with the setting Off, and check isRegistered(A).
- Second Store.load of blinkr.json in Tauri — src/presets/usePresets.ts:27 · usePresets and useSettings each call defaultBackend(), so Tauri calls Store.load('blinkr.json') twice at mount. Correctness relies on tauri-plugin-store 2.5.1 reusing the loaded store. The seams pass read the plugin source and found it does, but nobody has confirmed it natively. · confirm by: In the native app, save a preset and change a setting, quit, relaunch, and confirm both persist.

Spec check:
- unverifiable: In borderless mode, a mouse-down on the idle surface ... starts window dragging (src/app/useWindowDrag.ts) — startDragging runs from pointermove after the threshold, not mousedown. Confirm in the native app on macOS, Windows and Linux that the OS still accepts the drag.
- unverifiable: If the user exits fullscreen through the OS, resync on window resize with isFullscreen() (src/settings/useSettings.ts) — Only mocks cover this. Check the macOS green button and keyboard shortcut in the native app.
- unverifiable: Register the plugin in src-tauri/src/lib.rs, on desktop targets only. (src-tauri/src/lib.rs) — Clippy and tests pass on macOS. A person should check that a real hotkey press toggles the timer, and how it fails on Linux under Wayland.
- unverifiable: UI follows the approved mockup (src/settings/SettingsPanel.tsx, src/settings/PresetPicker.tsx) — The mockup shows a switch with a text field for the hotkey, and the code uses the task's select. The picker was checked against markup only, not in WebKit or natively.
- unverifiable: Build and launch the macOS .app and confirm the process stays up. (T14 notes) — Notes claim Blinkr.app ran 14 s. This is not visible in the diff, and presets were not exercised natively.
- unverifiable: Report screenshots and findings in notes (T14 notes) — The screenshot was deleted after inspection, and only a description remains.

Declined to judge:
- The test 'abandons a press when borderless is turned off' turns borderless off before pressing, so it never exercises cancelling a press in progress. — The task did not require that test, and the cancel path in useWindowDrag reads correctly.
- The hidden bar ('bar bar--away') still matches .bar, so a press where the invisible bar sits does not start a drag while running. — It is a small area and the press still reveals the bar. This is conservative behaviour, not a defect.
- The hotkey starts the timer while the open panel has invalid fields. — Space behaves the same way, and the task asked for the hotkey to act like Space. The committed settings stay valid.
- The desktop-only message also marks the select aria-invalid and adds the bad class. — The task asked for the message to replace the failure text. The styling is a judgment call.
- The preset picker sits at the top of the panel body, not the header, and its button says 'Save as new' where the mockup says 'Save'. — The approved mockup puts the picker in the body, and the task body names 'Save as new preset'.
- The test 'keeps the selection when a different preset is not the one deleted' actually deletes the selected preset. — Misleading name only. Delete always acts on the selected preset, so the other branch is unreachable from the UI.
- Preset onSelect calls restart() before the new timing renders. — The timer's timing-change effect starts the schedule again with the preset's timing straight after, so the result is correct.
- Minor items: a held ctrl-click drag on macOS, idempotent setBorderless and setFullscreen calls from defaults on load, no unregister when App unmounts, and select CSS overrides. — Each is outside normal use, harmless, or style only.

Checked:
- Drag exclusion list might not match real class names, including T13's picker — src/app/useWindowDrag.ts, src/app/ControlBar.tsx, src/app/ContextMenu.tsx, src/settings/SettingsPanel.tsx: The .bar, .menu and .panel classes exist and buttons are excluded by tag. PresetPicker renders inside .panel.
- The widened WindowControls interface might leave test fakes stale — src/App.settings.test.tsx, src/App.window.test.tsx, src/platform/window.ts: Both fakes supply all five methods. Typecheck and later tests pass on the merged branch.
- Capabilities, their test and the README permission list might disagree with the calls — src-tauri/capabilities/main.json, tests/capabilities.test.mjs, README.md: All three list the same 12 identifiers in the same order. The shortcut code calls exactly register, unregister and isRegistered.
- Presets and settings share blinkr.json, and a rejected backend could leave presets unloaded — src/persistence/settingsStore.ts, tauri-plugin-store 2.5.1 src/store.rs: load returns the existing store, so the handles share one store. defaultBackend and loadPresets catch errors, and loaded always becomes true.
- Panel copy and layout might drift from the mockup, and aria-describedby might point at a missing id — design/mockups/blinkr.html, src/settings/SettingsPanel.tsx: Toggle labels, help text and placement match. The error id is referenced only when FieldError renders.
- README feature claims and defaults might not match the code — README.md, src/settings/model.ts, src/app/useWindowDrag.ts, src/settings/FlashSection.tsx: Defaults, 4 px drag threshold, warning thresholds, 20-preset limit, restart on apply and three accelerators all match.
- The hotkey might bypass a guard Space has or call a stale toggle — src/App.tsx toggle, keydown handler, toggleRef: Both call the same toggle, and toggleRef is updated every render.
- Keyboard order and form-field guards: menu, panel, fullscreen; Escape and S/P/Space in the preset name input — src/App.tsx: Fullscreen is left only when the panel is closed and no menu is open. stopPropagation stops document-level Escape, and isFormField covers input and select.
- The earlyEdit path when update runs before load — src/settings/useSettings.ts: An early update wins entirely. Escape cannot reach it, and the resync can only in the rare case under suspicions.
- sameSettings might ignore globalShortcut and drop its saves — src/settings/draft.ts: It compares with JSON.stringify, so the field is included.
- StrictMode double-run of the shortcut apply effect — src/main.tsx, src/App.tsx: The queue serializes the calls and the stale flag drops the first result.
- Preset keys might include window or hotkey fields, and restart on apply might be tested only via the timing effect — src/presets/presets.ts PRESET_KEYS, src/App.presets.test.tsx: PRESET_KEYS holds only timing and look fields after sanitizing. The first restart test uses a same-timing preset, so it exercises the explicit restart().

### 2026-11-22 · Final report

Every task and approval in the plan is integrated on `feat/blinkr-app`. Ten P2 review findings remain unfixed, and one defect from T14 is open. Native checks that the run could not perform are listed below.

**Task outcomes**

- T1 · Mockup: Blinkr window, flash, and settings · done · `029a66c`
- H1 · Review the Blinkr mockup · approved
- T15 · Mockup revision: minimal window controls · done · `a63a0f9`
- T16 · Mockup fix: render every frame without JavaScript · done · `0295bef`
- T2 · Vitest and the settings model · done · `35c0453`
- T3 · Drift-free repeating schedule and timer hook · done · `a4e3f9c`
- T4 · CSS-driven flash surface · done · `ee4f856`
- T5 · Wire the timer and flash into the app · done · `8077b19`
- H2 · Check the timer and flash by eye · approved
- T6 · Persist settings with the Tauri store plugin · done · `9d84d11`
- T7 · Window adapter, always-on-top, and background throttling · done · `4b8f4b0`
- T8 · Settings panel with timing, colors, window, and start/stop · done · `f55fd85`
- T9 · Flash controls, photosensitivity warning, and preview · done · `2df38c5`
- T10 · Live check of the phase 1 app in browser and native build · done · `9f1e030`
- H3 · Check the settings panel by eye · approved
- T17 · Fix: settings panel overshoots and snaps back in WebKit · done · `541bdc8`
- T18 · Fix: animate the settings sidebar closing · done · `f9b7c28`
- T19 · Mockup: centered Start/Stop and Settings controls · done · `c4d7988`
- H4 · Approve the redesigned window controls · changes requested once, then approved
- T20 · Implement and verify the approved window controls · done · `6df0d67`
- T21 · Restyle the settings drawer to the dark theme · done · `dd102e2`
- T22 · Fix: fade window controls out when opening settings · done · `ec6e3da`
- T11 · Borderless and fullscreen modes · done · `4442e1c`
- T12 · Global start/stop hotkey, platform-specific · done · `94769e5`
- T13 · Saved presets · done · `d8c8020`
- T14 · Document the app and run the final live check · done · `e164dbd`
- R1 · Round 1: address 2 review comments on controls.html · done · `63d5c5a`

**Deviations**

- The presets picker sits at the top of the panel body, not the header, to match the mockup. Its save button reads "Save as new preset" (T13).
- The hotkey is a select, not the text field the mockup shows (T12).
- The control bar stays hidden while the settings panel closes. T20 introduced this and T22 made it required.
- T5 added beyond the task text: write serialization in the debounced saver, dev URL overrides that turn storage off, and a `.prettierignore` entry for `.claude/`.
- Escape leaves fullscreen only when the panel is closed and no menu is open (T11).
- R1 removed mockup Option B and restyled the drawer dark after H4 requested changes.

**Skipped or not verified by the run**

- Windows and Linux builds were not run. Linux Wayland hotkey behavior is unknown.
- Global hotkey registration was not exercised natively. macOS accessibility automation was denied.
- Real Tauri window drag, fullscreen, store persistence across restarts, always-on-top, background throttling, and the production build with autostart were not exercised natively.
- Playwright WebKit was not installed (T12), and its local build hung (T13). WebKit was not checked for presets or the hotkey.

**Defects reported**

- T14 reported that `index.html` has no favicon link, so `/favicon.ico` returns 404 and the console logs one error. This is non-blocking. No task fixed it.

**Unfixed review findings**

Phase 1 review, cycle 1, reported eight P2 findings. The run recorded an incomplete-review checkpoint and approved it. No fix followed.

- F1 · An edit before load overwrites all stored settings · src/settings/useSettings.ts:44
- F2 · Space starts the timer while a panel field is invalid · src/App.tsx:255
- F3 · An interrupted fade-in ends the covered bar's fade-out at once · src/app/ControlBar.tsx:113
- F4 · Flash edits commit while another panel field is invalid · src/settings/SettingsPanel.tsx:236
- F5 · The intensity slider step can disagree with the stored value · src/settings/FlashSection.tsx:96
- F6 · The storage-off test does not check storage · src/App.settings.test.tsx:472
- F7 · sanitizeSettings throws on a nested throwing getter · src/settings/model.ts:140
- F8 · The mockup's Space and menu Start ignore validation · design/mockups/blinkr.html:2087

Phase 2 review, cycle 1, reported two P2 findings. The run record ends with the review settled and the run back in running, with no fix task.

- F9 · A failed unregister leaves the old shortcut live but forgotten · src/platform/shortcut.ts:19
- F10 · The README says Escape works everywhere, but the preset name field swallows it · README.md:122

**Unconfirmed suspicions**

- A blink may show the previous color for one frame at each period start · src/flash/FlashSurface.tsx:49
- The bar may stay open after a press on a bar button and drag off · src/App.tsx:52
- A second right-click may lose the focus return target · src/App.tsx:283
- The bar-in animation restarts on every reveal, including mid-fade · src/App.css:47
- Resync may revert a fullscreen toggle on macOS · src/settings/useSettings.ts:98
- A resync before load may discard stored settings · src/settings/useSettings.ts:98
- A reload with the hotkey Off may leave a stale registration · src/platform/shortcut.ts:24
- Tauri may call Store.load twice at mount for presets and settings · src/presets/usePresets.ts:27

**Open questions**

- Should F1 to F10 be fixed before merge? F1 and F9 touch stored data and hotkey state.
- Should the run continue with a phase 2 fix round, given the run ended with findings and no fix task?
- Should a favicon link be added to `index.html`?

### 2026-11-22 · Landed
Squash-merge of `feat/blinkr-app` into `main` as `feat(blinkr): add blink timer app with flash, settings, presets`, authored as Jeremy Asuncion.
