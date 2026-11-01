// 背景：粉色系房間的一面牆、一扇窗（天空依現在的時間變成白天／黃昏／晚上）、
// 窗簾、串燈、飄落的花瓣。全部用 Canvas 2D 畫，會跟著滑鼠有一點視差。

interface Petal { x: number; y: number; vx: number; vy: number; r: number; rot: number; spin: number; hue: number; }
interface Cloud { x: number; y: number; s: number; v: number; }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// 天空的顏色：[時刻, 上方, 下方, 星星亮度]
const SKY: [number, RGB, RGB, number][] = [
  [0, [28, 30, 74], [86, 70, 128], 1],
  [5, [40, 44, 96], [150, 110, 160], 0.7],
  [6.5, [150, 170, 230], [255, 196, 200], 0.1],
  [9, [140, 200, 245], [214, 236, 252], 0],
  [16, [130, 190, 240], [220, 232, 250], 0],
  [18, [120, 130, 200], [255, 170, 160], 0.1],
  [19.5, [60, 56, 120], [200, 120, 150], 0.5],
  [21, [30, 32, 80], [96, 76, 136], 1],
  [24, [28, 30, 74], [86, 70, 128], 1],
];

function skyAt(hour: number) {
  for (let i = 1; i < SKY.length; i++) {
    if (hour <= SKY[i][0]) {
      const [h0, t0, b0, s0] = SKY[i - 1];
      const [h1, t1, b1, s1] = SKY[i];
      const k = (hour - h0) / (h1 - h0);
      return { top: mix(t0, t1, k), bot: mix(b0, b1, k), stars: lerp(s0, s1, k) };
    }
  }
  return { top: SKY[0][1], bot: SKY[0][2], stars: 1 };
}

// 圖片背景（生圖模型畫的房間，白天／黃昏／晚上三張，依時間交叉淡入）
import roomDay from './bg/room_day.webp?inline';
import roomSunset from './bg/room_sunset.webp?inline';
import roomNight from './bg/room_night.webp?inline';

export type BgMode = 'photo' | 'room' | 'custom';

/** 這個時刻三張圖各佔多少（白天、黃昏、晚上） */
function photoWeights(h: number): [number, number, number] {
  const ramp = (a: number, b: number) => Math.min(1, Math.max(0, (h - a) / (b - a)));
  if (h < 5) return [0, 0, 1];
  if (h < 7) { const k = ramp(5, 7); return [k, 0, 1 - k]; }
  if (h < 16) return [1, 0, 0];
  if (h < 17.5) { const k = ramp(16, 17.5); return [1 - k, k, 0]; }
  if (h < 18.5) return [0, 1, 0];
  if (h < 19.5) { const k = ramp(18.5, 19.5); return [0, 1 - k, k]; }
  return [0, 0, 1];
}

