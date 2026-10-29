import rigJson from './assets/rig.json';
import { Renderer, type DrawItem } from './gl';
import { buildMesh } from './mesh';
import { Model, PART_CONF, type Rig, type RigLayer } from './model';
import { clampParams, defaultParams, PARAMS, type Params } from './params';
import { HairPhysics } from './physics';
import { Motion } from './motion';
import { LipSync } from './lipsync';
import { Bubble, loadLines } from './bubble';
import { DebugPanel } from './debug';
import { Background } from './background';

const rig = rigJson as unknown as Rig;
const images = import.meta.glob('./assets/parts/*.png', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = src;
  });
}

interface Part {
  layer: RigLayer;
  item: DrawItem;
}

async function main() {
  const qs = new URLSearchParams(location.search);
  const debugMode = qs.get('debug') === '1';
  const bg = new Background(document.getElementById('bg') as HTMLCanvasElement);
  // ?hour=20 可以固定背景的時刻（0～24），不加就用現在的時間
  if (qs.has('hour')) bg.hour = parseFloat(qs.get('hour')!);
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const renderer = new Renderer(canvas, rig.canvas.w, rig.canvas.h);
  const model = new Model(rig);

  const parts: Part[] = [];
  for (const layer of rig.layers) {
    const src = images[`./assets/parts/${layer.file}`];
    if (!src) throw new Error(`找不到部位圖 ${layer.file}`);
    const img = await loadImage(src);
    const conf = PART_CONF[layer.name];
    const mesh = buildMesh(img, layer.x, layer.y, conf?.cell ?? 16);
    // 眼白寫入 stencil，瞳孔只畫在眼白裡面
    const stencil = layer.name.endsWith('_white') ? (layer.eye === 'L' ? 1 : 2)
      : layer.name.endsWith('_iris') ? (layer.eye === 'L' ? -1 : -2) : 0;
    parts.push({ layer, item: renderer.item(mesh, renderer.texture(img), stencil) });
  }
  const items = parts.map((p) => p.item);

  const lines = loadLines();
  const motion = new Motion();
  motion.sleepAfter = lines.settings.sleepAfterSeconds;
  const physics = new HairPhysics();
  const lip = new LipSync();
  const bubble = new Bubble(document.getElementById('bubble')!, lines, lines.settings.showSeconds);
  let nextIdleLine = 3;

  const poke = (where: string) => {
    const woke = motion.input();
    if (woke) {
      bubble.say('wake');
      physics.kick(3);
      return;
    }
    if (where === 'head') {
      motion.react('shy');
      physics.kick(5);
      bubble.say('head');
    } else if (where === 'cheek') {
      motion.react('puff');
      physics.kick(2);
      bubble.say('cheek');
    } else {
      motion.react('body');
      physics.kick(2.5);
      bubble.say('body');
    }
  };
  const forceSleep = () => {
    motion.sleeping = true;
  };
  const debug = debugMode ? new DebugPanel(poke, forceSleep) : null;

  // ---- 滑鼠 / 觸控 ----
  const toCanvas = (cx: number, cy: number) => {
    const r = canvas.getBoundingClientRect();
    return [((cx - r.left) / r.width) * rig.canvas.w, ((cy - r.top) / r.height) * rig.canvas.h];
  };
  window.addEventListener('pointermove', (e) => {
    const [x, y] = toCanvas(e.clientX, e.clientY);
    const r = canvas.getBoundingClientRect();
    const [hx, hy] = rig.headCenter;
    // 以頭為中心，螢幕寬度的一部分當作 ±1
    const sx = (x - hx) / ((window.innerWidth / r.width) * rig.canvas.w * 0.45);
    const sy = -(y - hy) / ((window.innerHeight / r.height) * rig.canvas.h * 0.45);
    const woke = motion.input();
    if (woke) {
      bubble.say('wake');
      physics.kick(3);
    }
    motion.look(sx * 1.6, sy * 1.6);
  });
  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = toCanvas(e.clientX, e.clientY);
    poke(hitTest(x, y));
  });
  window.addEventListener('keydown', () => motion.input());

  function hitTest(x: number, y: number) {
    for (const s of ['L', 'R'] as const) {
      const [bx, by] = rig.blush[s];
      if (Math.hypot(x - bx, (y - by) * 1.3) < 52) return 'cheek';
    }
    const [hx, hy] = rig.headCenter;
    if (y < hy + 10 && Math.hypot(x - hx, y - hy) < rig.headRadius * 1.15) return 'head';
    if (y < rig.neck[1] - 10 && Math.abs(x - hx) < rig.headRadius) return 'cheek';
    return 'body';
  }

  // ---- 麥克風 ----
  const micBtn = document.getElementById('mic') as HTMLButtonElement;
  micBtn.addEventListener('click', async () => {
    motion.input();
    if (lip.active) {
      lip.stop();
      micBtn.classList.remove('on');
      micBtn.textContent = '🎤 對嘴';
      motion.mic = -1;
      bubble.say('micOff');
      return;
    }
    try {
      await lip.start();
      micBtn.classList.add('on');
      micBtn.textContent = '🎤 對嘴中（再按一次關閉）';
      bubble.say('micOn');
    } catch (err) {
      console.warn(err);
      bubble.say('micError');
    }
  });

  // ---- 主迴圈 ----
  let params: Params = defaultParams();
  let last = performance.now();
  let frozen = false;

  const frame = (dt: number) => {
    let p = motion.update(dt);
    if (lip.active) {
      motion.mic = lip.read(dt);
      motion.input(); // 有在講話就不會睡著
    }
    motion.talk = bubble.typing && !lip.active ? 1 : Math.max(0, motion.talk - dt * 4);
    if (debug?.manual) p = { ...defaultParams(), ...debug.values };

    // 物理：頭的水平位置 + 傾斜
    const headPx = (p.angleX / 30) * 22 + p.bodyX * 1.3;
    const tilt = (p.angleZ / 30) * 0.17 + (p.bodyZ / 10) * 0.05;
    physics.update(dt, headPx, tilt);
    const phys: Params = {};
    physics.write(phys, tilt);
    for (const k of Object.keys(phys)) p[k] = (debug?.manual ? p[k] : 0) + phys[k];

    clampParams(p);
    params = p;

    // 隨機台詞
    bubble.update(dt);
    if (motion.t > nextIdleLine) {
      const [a, b] = lines.settings.idleLineEverySeconds;
      nextIdleLine = motion.t + a + Math.random() * (b - a);
      if (motion.sleeping) bubble.say('sleep', false);
      else if (!bubble.visible) bubble.say(motion.t < 5 ? 'greeting' : 'idle', false);
    }
    bg.update(dt);
    render();
  };

  const render = () => {
    bg.draw();
    for (const part of parts) {
      model.deform(part.layer, part.item.mesh, params);
      part.item.alpha = part.item.hidden ? 0 : model.alpha(part.layer.name, params);
    }
    renderer.draw(items, !!debug?.wire);
    debug?.sync(params);
  };

  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!frozen) frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // 給截圖腳本與自己調整用的介面
  (window as unknown as { kanban: unknown }).kanban = {
    params: () => ({ ...params }),
    paramList: PARAMS,
    /** 停止自動動作，直接指定參數並重畫 */
    pose(values: Params) {
      frozen = true;
      params = { ...defaultParams(), ...values };
      clampParams(params);
      render();
    },
    /** 恢復自動動作 */
    resume() {
      frozen = false;
      last = performance.now();
    },
    /** 用固定的時間步長往前跑 n 秒（截圖用，結果和電腦快慢無關） */
    advance(seconds: number, step = 1 / 60) {
      frozen = true;
      for (let t = 0; t < seconds; t += step) frame(step);
    },
    /** 隱藏某些部位（除錯用），例如 kanban.hide(['front_hair']) */
    hide(names: string[]) {
      for (const part of parts) part.item.hidden = names.includes(part.layer.name);
      render();
    },
    poke,
    sleep: forceSleep,
    lookAt(x: number, y: number) {
      motion.look(x, y);
    },
    physics,
    motion,
  };
  document.body.dataset.ready = '1';
}

main().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;left:8px;bottom:8px;color:#a00">${String(e)}</pre>`);
});
