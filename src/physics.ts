// 彈簧擺：頭髮、側馬尾、呆毛、耳環、垂耳。
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

  /** 回傳這一步的角加速度（給下一節用） */
  step(dt: number, anchorAcc: number, tilt: number, force = 0) {
    const c = this.conf;
    const acc =
      -c.gravity * Math.sin(this.angle) -
      c.stiff * (this.angle - tilt) -
      c.damping * this.vel -
      c.inertia * anchorAcc +
      force;
    this.vel += acc * dt;
    this.angle += this.vel * dt;
    return acc;
  }

  /** 相對於頭部的角度，換成參數值 */
  value(tilt: number) {
    return Math.max(-1, Math.min(1, (this.angle - tilt) * this.conf.scale));
  }

  kick(v: number) {
    this.vel += v;
  }
}

/**
 * 兩節的鏈：第一節掛在頭上，第二節（髮尾）掛在第一節的末端，
 * 所以第一節一甩，髮尾會晚一點、甩得更大，形成 S 形的波動。
 */
class Chain {
  constructor(public base: Pendulum, public tip: Pendulum, public length: number) {}
  step(dt: number, anchorAcc: number, tilt: number, force: number) {
    const a = this.base.step(dt, anchorAcc, tilt, force);
    // 第一節末端的加速度 ≈ 角加速度 × 長度
    this.tip.step(dt, anchorAcc + a * this.length, this.base.angle, force * 0.5);
  }
}

export class HairPhysics {
  parts = {
    hairFront: new Pendulum({ gravity: 30, stiff: 60, damping: 5.5, inertia: 0.022, scale: 2.2 }),
    hairBack: new Pendulum({ gravity: 22, stiff: 30, damping: 3.8, inertia: 0.026, scale: 2.0 }),
    earring: new Pendulum({ gravity: 60, stiff: 6, damping: 2.6, inertia: 0.04, scale: 1.4 }),
    // 垂耳軟軟的，甩起來慢、會晃好幾下
    earL: new Pendulum({ gravity: 26, stiff: 18, damping: 2.2, inertia: 0.034, scale: 2.2 }),
    earR: new Pendulum({ gravity: 26, stiff: 18, damping: 2.2, inertia: 0.034, scale: 2.2 }),
  };
  tail = new Chain(
    new Pendulum({ gravity: 14, stiff: 14, damping: 2.4, inertia: 0.03, scale: 1.8 }),
    new Pendulum({ gravity: 30, stiff: 40, damping: 3.4, inertia: 0.012, scale: 1.2 }),
    300,
  );
  ahoge = new Chain(
    new Pendulum({ gravity: 8, stiff: 110, damping: 3.2, inertia: 0.035, scale: 2.4 }),
    new Pendulum({ gravity: 8, stiff: 220, damping: 3.4, inertia: 0.012, scale: 1.6 }),
    200,
  );
  private lastX = 0;
  private lastV = 0;
  private first = true;
  private t = 0;
  /** 待機時的微風／心跳般的小晃動強度 */
  breeze = 1;

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
      this.t += h;
      const t = this.t;
      const b = this.breeze;
      for (const p of Object.values(this.parts)) p.step(h, a, tilt);
      // 呆毛會自己輕輕晃，馬尾像有微風
      this.ahoge.step(h, a, tilt, b * (5 * Math.sin(t * 2.3) + 3 * Math.sin(t * 3.9 + 1)));
      this.tail.step(h, a, tilt, b * (0.9 * Math.sin(t * 0.83) + 0.5 * Math.sin(t * 1.7 + 2)));
    }
  }

  kick(strength: number) {
    const s = strength;
    this.parts.hairFront.kick(s * 0.9);
    this.parts.hairBack.kick(s * 0.7);
    this.tail.base.kick(s * 0.8);
    this.ahoge.base.kick(s * 1.4);
    this.parts.earring.kick(s * 2.0);
    this.parts.earL.kick(s * 1.3);
    this.parts.earR.kick(-s * 1.1);
  }

  /** 耳朵抖一下（被戳、驚醒時） */
  flick(strength: number) {
    this.parts.earL.kick(strength);
    this.parts.earR.kick(-strength);
  }

  write(p: Record<string, number>, tilt: number) {
    for (const [k, pend] of Object.entries(this.parts)) p[k] = pend.value(tilt);
    p.tail = this.tail.base.value(tilt);
    p.tail2 = this.tip(this.tail);
    p.ahoge = this.ahoge.base.value(tilt);
    p.ahoge2 = this.tip(this.ahoge);
  }

  /** 髮尾相對於第一節的彎曲 */
  private tip(c: Chain) {
    return Math.max(-1, Math.min(1, (c.tip.angle - c.base.angle) * c.tip.conf.scale));
  }
}
