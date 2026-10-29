// 彈簧擺：頭髮、側馬尾、呆毛、耳環。
// 擺錘掛在頭上：頭的加速度會把它甩開，重力和自身的硬度把它拉回來，阻尼讓它慢慢停下。
export interface PendulumConf {
  gravity: number; // 重力恢復力
  stiff: number; // 回到原本形狀的力
  damping: number;
  inertia: number; // 對頭部加速度的反應
  scale: number; // 輸出角度 → 參數 (-1..1)
}

export class Pendulum {
  angle = 0; // 世界座標的擺角（0 = 垂直往下）
  vel = 0;
  constructor(public conf: PendulumConf) {}

  step(dt: number, anchorAcc: number, tilt: number) {
    const c = this.conf;
    const acc =
      -c.gravity * Math.sin(this.angle) -
      c.stiff * (this.angle - tilt) -
      c.damping * this.vel -
      c.inertia * anchorAcc;
    this.vel += acc * dt;
    this.angle += this.vel * dt;
  }

  /** 相對於頭部的角度，換成參數值 */
  value(tilt: number) {
    return Math.max(-1, Math.min(1, (this.angle - tilt) * this.conf.scale));
  }

  kick(v: number) {
    this.vel += v;
  }
}

export class HairPhysics {
  parts = {
    hairFront: new Pendulum({ gravity: 30, stiff: 60, damping: 5.5, inertia: 0.0045, scale: 2.2 }),
    hairBack: new Pendulum({ gravity: 22, stiff: 30, damping: 3.8, inertia: 0.0055, scale: 2.0 }),
    tail: new Pendulum({ gravity: 14, stiff: 14, damping: 2.2, inertia: 0.006, scale: 1.8 }),
    ahoge: new Pendulum({ gravity: 10, stiff: 120, damping: 3.5, inertia: 0.008, scale: 2.4 }),
    earring: new Pendulum({ gravity: 60, stiff: 6, damping: 2.6, inertia: 0.009, scale: 1.4 }),
  };
  private lastX = 0;
  private lastV = 0;
  private first = true;

  /**
   * @param headX 頭部的水平位置（px，含轉頭與身體移動）
   * @param tilt 頭部傾斜（弧度）
   */
  update(dt: number, headX: number, tilt: number) {
    if (this.first) {
      this.lastX = headX;
      this.first = false;
    }
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / sub;
    const v = (headX - this.lastX) / Math.max(dt, 1e-4);
    const acc = (v - this.lastV) / Math.max(dt, 1e-4);
    this.lastX = headX;
    this.lastV = v;
    const a = Math.max(-40000, Math.min(40000, acc));
    for (let i = 0; i < sub; i++) {
      for (const p of Object.values(this.parts)) p.step(h, a, tilt);
    }
  }

  kick(strength: number) {
    const s = strength;
    this.parts.hairFront.kick(s * 0.9);
    this.parts.hairBack.kick(s * 0.7);
    this.parts.tail.kick(s * 0.8);
    this.parts.ahoge.kick(s * 2.2);
    this.parts.earring.kick(s * 2.0);
  }

  write(p: Record<string, number>, tilt: number) {
    for (const [k, pend] of Object.entries(this.parts)) p[k] = pend.value(tilt);
  }
}
