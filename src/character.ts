// 一個角色：自己的畫布、網格、物理、動作和對話框。main.ts 可以放好幾個。
import { Renderer, type DrawItem } from './gl';
import { buildMesh } from './mesh';
import { Model, type CharConf, type Rig, type RigLayer } from './model';
import { clampParams, defaultParams, type Params } from './params';
import { HairPhysics } from './physics';
import { Motion, type Persona } from './motion';
import { Bubble, type CharLines } from './bubble';

export interface CharDef {
  id: string;
  name: string;
  rig: Rig;
  /** 部位圖：'./parts/xxx.png' → data URL */
  images: Record<string, string>;
  conf: CharConf;
  persona?: Partial<Persona>;
}

interface Part {
  layer: RigLayer;
  item: DrawItem;
}

export type HitArea = 'head' | 'cheek' | 'body';

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = src;
  });
}

export class Character {
  readonly id: string;
  readonly rig: Rig;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: Renderer;
  readonly model: Model;
  readonly motion: Motion;
  readonly physics = new HairPhysics();
  readonly bubble: Bubble;
  parts: Part[] = [];
  params: Params = defaultParams();
  /** debug 面板的手動參數（有值就不跑自動動作） */
  manual: Params | null = null;
  frozen = false;

  constructor(public def: CharDef, public stage: HTMLElement, bubbleEl: HTMLElement, public lines: CharLines, showSeconds: number) {
    this.id = def.id;
    this.rig = def.rig;
    this.canvas = stage.querySelector('canvas')!;
    this.renderer = new Renderer(this.canvas, def.rig.canvas.w, def.rig.canvas.h);
    this.model = new Model(def.rig, def.conf);
    this.motion = new Motion(def.persona);
    this.bubble = new Bubble(bubbleEl, lines, showSeconds);
  }

  async load() {
    for (const layer of this.rig.layers) {
      const src = this.def.images[`./parts/${layer.file}`];
      if (!src) throw new Error(`找不到部位圖 ${this.id}/${layer.file}`);
      const img = await loadImage(src);
      const conf = this.def.conf.parts[layer.name];
      const mesh = buildMesh(img, layer.x, layer.y, conf?.cell ?? 16);
      // 眼白寫入 stencil，瞳孔只畫在眼白裡面
      const stencil = layer.name.endsWith('_white') ? (layer.eye === 'L' ? 1 : 2)
        : layer.name.endsWith('_iris') ? (layer.eye === 'L' ? -1 : -2) : 0;
      this.parts.push({ layer, item: this.renderer.item(mesh, this.renderer.texture(img), stencil) });
    }
  }

  /** 畫布座標 → 螢幕座標 */
  toScreen(x: number, y: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [r.left + (x / this.rig.canvas.w) * r.width, r.top + (y / this.rig.canvas.h) * r.height];
  }

  toCanvas(cx: number, cy: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((cx - r.left) / r.width) * this.rig.canvas.w, ((cy - r.top) / r.height) * this.rig.canvas.h];
  }

  /** 頭部中心在螢幕上的位置 */
  headScreen() {
    return this.toScreen(...this.rig.headCenter);
  }

  /** 螢幕上一點相對於頭部的方向，換成 -1..1 的視線座標 */
  gazeTo(cx: number, cy: number): [number, number] {
    const [hx, hy] = this.headScreen();
    return [((cx - hx) / (window.innerWidth * 0.45)) * 1.6, (-(cy - hy) / (window.innerHeight * 0.45)) * 1.6];
  }

  /** 這一點有沒有畫到她（透明的地方讓給後面的角色） */
  opaqueAt(cx: number, cy: number) {
    const r = this.canvas.getBoundingClientRect();
    if (cx < r.left || cx >= r.right || cy < r.top || cy >= r.bottom) return false;
    const gl = this.renderer.gl;
    const px = Math.floor(((cx - r.left) / r.width) * this.canvas.width);
    const py = Math.floor((1 - (cy - r.top) / r.height) * this.canvas.height);
    const out = new Uint8Array(4);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out[3] > 40;
  }

  hitTest(cx: number, cy: number): HitArea {
    const [x, y] = this.toCanvas(cx, cy);
    const rig = this.rig;
    for (const s of ['L', 'R'] as const) {
      const [bx, by] = rig.blush[s];
      if (Math.hypot(x - bx, (y - by) * 1.3) < rig.headRadius * 0.22) return 'cheek';
    }
    const [hx, hy] = rig.headCenter;
    if (y < hy + 10 && Math.hypot(x - hx, y - hy) < rig.headRadius * 1.15) return 'head';
    if (y < rig.neck[1] - 10 && Math.abs(x - hx) < rig.headRadius) return 'cheek';
    return 'body';
  }

  /** 被戳：回傳實際發生的反應（'wake' 代表剛被叫醒） */
  poke(where: HitArea): HitArea | 'wake' {
    if (this.motion.input()) {
      this.bubble.say('wake');
      this.physics.kick(3);
      this.physics.flick(4);
      return 'wake';
    }
    if (where === 'head') {
      this.motion.react('shy');
      this.physics.kick(5);
      this.physics.flick(3);
      this.bubble.say('head');
    } else if (where === 'cheek') {
      this.motion.react('puff');
      this.physics.kick(2);
      this.bubble.say('cheek');
    } else {
      this.motion.react('body');
      this.physics.kick(2.5);
      this.physics.flick(2);
      this.bubble.say('body');
    }
    return where;
  }

  /** 往前跑一幀：動作 → 物理 → 參數 */
  frame(dt: number, mic: number | null) {
    const m = this.motion;
    let p = m.update(dt);
    m.mic = mic ?? -1;
    if (mic !== null) m.input(); // 有在講話就不會睡著
    m.talk = this.bubble.typing && mic === null ? 1 : Math.max(0, m.talk - dt * 4);
    if (this.manual) p = { ...defaultParams(), ...this.manual };

    // 物理：頭的水平位置 + 傾斜
    const headPx = (p.angleX / 30) * 22 + p.bodyX * 1.3;
    const tilt = (p.angleZ / 30) * 0.17 + (p.bodyZ / 10) * 0.05;
    this.physics.update(dt, headPx, tilt);
    const phys: Params = {};
    this.physics.write(phys, tilt);
    for (const k of Object.keys(phys)) p[k] = (this.manual ? p[k] : 0) + phys[k];

    clampParams(p);
    this.params = p;
    this.bubble.update(dt);
  }

  render(wire = false) {
    for (const part of this.parts) {
      this.model.deform(part.layer, part.item.mesh, this.params);
      part.item.alpha = part.item.hidden ? 0 : this.model.alpha(part.layer.name, this.params);
    }
    this.renderer.draw(this.parts.map((p) => p.item), wire);
  }

  /** 直接指定參數（截圖用），其他參數用預設值 */
  pose(values: Params) {
    this.frozen = true;
    this.params = { ...defaultParams(), ...values };
    clampParams(this.params);
    this.render();
  }

  hide(names: string[]) {
    for (const part of this.parts) part.item.hidden = names.includes(part.layer.name);
    this.render();
  }
}
