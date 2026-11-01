// 近拍某個區域的多個姿勢，排成一張圖：node tools/zoom.mjs out.png x0,y0,x1,y1 '[{...},{...}]' [pink|maid]
// 座標是那個角色的畫布座標（pink 890×1244、maid 736×778）
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = createRequire(import.meta.url)('playwright')); }
const [out, rect, posesJson, who = 'pink'] = process.argv.slice(2);
const [x0, y0, x1, y1] = rect.split(',').map(Number);
const poses = JSON.parse(posesJson);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 1100, height: 820 }, deviceScaleFactor: 2 });
await pg.goto(pathToFileURL(resolve('dist/index.html')).href);
await pg.waitForSelector('body[data-ready="1"]');
const box = await pg.locator(`#stage-${who}`).boundingBox();
const k = box.width / (await pg.evaluate((w) => kanban.chars[w].rig.canvas.w, who));
const shots = [];
for (const p of poses) {
  await pg.evaluate(([v, w]) => kanban.pose(v, w), [p, who]);
  const clip = { x: Math.max(0, box.x + x0 * k), y: box.y + y0 * k, width: (x1 - x0) * k, height: (y1 - y0) * k };
  clip.height = Math.min(clip.height, 820 - clip.y);
  shots.push(await pg.screenshot({ clip }));
}
// 拼圖：用一個空白頁的 canvas
const urls = shots.map((s) => 'data:image/png;base64,' + s.toString('base64'));
const pg2 = await b.newPage();
const data = await pg2.evaluate(async (urls) => {
  const imgs = await Promise.all(urls.map((u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; })));
  const w = imgs[0].width, h = imgs[0].height, cols = Math.min(3, imgs.length);
  const c = document.createElement('canvas'); c.width = w * cols; c.height = h * Math.ceil(imgs.length / cols);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  imgs.forEach((im, i) => g.drawImage(im, (i % cols) * w, Math.floor(i / cols) * h));
  return c.toDataURL('image/png');
}, urls);
(await import('node:fs')).writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
await b.close();
