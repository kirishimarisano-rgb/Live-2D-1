// 變形器：把參數換算成每個網格頂點的位置。
// 順序：部位自己的變形（眼睛、嘴、頭髮擺動）→ 頭部轉動（帶深度的球面位移＝視差）→ 身體（傾斜、呼吸）。
import type { Mesh } from './mesh';
import type { Params } from './params';

export interface RigLayer {
  name: string;
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  eye?: 'L' | 'R';
  pivot?: [number, number];
  center?: [number, number];
  anchor?: [number, number];
}

export interface RigEye {
  top: [number, number][];
  bot: [number, number][];
  iris: [number, number, number, number];
  /** 瞳孔可以移動的範圍（px），沒寫就依眼睛大小自動算 */
  move?: [number, number];
  /** 靜止時瞳孔的偏移，沒寫就放在眼睛正中間 */
  rest?: [number, number];
}

export interface Rig {
  canvas: { x: number; y: number; w: number; h: number; bleed?: { left: number; right: number; bottom: number } };
  headCenter: [number, number];
  headRadius: number;
  neck: [number, number];
  bodyPivot: [number, number];
  mouth: [number, number];
  blush: Record<'L' | 'R', [number, number]>;
  eyes: Record<'L' | 'R', RigEye>;
  layers: RigLayer[];
}

/** 每個部位的綁定設定（深度＝轉頭時的視差量；>0 比臉更靠前） */
export interface PartConf {
  depth: number;
  head: boolean;
  /** 頭部權重在這段 y（畫布座標）從 1 漸變到 0，讓頭髮下緣接回身體 */
  fade?: [number, number];
  cell: number;
}

/** 頭髮擺動的範圍：從 y0 開始往下 len 的距離內越來越大，到 fade 這段收回來（接回身體） */
export interface SwayConf {
  y0: number;
  len: number;
  fade: [number, number];
}

/** 每個角色不同的數值（畫布座標，單位 px） */
export interface Tune {
  hairFront: SwayConf;
  hairBack: SwayConf;
  /** 瀏海兩側的深度（側邊的頭髮其實在頭的側面，比較後面） */
  frontHairSideDepth: number;
  tailLen: number;
  ahogeLen: number;
  /** 耳環／垂耳的長度 */
  earringLen: number;
  earLen: number;
  /** 閉嘴的半寬、張嘴的半寬 */
  mouthW: number;
  mouthOpenW: number;
  /** 鼓臉頰時膨起來的中心，相對於臉紅位置往外偏多少（左、右） */
  cheekOffset: [number, number];
  /** 側馬尾的頭部權重在這段 y 遞減一半（下半段比較跟著身體） */
  tailHeadFade: [number, number];
  /** 歪頭的最大角度（弧度） */
  roll: number;
}