export class Background {
  /** 'photo' = 圖片房間、'room' = 原本程式畫的房間、'custom' = 自己上傳的圖 */
  mode: BgMode = 'photo';
  /** 使用者上傳的背景圖 */
  custom: HTMLImageElement | null = null;
  private photos: HTMLImageElement[] = [roomDay, roomSunset, roomNight].map((src) => {
    const im = new Image();
    im.src = src;
    return im;
  });
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private wall: HTMLCanvasElement | null = null;
  private petals: Petal[] = [];
  private clouds: Cloud[] = [];
  private stars: [number, number, number][] = [];
  private t = 0;
  private px = 0; // 視差（-1..1）
  private py = 0;
  private tx = 0;
  private ty = 0;
  /** 測試用：固定時刻（小時），null = 用現在時間 */
  hour: number | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    for (let i = 0; i < 5; i++) this.clouds.push({ x: Math.random(), y: 0.15 + Math.random() * 0.5, s: 0.6 + Math.random() * 0.8, v: 0.004 + Math.random() * 0.006 });
    for (let i = 0; i < 60; i++) this.stars.push([Math.random(), Math.random() * 0.8, Math.random() * Math.PI * 2]);
    for (let i = 0; i < 26; i++) this.petals.push(this.newPetal(true));
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointermove', (e) => {
      this.tx = (e.clientX / window.innerWidth) * 2 - 1;
      this.ty = (e.clientY / window.innerHeight) * 2 - 1;
    });
  }

  private newPetal(anywhere = false): Petal {
    return {
      x: Math.random() * 1.2 - 0.1,
      y: anywhere ? Math.random() : -0.05 - Math.random() * 0.2,
      vx: 0.01 + Math.random() * 0.025,
      vy: 0.03 + Math.random() * 0.04,
      r: 4 + Math.random() * 5,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 3,
      hue: Math.random(),
    };
  }

  private resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.wall = null;
  }

  /** 窗戶的位置（px，螢幕座標） */
  private get win() {
    const w = this.w, h = this.h;
    const ww = Math.min(w * 0.36, h * 0.62, 520);
    const wh = ww * 1.0;
    const x = Math.max(24, w * 0.34 - ww / 2);
    const y = Math.max(h * 0.12, 64);
    return { x, y, w: ww, h: wh };
  }

  // 不會動的牆壁先畫好存起來
  private buildWall() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    const { w, h } = this;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#fbe9f0');
    grad.addColorStop(1, '#efe3f4');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // 壁紙：淡淡的粉／藍／白直條紋
    const stripe = 34;
    const cols = ['rgba(245,169,184,0.10)', 'rgba(255,255,255,0.18)', 'rgba(91,206,250,0.07)', 'rgba(255,255,255,0.18)'];
    for (let x = 0, i = 0; x < w; x += stripe, i++) {
      g.fillStyle = cols[i % cols.length];
      g.fillRect(x, 0, stripe, h);
    }
    // 小愛心點點
    g.fillStyle = 'rgba(232,140,166,0.13)';
    for (let y = 30, r = 0; y < h; y += 68, r++) {
      for (let x = (r % 2) * 34 + 17; x < w; x += 68) heart(g, x, y, 5);
    }
    // 牆腳的木頭腰板
    const wainH = h * 0.2;
    const wg = g.createLinearGradient(0, h - wainH, 0, h);
    wg.addColorStop(0, '#fff6f8');
    wg.addColorStop(1, '#f6dfe8');
    g.fillStyle = wg;
    g.fillRect(0, h - wainH, w, wainH);
    g.fillStyle = 'rgba(200,140,160,0.25)';
    g.fillRect(0, h - wainH, w, 3);
    for (let x = 40; x < w; x += 120) {
      g.strokeStyle = 'rgba(200,140,160,0.18)';
      g.lineWidth = 2;
      roundRect(g, x, h - wainH + 18, 90, wainH - 36, 8);
      g.stroke();
    }
    // 四周暗角
    const vg = g.createRadialGradient(w * 0.45, h * 0.45, Math.min(w, h) * 0.3, w * 0.45, h * 0.45, Math.max(w, h) * 0.8);
    vg.addColorStop(0, 'rgba(120,70,110,0)');
    vg.addColorStop(1, 'rgba(120,70,110,0.16)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    this.wall = c;
  }

  update(dt: number) {
    this.t += dt;
    const k = 1 - Math.exp(-dt / 0.6);
    this.px += (this.tx - this.px) * k;
    this.py += (this.ty - this.py) * k;
    for (const p of this.petals) {
      p.x += (p.vx + Math.sin(this.t * 0.7 + p.hue * 9) * 0.01) * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.y > 1.05 || p.x > 1.15) Object.assign(p, this.newPetal());
    }
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x > 1.3) { c.x = -0.3; c.y = 0.15 + Math.random() * 0.5; }
    }
  }

  /** 圖片背景：鋪滿畫面、稍微跟著滑鼠移動；模糊一點、降一點飽和，讓角色站出來 */
  private drawPhoto(hour: number) {
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const W = this.canvas.width, H = this.canvas.height;
    g.fillStyle = '#e9dcef';
    g.fillRect(0, 0, W, H);
    const custom = this.mode === 'custom' && this.custom;
    const photos = custom ? [this.custom!] : this.photos;
    const wts: number[] = custom ? [1] : photoWeights(hour);
    const zoom = 1.05;
    g.filter = `blur(${(1.2 * this.dpr).toFixed(1)}px) saturate(0.9) contrast(0.94)`;
    photos.forEach((im, i) => {
      if (wts[i] <= 0.001 || !im.complete || !im.naturalWidth) return;
      const s = Math.max(W / im.naturalWidth, H / im.naturalHeight) * zoom;
      const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
      const x = (W - dw) / 2 - this.px * (dw - W) * 0.4;
      const y = (H - dh) / 2 - this.py * (dh - H) * 0.4;
      g.globalAlpha = i === 0 ? 1 : wts[i] / Math.max(1e-3, wts.slice(0, i + 1).reduce((a, b) => a + b, 0));
      if (wts.slice(0, i).every((w) => w <= 0.001)) g.globalAlpha = 1;
      g.drawImage(im, x, y, dw, dh);
    });
    g.filter = 'none';
    g.globalAlpha = 1;
    // 一層很淡的霧，背景往後退
    g.fillStyle = 'rgba(255, 246, 250, 0.10)';
    g.fillRect(0, 0, W, H);
  }

  draw() {
    const g = this.ctx;
    const now = new Date();
    const hour = this.hour ?? now.getHours() + now.getMinutes() / 60;
    if (this.mode === 'photo' || (this.mode === 'custom' && this.custom)) {
      this.drawPhoto(hour);
      return;
    }
    if (!this.wall) this.buildWall();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.wall!, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const win = this.win;
    const ox = this.px * -6, oy = this.py * -4; // 窗戶的視差
    const sky = skyAt(hour);
    const night = sky.stars;

    // ---- 窗外 ----
    g.save();
    roundRect(g, win.x + ox, win.y + oy, win.w, win.h, 14);
    g.clip();
    const sx = this.px * -16, sy = this.py * -10; // 遠景移動更多
    const sg = g.createLinearGradient(0, win.y, 0, win.y + win.h);
    sg.addColorStop(0, css(sky.top));
    sg.addColorStop(1, css(sky.bot));
    g.fillStyle = sg;
    g.fillRect(win.x - 40, win.y - 40, win.w + 80, win.h + 80);
    // 星星
    if (night > 0.02) {
      for (const [x, y, ph] of this.stars) {
        const a = night * (0.5 + 0.5 * Math.sin(this.t * 2 + ph));
        g.fillStyle = `rgba(255,250,235,${a})`;
        const X = win.x + x * win.w + sx, Y = win.y + y * win.h * 0.7 + sy;
        g.beginPath();
        g.arc(X, Y, 1.1 + (ph % 1) * 0.8, 0, Math.PI * 2);
        g.fill();
      }
    }
    // 太陽或月亮
    const isNight = night > 0.45;
    const bx = win.x + win.w * 0.72 + sx, by = win.y + win.h * 0.24 + sy;
    const glow = g.createRadialGradient(bx, by, 0, bx, by, win.w * 0.35);
    glow.addColorStop(0, isNight ? 'rgba(255,250,220,0.5)' : 'rgba(255,250,230,0.85)');
    glow.addColorStop(1, 'rgba(255,250,230,0)');
    g.fillStyle = glow;
    g.fillRect(win.x - 40, win.y - 40, win.w + 80, win.h + 80);
    const mr = win.w * 0.065;
    g.save();
    g.beginPath();
    g.arc(bx, by, mr, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = isNight ? '#fff6dc' : '#fffaf0';
    g.fillRect(bx - mr, by - mr, mr * 2, mr * 2);
    if (isNight) {
      // 月牙：用同一個天空漸層蓋掉一部分
      g.fillStyle = sg;
      g.beginPath();
      g.arc(bx + mr * 0.5, by - mr * 0.25, mr * 0.9, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    // 雲
    for (const c of this.clouds) {
      const X = win.x - win.w * 0.2 + c.x * win.w * 1.2 + sx * 0.8;
      const Y = win.y + c.y * win.h + sy * 0.8;
      cloud(g, X, Y, win.w * 0.16 * c.s, isNight ? 'rgba(170,160,215,0.22)' : 'rgba(255,255,255,0.85)');
    }
    // 遠方的屋頂剪影
    g.fillStyle = isNight ? 'rgba(60,50,100,0.85)' : 'rgba(200,170,210,0.75)';
    const base = win.y + win.h * 0.93 + sy * 0.5;
    g.beginPath();
    g.moveTo(win.x - 40, win.y + win.h + 40);
    let x = win.x - 40 + sx * 0.5;
    let i = 0;
    while (x < win.x + win.w + 40) {
      const bw = 26 + ((i * 37) % 24), bh = 8 + ((i * 53) % 26);
      g.lineTo(x, base - bh);
      g.lineTo(x + bw * 0.5, base - bh - 7);
      g.lineTo(x + bw, base - bh);
      x += bw;
      i++;
    }
    g.lineTo(win.x + win.w + 40, win.y + win.h + 40);
    g.fill();
    if (isNight) {
      // 窗戶燈光
      g.fillStyle = 'rgba(255,220,150,0.8)';
      for (let k = 0; k < 9; k++) g.fillRect(win.x + ((k * 97) % win.w) + sx * 0.5, base - 5 - ((k * 31) % 16), 3, 4);
    }
    g.restore();

    // ---- 窗框 ----
    g.save();
    g.translate(ox, oy);
    g.strokeStyle = '#fffafc';
    g.lineWidth = 14;
    roundRect(g, win.x, win.y, win.w, win.h, 14);
    g.stroke();
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(win.x + win.w / 2, win.y);
    g.lineTo(win.x + win.w / 2, win.y + win.h);
    g.moveTo(win.x, win.y + win.h * 0.45);
    g.lineTo(win.x + win.w, win.y + win.h * 0.45);
    g.stroke();
    g.strokeStyle = 'rgba(190,130,155,0.35)';
    g.lineWidth = 2;
    roundRect(g, win.x - 7, win.y - 7, win.w + 14, win.h + 14, 18);
    g.stroke();
    // 窗台
    g.fillStyle = '#fff6f9';
    roundRect(g, win.x - 26, win.y + win.h + 4, win.w + 52, 16, 6);
    g.fill();
    g.fillStyle = 'rgba(190,130,155,0.25)';
    g.fillRect(win.x - 22, win.y + win.h + 18, win.w + 44, 4);
    // 窗台上的小盆栽
    const pxp = win.x + win.w * 0.18, pyp = win.y + win.h + 4;
    g.fillStyle = '#f3a7bb';
    roundRect(g, pxp - 14, pyp - 22, 28, 22, 5);
    g.fill();
    g.fillStyle = '#9fd6a8';
    for (let k = -1; k <= 1; k++) {
      g.save();
      g.translate(pxp + k * 6, pyp - 22);
      g.rotate(k * 0.5 + Math.sin(this.t * 1.3 + k) * 0.04);
      g.beginPath();
      g.ellipse(0, -12, 6, 13, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.restore();

    // ---- 窗簾（會輕輕飄）----
    for (const side of [-1, 1]) {
      const cx = side < 0 ? win.x - 10 + ox : win.x + win.w + 10 + ox;
      const cw = win.w * 0.3;
      g.save();
      const cg = g.createLinearGradient(cx - cw, 0, cx + cw, 0);
      cg.addColorStop(0, 'rgba(244,170,192,0.92)');
      cg.addColorStop(0.5, 'rgba(250,196,212,0.92)');
      cg.addColorStop(1, 'rgba(236,150,178,0.92)');
      g.fillStyle = cg;
      g.beginPath();
      const top = win.y - 30 + oy, bot = win.y + win.h + 50 + oy;
      const inner = cx - side * cw * 0.15;
      const outer = cx + side * cw * 0.85;
      g.moveTo(outer, top);
      g.lineTo(inner, top);
      const sway = Math.sin(this.t * 0.9 + side) * 6;
      g.bezierCurveTo(inner - side * cw * 0.4 + sway, top + (bot - top) * 0.45, inner + side * cw * 0.35 + sway, top + (bot - top) * 0.7, inner + side * cw * 0.15 + sway * 1.5, bot);
      g.lineTo(outer, bot);
      g.closePath();
      g.fill();
      // 皺褶
      g.strokeStyle = 'rgba(210,120,150,0.35)';
      g.lineWidth = 2;
      for (let k = 1; k <= 3; k++) {
        const fx = lerp(inner, outer, k / 4);
        g.beginPath();
        g.moveTo(fx, top + 6);
        g.quadraticCurveTo(fx - side * 6 + sway * 0.5, (top + bot) / 2, fx + sway, bot - 4);
        g.stroke();
      }
      // 綁帶
      g.fillStyle = '#fff3f7';
      g.fillRect(Math.min(inner, outer) + 4, top + (bot - top) * 0.58, Math.abs(outer - inner) - 8 + Math.abs(sway), 8);
      g.restore();
    }
    // 窗簾桿
    g.fillStyle = '#e8b9c9';
    roundRect(g, win.x - win.w * 0.35 + ox, win.y - 36 + oy, win.w * 1.7, 9, 4);
    g.fill();

    // ---- 從窗戶照進來的光 ----
    if (night < 0.6) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      const a = 0.045 * (1 - night);
      for (let k = 0; k < 3; k++) {
        g.fillStyle = `rgba(255,240,230,${a})`;
        g.beginPath();
        const x0 = win.x + win.w * (0.15 + k * 0.3) + ox;
        g.moveTo(x0, win.y + oy);
        g.lineTo(x0 + win.w * 0.18, win.y + oy);
        g.lineTo(x0 + win.w * 0.9 + 120, this.h);
        g.lineTo(x0 + win.w * 0.4 + 60, this.h);
        g.fill();
      }
      g.restore();
    }

    // ---- 串燈 ----
    const lx0 = 0, lx1 = this.w;
    const ly = 26;
    g.strokeStyle = 'rgba(150,100,120,0.5)';
    g.lineWidth = 1.5;
    g.beginPath();
    const sag = (u: number) => ly + Math.sin(u * Math.PI * 3) ** 2 * 26 + this.py * 3;
    for (let u = 0; u <= 1.0001; u += 0.01) {
      const X = lerp(lx0, lx1, u), Y = sag(u);
      if (u === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
    }
    g.stroke();
    const bulbs = Math.max(8, Math.round(this.w / 70));
    const colors: RGB[] = [[255, 190, 210], [255, 236, 170], [180, 225, 255], [255, 255, 255]];
    for (let k = 0; k < bulbs; k++) {
      const u = (k + 0.5) / bulbs;
      const X = lerp(lx0, lx1, u), Y = sag(u) + 6;
      const tw = 0.6 + 0.4 * Math.sin(this.t * 2.2 + k * 1.7);
      const c = colors[k % colors.length];
      const gl = g.createRadialGradient(X, Y, 0, X, Y, 18);
      gl.addColorStop(0, css(c, 0.55 * tw * (0.5 + night * 0.5)));
      gl.addColorStop(1, css(c, 0));
      g.fillStyle = gl;
      g.fillRect(X - 18, Y - 18, 36, 36);
      g.fillStyle = css(c, 0.95);
      g.beginPath();
      g.ellipse(X, Y, 3.5, 5, 0, 0, Math.PI * 2);
      g.fill();
    }

    // ---- 夜晚房間暗一點 ----
    if (night > 0.02) {
      g.fillStyle = `rgba(60,40,90,${0.18 * night})`;
      g.fillRect(0, 0, this.w, this.h);
    }

    // ---- 花瓣 ----
    for (const p of this.petals) {
      const X = p.x * this.w + this.px * -10 * (p.r / 9), Y = p.y * this.h + this.py * -6 * (p.r / 9);
      g.save();
      g.translate(X, Y);
      g.rotate(p.rot);
      g.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(p.rot * 0.7)));
      g.fillStyle = p.hue < 0.7 ? 'rgba(248,180,200,0.85)' : 'rgba(255,240,245,0.9)';
      g.beginPath();
      g.moveTo(0, -p.r);
      g.quadraticCurveTo(p.r, -p.r * 0.2, 0, p.r);
      g.quadraticCurveTo(-p.r, -p.r * 0.2, 0, -p.r);
      g.fill();
      g.restore();
    }
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function heart(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.6, y - s * 1.3, x, y - s * 0.4);
  g.bezierCurveTo(x + s * 0.6, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
  g.fill();
}

function cloud(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, s, s * 0.42, 0, 0, Math.PI * 2);
  g.ellipse(x - s * 0.55, y + s * 0.1, s * 0.55, s * 0.3, 0, 0, Math.PI * 2);
  g.ellipse(x + s * 0.6, y + s * 0.08, s * 0.6, s * 0.32, 0, 0, Math.PI * 2);
  g.ellipse(x + s * 0.1, y - s * 0.25, s * 0.5, s * 0.4, 0, 0, Math.PI * 2);
  g.fill();
}
