// Records the Blinkr feature clips used by the README GIFs, in WebKit like the native app.
//
// 1. Start the frontend from the repo root: pnpm dev
// 2. In a scratch folder: npm i playwright && npx playwright install webkit
// 3. node record.mjs <outDir> [loop|settings|presets|controls ...]
//
// Each clip becomes <outDir>/<name>.webm, plus timings.json with when the scripted part
// starts and ends. Trim each clip to that window, save it as assets/<name>.mp4, then
// render that scene's range and convert it to a GIF (see the comment in index.html).
import { webkit } from 'playwright';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const ONLY = process.argv.slice(3);
const BASE = 'http://127.0.0.1:1420/';
const VP = { width: 880, height: 520 };
mkdirSync(OUT, { recursive: true });

// Fake cursor and keycap HUD, since headless capture shows neither.
const OVERLAY = `
(() => {
  const css = \`
    #demo-cursor { position: fixed; left: 0; top: 0; width: 22px; height: 22px; z-index: 2147483647;
      pointer-events: none; transform: translate(-100px, -100px); transition: opacity .25s; }
    #demo-cursor svg { width: 22px; height: 22px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.5)); transition: transform .12s; transform-origin: 3px 2px; }
    #demo-cursor.down svg { transform: scale(.82); }
    #demo-cursor.hidden { opacity: 0; }
    #demo-keys { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); z-index: 2147483646;
      pointer-events: none; display: flex; gap: 8px; }
    .demo-key { font: 600 18px/1 Inter, -apple-system, system-ui, sans-serif; color: #f2f3f5;
      background: rgba(20,22,27,.92); border: 1.5px solid rgba(255,255,255,.22); border-bottom-width: 3px;
      border-radius: 9px; padding: 9px 14px; min-width: 40px; text-align: center;
      animation: demo-key 1.1s ease-out forwards; }
    @keyframes demo-key { 0% { opacity: 0; transform: translateY(6px) } 12% { opacity: 1; transform: none }
      75% { opacity: 1 } 100% { opacity: 0 } }
  \`;
  addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    const c = document.createElement('div'); c.id = 'demo-cursor';
    c.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    const k = document.createElement('div'); k.id = 'demo-keys'; document.body.appendChild(k);
    addEventListener('mousemove', e => { c.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)'; }, true);
    addEventListener('mousedown', () => c.classList.add('down'), true);
    addEventListener('mouseup', () => c.classList.remove('down'), true);
    window.__cursor = (show) => c.classList.toggle('hidden', !show);
    window.__key = (label) => { const el = document.createElement('div'); el.className = 'demo-key'; el.textContent = label; k.appendChild(el); setTimeout(() => el.remove(), 1150); };
  });
})();
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function helpers(page) {
  let pos = { x: VP.width / 2, y: VP.height + 40 };
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  async function moveTo(x, y, ms = 650) {
    const steps = Math.max(8, Math.round(ms / 16));
    const from = { ...pos };
    for (let i = 1; i <= steps; i++) {
      const t = ease(i / steps);
      await page.mouse.move(from.x + (x - from.x) * t, from.y + (y - from.y) * t);
      await sleep(ms / steps);
    }
    pos = { x, y };
  }
  async function center(locator) {
    const b = await locator.boundingBox();
    if (!b) throw new Error('no box for ' + locator);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  async function click(locator, opts = {}) {
    const c = await center(locator);
    await moveTo(c.x + (opts.dx ?? 0), c.y + (opts.dy ?? 0), opts.ms);
    await sleep(120);
    await page.mouse.down({ button: opts.button ?? 'left' });
    await sleep(90);
    await page.mouse.up({ button: opts.button ?? 'left' });
    await sleep(opts.after ?? 350);
  }
  async function key(k, label = k) {
    await page.evaluate((l) => window.__key(l), label);
    await sleep(160);
    await page.keyboard.press(k);
  }
  async function type(text, delay = 110) {
    await page.keyboard.type(text, { delay });
  }
  async function cursor(show) {
    await page.evaluate((s) => window.__cursor(s), show);
  }
  async function drag(locator, fraction) {
    const b = await locator.boundingBox();
    const y = b.y + b.height / 2;
    // Start on the current thumb position from the input's value.
    const f0 = await locator.evaluate((el) => (el.value - el.min) / (el.max - el.min));
    await moveTo(b.x + b.width * f0, y);
    await sleep(120);
    await page.mouse.down();
    const steps = 30;
    for (let i = 1; i <= steps; i++) {
      const f = f0 + (fraction - f0) * ease(i / steps);
      await page.mouse.move(b.x + b.width * f, y);
      await sleep(22);
    }
    pos = { x: b.x + b.width * fraction, y };
    await sleep(100);
    await page.mouse.up();
    await sleep(300);
  }
  return { moveTo, click, key, type, cursor, drag, setPos: (p) => (pos = p) };
}

const CLIPS = {
  // Start the timer, the bar fades out, the window idles, then flashes and repeats.
  async loop(page, h) {
    await page.goto(BASE + '?interval=4&duration=2.5');
    await page.waitForSelector('.bar');
    return async () => {
      await sleep(900);
      await h.click(page.getByRole('button', { name: /start/i }).first(), { ms: 800, after: 300 });
      await h.moveTo(820, 470, 700);
      await h.cursor(false);
      await sleep(10400);
    };
  },

  // Open the drawer, set the interval and duration, add colors, raise intensity, preview.
  async settings(page, h) {
    await page.goto(BASE);
    await page.waitForSelector('.bar');
    return async () => {
      await sleep(700);
      await h.click(page.getByRole('button', { name: 'Settings' }), { ms: 800, after: 600 });
      const interval = page.getByLabel('Interval', { exact: true });
      await h.click(interval, { dx: -20 });
      await page.keyboard.press('Meta+A');
      await h.type('25');
      await sleep(250);
      const duration = page.getByLabel('Flash duration');
      await h.click(duration, { dx: -40 });
      await page.keyboard.press('Meta+A');
      await h.type('3');
      await sleep(300);
      const add = page.getByRole('button', { name: 'Add color' });
      await h.click(add, { after: 450 });
      await h.click(add, { ms: 300, after: 600 });
      // Scroll the drawer to the flash controls.
      const body = page.locator('.panel .body');
      await h.moveTo(640, 300, 400);
      for (let i = 0; i < 10; i++) {
        await page.mouse.wheel(0, 24);
        await sleep(30);
      }
      await sleep(500);
      await h.drag(page.getByLabel('Intensity'), 0.78);
      await sleep(500);
      await h.click(page.getByRole('button', { name: 'Preview flash' }), { after: 200 });
      await h.moveTo(300, 300, 600);
      await h.cursor(false);
      await sleep(3600);
      void body;
    };
  },

  // Save two presets, then switch between them.
  async presets(page, h) {
    await page.goto(BASE);
    await page.waitForSelector('.bar');
    return async () => {
      await sleep(700);
      await h.key('s', 'S');
      await sleep(700);
      const interval = page.getByLabel('Interval', { exact: true });
      await h.click(interval, { dx: -20, ms: 800 });
      await page.keyboard.press('Meta+A');
      await h.type('25');
      await sleep(250);
      await h.click(page.getByRole('button', { name: 'Save as new' }), { after: 400 });
      await h.type('Deep work', 70);
      await sleep(250);
      await h.click(page.getByRole('button', { name: 'Save preset' }), { after: 700 });

      await h.click(interval, { dx: -20 });
      await page.keyboard.press('Meta+A');
      await h.type('5');
      await sleep(200);
      await h.click(page.getByRole('button', { name: 'Add color' }), { after: 500 });
      await h.click(page.getByRole('button', { name: 'Save as new' }), { after: 400 });
      await h.type('Break', 80);
      await sleep(250);
      await h.click(page.getByRole('button', { name: 'Save preset' }), { after: 900 });

      const select = page.getByLabel('Preset', { exact: true });
      {
        const b = await select.boundingBox();
        await h.moveTo(b.x + b.width - 30, b.y + b.height / 2, 600);
      }
      const ids = await select.evaluate((el) =>
        Array.from(el.options).map((o) => ({ v: o.value, t: o.textContent })),
      );
      const deep = ids.find((o) => o.t === 'Deep work');
      const brk = ids.find((o) => o.t === 'Break');
      await select.selectOption(deep.v);
      await sleep(1300);
      await select.selectOption(brk.v);
      await sleep(1300);
      await select.selectOption(deep.v);
      await sleep(1400);
    };
  },

  // Right-click menu, preview flash, then the keyboard: S, Escape, Space.
  async controls(page, h) {
    await page.goto(BASE);
    await page.waitForSelector('.bar');
    return async () => {
      await sleep(700);
      await h.moveTo(250, 160, 800);
      await sleep(200);
      await page.mouse.down({ button: 'right' });
      await page.mouse.up({ button: 'right' });
      await sleep(700);
      const menu = page.getByRole('menu');
      const item = menu.getByRole('menuitem', { name: /preview/i });
      await h.click(item, { ms: 500, after: 200 });
      await h.moveTo(150, 420, 500);
      await sleep(2600);
      await h.key('s', 'S');
      await sleep(1400);
      await h.key('Escape', 'Esc');
      await sleep(400);
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await sleep(800);
      await h.key(' ', 'Space');
      await sleep(900);
      await h.moveTo(230, 400, 500);
      await sleep(1200);
      await h.cursor(false);
      await sleep(2600);
    };
  },
};

const browser = await webkit.launch();
const timings = {};
for (const [name, setup] of Object.entries(CLIPS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const dir = join(OUT, name + '-raw');
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: VP,
    deviceScaleFactor: 2,
    recordVideo: { dir, size: VP },
  });
  await ctx.addInitScript(OVERLAY);
  const t0 = Date.now();
  const page = await ctx.newPage();
  const h = helpers(page);
  const run = await setup(page, h);
  await sleep(400);
  const start = (Date.now() - t0) / 1000;
  await run();
  const end = (Date.now() - t0) / 1000;
  const video = page.video();
  await ctx.close();
  const path = await video.path();
  renameSync(path, join(OUT, name + '.webm'));
  timings[name] = { start, end };
  console.log(name, timings[name]);
}
writeFileSync(join(OUT, 'timings.json'), JSON.stringify(timings, null, 2));
await browser.close();