export interface CharConf {
  parts: Record<string, PartConf>;
  tune: Tune;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function interp(poly: [number, number][], x: number) {
  if (x <= poly[0][0]) return poly[0][1];
  for (let i = 1; i < poly.length; i++) {
    if (x <= poly[i][0]) {
      const [x0, y0] = poly[i - 1];
      const [x1, y1] = poly[i];
      return x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return poly[poly.length - 1][1];
}

interface EyeGeo {
  top: [number, number][];
  bot: [number, number][];
  x0: number;
  x1: number;
  cx: number;
  cy: number;
  restOff: [number, number];
  rangeX: number;
  rangeY: number;
}

function eyeGeo(e: RigEye): EyeGeo {
  // 上緣（睫毛下緣）只取單調遞增的 x；下緣去掉最後一個（回到右上角的點）
  const top = [...e.top].sort((a, b) => a[0] - b[0]);
  const bot = e.bot.slice(0, -1).sort((a, b) => a[0] - b[0]);
  const x0 = Math.min(top[0][0], bot[0][0]);
  const x1 = Math.max(top[top.length - 1][0], bot[bot.length - 1][0]);
  const cx = (x0 + x1) / 2;
  const cy = (interp(top, cx) + interp(bot, cx)) / 2;
  const [ix, iy, rx] = e.iris;
  return {
    top, bot, x0, x1, cx, cy,
    restOff: e.rest ?? [cx - ix, cy - iy + 2],
    rangeX: e.move?.[0] ?? Math.max(4, (x1 - x0) / 2 - rx * 0.9),
    rangeY: e.move?.[1] ?? 5,
  };
}

export class Model {
  eyes: Record<'L' | 'R', EyeGeo>;

  constructor(public rig: Rig, public conf: CharConf) {
    this.eyes = { L: eyeGeo(rig.eyes.L), R: eyeGeo(rig.eyes.R) };
  }

  /** 把一個部位的網格依參數變形，結果寫進 mesh.pos */
  deform(layer: RigLayer, mesh: Mesh, p: Params) {
    const conf = this.conf.parts[layer.name] ?? { depth: 0, head: true, cell: 16 };
    const tune = this.conf.tune;
    const rig = this.rig;
    const [hcx, hcy] = rig.headCenter;
    const R = rig.headRadius;
    const [nx, ny] = rig.neck;
    const [bpx, bpy] = rig.bodyPivot;

    const ax = p.angleX / 30;
    const ay = p.angleY / 30;
    const roll = (p.angleZ / 30) * tune.roll;
    // 身體：越往上越受影響
    const bodyW = (y: number) => clamp((bpy - y) / 480, 0, 1);
    const bodyRot = (p.bodyZ / 10) * 0.07;
    const bodyAt = (x: number, y: number): [number, number] => {
      const w = bodyW(y);
      const a = bodyRot * w;
      const dx = x - bpx, dy = y - bpy;
      const c = Math.cos(a), s = Math.sin(a);
      let X = bpx + dx * c - dy * s;
      let Y = bpy + dx * s + dy * c;
      X += p.bodyX * 1.3 * w;
      Y -= p.breath * 5 * clamp((bpy - y) / 420, 0, 1);
      return [X, Y];
    };
    // 頭跟著脖子那一點的身體變形整塊移動
    const [nX, nY] = bodyAt(nx, ny);
    const neckRot = bodyRot * bodyW(ny);

    const eye = layer.eye ? this.eyes[layer.eye] : null;
    const eyeOpen = layer.eye === 'L' ? p.eyeLOpen : p.eyeROpen;

    const rest = mesh.rest;
    const out = mesh.pos;
    for (let i = 0; i < mesh.count; i++) {
      let x = rest[i * 2];
      let y = rest[i * 2 + 1];

      // ---------- 1. 部位自己的變形 ----------
      switch (layer.name) {
        case 'eyeL_white':
        case 'eyeR_white': {
          const b = interp(eye!.bot, x);
          y = b + (y - b) * clamp(eyeOpen, 0, 1.25);
          // 快閉上時兩端也往中間收，眼角不會露出白邊
          x = eye!.cx + (x - eye!.cx) * (0.72 + 0.28 * clamp(eyeOpen, 0, 1));
          break;
        }
        case 'eyeL_iris':
        case 'eyeR_iris': {
          const e = eye!;
          x += e.restOff[0] + p.eyeBallX * e.rangeX;
          y += e.restOff[1] - p.eyeBallY * e.rangeY;
          const b = interp(e.bot, x);
          y = b + (y - b) * clamp(eyeOpen, 0, 1.25);
          break;
        }
        case 'eyeL_lash':
        case 'eyeR_lash': {
          const e = eye!;
          const d = interp(e.bot, x) - interp(e.top, x);
          const close = 1 - eyeOpen; // <0 代表睜大
          y += close * d * (1 - 0.78 * p.eyeSmile * clamp(close, 0, 1));
          // 閉眼時睫毛稍微變扁
          const mid = (interp(e.top, x) + interp(e.bot, x)) / 2;
          y += (mid - y) * 0.12 * clamp(close, 0, 1) * (1 - p.eyeSmile);
          break;
        }
        case 'browL':
        case 'browR': {
          const cx = layer.x + layer.w / 2, cy = layer.y + layer.h / 2;
          const sgn = layer.eye === 'L' ? 1 : -1;
          const a = p.browAngle * 0.16 * sgn;
          const dx = x - cx, dy = y - cy;
          x = cx + dx * Math.cos(a) - dy * Math.sin(a);
          y = cy + dx * Math.sin(a) + dy * Math.cos(a);
          y += -p.browY * 8 + (1 - clamp((p.eyeLOpen + p.eyeROpen) / 2, 0, 1)) * 3;
          break;
        }
        case 'mouth_closed': {
          const [mx] = rig.mouth;
          const u = (x - mx) / tune.mouthW;
          y -= p.mouthForm * 5 * u * u;
          x = mx + (x - mx) * (1 - 0.35 * p.cheekPuff);
          break;
        }
        case 'mouth_open': {
          const [ax0, ay0] = layer.anchor!;
          const m = p.mouthOpen;
          const u = (x - ax0) / tune.mouthOpenW;
          y = ay0 + (y - ay0) * (0.1 + 0.9 * m);
          x = ax0 + (x - ax0) * (0.75 + 0.25 * m) * (1 + 0.18 * p.mouthForm);
          y -= p.mouthForm * 5 * u * u;
          break;
        }
        case 'face': {
          // 鼓臉頰：臉頰附近的頂點往外推
          if (p.cheekPuff > 0) {
            for (const side of ['L', 'R'] as const) {
              const [bx, by] = rig.blush[side];
              const ox = tune.cheekOffset[side === 'L' ? 0 : 1];
              const dx = x - (bx + ox), dy = y - (by + 18);
              const g = Math.exp(-(dx * dx + dy * dy) / (2 * 42 * 42));
              const vx = x - hcx, vy = (y - hcy) * 0.4;
              const len = Math.hypot(vx, vy) || 1;
              x += (vx / len) * 16 * p.cheekPuff * g;
              y += (vy / len) * 16 * p.cheekPuff * g + 4 * p.cheekPuff * g;
            }
          }
          break;
        }
        case 'front_hair': {
          // 瀏海與側髮擺動：越靠近髮尾擺越大，下緣要接回身體所以又收回來
          const h = tune.hairFront;
          const f = Math.pow(clamp((y - h.y0) / h.len, 0, 1), 1.5) * (1 - smooth(h.fade[0], h.fade[1], y));
          x += p.hairFront * 12 * f;
          y += Math.abs(p.hairFront) * 2 * f;
          break;
        }
        case 'back_hair': {
          const h = tune.hairBack;
          const f = Math.pow(clamp((y - h.y0) / h.len, 0, 1), 1.5) * (1 - smooth(h.fade[0], h.fade[1], y));
          x += p.hairBack * 12 * f;
          break;
        }
        case 'tail':
        case 'ahoge': {
          // 兩節彎曲：根部跟著第一節轉，越往末端再加上第二節的彎
          const [px, py] = layer.pivot!;
          const tail = layer.name === 'tail';
          const len = tail ? tune.tailLen : tune.ahogeLen;
          const v1 = tail ? p.tail : p.ahoge;
          const v2 = tail ? p.tail2 : p.ahoge2;
          const dx = x - px, dy = y - py;
          const t = clamp(Math.hypot(dx, dy) / len, 0, 1);
          const a = (tail ? 0.2 : 0.22) * v1 * t + (tail ? 0.16 : 0.18) * v2 * t * t;
          x = px + dx * Math.cos(a) - dy * Math.sin(a);
          y = py + dx * Math.sin(a) + dy * Math.cos(a);
          break;
        }
        case 'earring': {
          const [px, py] = layer.pivot!;
          const dx = x - px, dy = y - py;
          const t = clamp(Math.hypot(dx, dy) / tune.earringLen, 0, 1);
          const a = p.earring * 0.6 * Math.min(1, t * 2);
          x = px + dx * Math.cos(a) - dy * Math.sin(a);
          y = py + dx * Math.sin(a) + dy * Math.cos(a);
          break;
        }
        case 'earL':
        case 'earR': {
          // 垂耳：繞著根部擺，越靠近耳尖擺越多（耳朵在頭兩側，往外甩比往內甩容易）
          const [px, py] = layer.pivot!;
          const v = layer.name === 'earL' ? p.earL : p.earR;
          const dx = x - px, dy = y - py;
          const t = clamp(Math.hypot(dx, dy) / tune.earLen, 0, 1);
          const a = v * 0.32 * t * (0.6 + 0.4 * t);
          x = px + dx * Math.cos(a) - dy * Math.sin(a);
          y = py + dx * Math.sin(a) + dy * Math.cos(a);
          break;
        }
      }

      // ---------- 2. 頭部轉動 ----------
      let hx = x, hy = y;
      let wHead = conf.head ? 1 : 0;
      if (conf.fade) wHead *= 1 - smooth(conf.fade[0], conf.fade[1], rest[i * 2 + 1]);
      if (layer.name === 'tail') {
        const [a0, a1] = tune.tailHeadFade;
        wHead *= 1 - 0.55 * clamp((rest[i * 2 + 1] - a0) / (a1 - a0), 0, 1);
      }
      if (wHead > 0) {
        const u = (x - hcx) / R, v = (y - hcy) / R;
        const zc = Math.sqrt(Math.max(0, 1 - 0.75 * (u * u + v * v)));
        // 球面：中間（鼻子附近）移動最多，邊緣移動少 → 一邊被壓扁、一邊被拉開
        // 瀏海兩側其實在頭的側面（比較後面），深度往兩側遞減，才不會和馬尾、後髮拉開縫
        let depth = conf.depth;
        if (layer.name === 'front_hair') depth = depth + (tune.frontHairSideDepth - depth) * smooth(0.45, 0.95, Math.abs(u));
        let dx = ax * R * (0.075 * depth + 0.085 * zc);
        let dy = -ay * R * (0.055 * depth + 0.065 * zc);
        // 轉向的那一側稍微壓縮（透視）
        dx -= ax * R * 0.03 * u * Math.abs(u);
        dy += ay * R * 0.02 * v * Math.abs(v);
        let X = x + dx, Y = y + dy;
        // 歪頭：繞脖子旋轉
        const c = Math.cos(roll + neckRot), s = Math.sin(roll + neckRot);
        const rx = X - nx, ry = Y - ny;
        X = nX + rx * c - ry * s;
        Y = nY + rx * s + ry * c;
        hx = X;
        hy = Y;
      }

      // ---------- 3. 身體 ----------
      if (wHead < 1) {
        const [bx, by] = bodyAt(x, y);
        hx = bx + (hx - bx) * wHead;
        hy = by + (hy - by) * wHead;
      }
      out[i * 2] = hx;
      out[i * 2 + 1] = hy;
    }
  }

  /** 各部位的透明度（張嘴/閉嘴切換、臉紅） */
  alpha(name: string, p: Params) {
    const side = name.startsWith('eyeL') ? 'L' : name.startsWith('eyeR') ? 'R' : null;
    if (side) {
      const open = side === 'L' ? p.eyeLOpen : p.eyeROpen;
      const shut = 1 - smooth(0.07, 0.2, open); // 0 = 睜開、1 = 閉上
      const part = name.slice(5);
      if (part === 'white' || part === 'iris' || part === 'lower') return smooth(0.02, 0.12, open);
      if (part === 'lash') return 1 - shut;
      if (part === 'closed') return shut * (1 - p.eyeSmile);
      if (part === 'smile') return shut * p.eyeSmile;
    }
    switch (name) {
      case 'mouth_closed':
        return 1 - smooth(0.06, 0.3, p.mouthOpen);
      case 'mouth_open':
        return smooth(0.04, 0.24, p.mouthOpen);
      case 'blush':
        return clamp(p.blush, 0, 1);
      default:
        return 1;
    }
  }
}
