// 用 Playwright 開打包好的 dist/index.html，擺各種參數拍照到 screenshots/。
// 用法：node tools/shots.mjs <前綴> [pose名稱...]
//   兩個角色都會拍：screenshots/<前綴>-pink-<pose>.png、<前綴>-maid-<pose>.png
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// 專案裡有裝 playwright 就用專案的，否則用全域的
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = createRequire(import.meta.url)('playwright')); }

const prefix = process.argv[2] || 'shot';
const only = process.argv.slice(3);
const url = pathToFileURL(resolve('dist/index.html')).href;
mkdirSync('screenshots', { recursive: true });

// 靜態姿勢（直接指定參數）
const POSES = {
  rest: {},
  'turn-left': { angleX: -30, eyeBallX: -1 },
  'turn-right': { angleX: 30, eyeBallX: 1 },
  'look-up': { angleY: 30, eyeBallY: 1 },
  'look-down': { angleY: -30, eyeBallY: -1 },
  'tilt': { angleZ: 30, bodyZ: 10 },
  'corner': { angleX: 30, angleY: -30, angleZ: -30, bodyX: 10, bodyZ: -10, eyeBallX: 1, eyeBallY: -1 },
  'corner2': { angleX: -30, angleY: 30, angleZ: 30, bodyX: -10, bodyZ: 10, eyeBallX: -1, eyeBallY: 1 },
  'eyes-half': { eyeLOpen: 0.5, eyeROpen: 0.5 },
  'eyes-closed': { eyeLOpen: 0, eyeROpen: 0 },
  'eyes-smile': { eyeLOpen: 0, eyeROpen: 0, eyeSmile: 1, blush: 1, mouthForm: 1 },
  'eyes-wide': { eyeLOpen: 1.2, eyeROpen: 1.2, browY: 1 },
  'wink': { eyeLOpen: 1, eyeROpen: 0, eyeSmile: 1, mouthForm: 1 },
  'mouth-open': { mouthOpen: 1 },
  'mouth-talk': { mouthOpen: 0.45, mouthForm: 0.4 },
  'mouth-frown': { mouthForm: -1, browAngle: 1 },
  'cheek-puff': { cheekPuff: 1, blush: 0.6, browAngle: 0.8, mouthForm: -0.6 },
  'hair-swing': { hairFront: 1, hairBack: -1, tail: 1, ahoge: 1, earring: 1, earL: 1, earR: 1 },
  'hair-swing2': { hairFront: -1, hairBack: 1, tail: -1, ahoge: -1, earring: -1, earL: -1, earR: -1 },
  'breath-in': { breath: 1 },
};

// 動態場景（跑一段時間的模擬再拍）
const SCENES = {
  'live-shy': async (page) => page.evaluate(() => { kanban.advance(1.0); kanban.poke('head'); kanban.advance(0.6); }),
  'live-puff': async (page) => page.evaluate(() => { kanban.advance(1.0); kanban.poke('cheek'); kanban.advance(0.6); }),
  'live-maid-shy': async (page) => page.evaluate(() => { kanban.advance(6.0); kanban.poke('head', 'maid'); kanban.advance(1.2); }),
  'live-maid-puff': async (page) => page.evaluate(() => { kanban.advance(6.0); kanban.poke('cheek', 'maid'); kanban.advance(0.6); }),
  'live-chat': async (page) => page.evaluate(() => { kanban.advance(6.0); kanban.chat(1); kanban.advance(2.4); }),
  'live-sleep': async (page) => page.evaluate(() => { kanban.sleep(); kanban.advance(6); }),
  'live-wake': async (page) => page.evaluate(() => { kanban.sleep(); kanban.advance(6); kanban.poke('head'); kanban.advance(0.25); }),
  'live-look-left': async (page) => page.evaluate(() => { kanban.lookAt(-1, 0.3); kanban.advance(1.5); }),
  'live-look-right': async (page) => page.evaluate(() => { kanban.lookAt(1, -0.3); kanban.advance(1.5); }),
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
for (const debug of [false, true]) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 820 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url + (debug ? '?debug=1' : ''));
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
  const names = Object.keys(POSES).filter((n) => !only.length || only.includes(n));
  for (const who of ['pink', 'maid']) {
    // 女僕的畫布有一部分在畫面外面，只拍看得到的部分
    const box = await page.locator(`#stage-${who}`).boundingBox();
    const vp = page.viewportSize();
    const x0 = Math.max(0, box.x), y0 = Math.max(0, box.y);
    const clip = { x: x0, y: y0, width: Math.min(vp.width, box.x + box.width) - x0, height: Math.min(vp.height, box.y + box.height) - y0 };
    for (const name of debug ? names.filter((n) => ['rest', 'corner', 'eyes-closed', 'cheek-puff', 'hair-swing'].includes(n)) : names) {
      await page.evaluate(([v, w]) => kanban.pose(v, w), [POSES[name], who]);
      await page.screenshot({ clip, path: `screenshots/${prefix}-${who}-${name}${debug ? '-mesh' : ''}.png` });
    }
  }
  if (!debug) {
    for (const [name, run] of Object.entries(SCENES)) {
      if (only.length && !only.includes(name)) continue;
      await page.reload();
      await page.waitForSelector('body[data-ready="1"]');
      await run(page);
      await page.waitForTimeout(400); // 等對話框淡入
      await page.screenshot({ path: `screenshots/${prefix}-${name}.png` });
    }
  }
  await page.close();
}
await browser.close();
if (errors.length) {
  console.error('頁面錯誤：\n' + errors.join('\n'));
  process.exit(1);
}
console.log('done');
