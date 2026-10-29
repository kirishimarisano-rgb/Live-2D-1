// 讓她活起來：呼吸、眨眼、晃動、視線、互動、打瞌睡。輸出一組參數。
import { defaultParams, type Params } from './params';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 和幀率無關的平滑追蹤，tau 越小越快 */
const follow = (cur: number, target: number, tau: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-dt / Math.max(tau, 1e-4)));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export type Reaction = 'shy' | 'puff' | 'body' | 'wake';

export class Motion {
  t = 0;
  // 視線（-1..1）
  gazeX = 0;
  gazeY = 0;
  eyeX = 0;
  eyeY = 0;
  headX = 0;
  headY = 0;
  private mouseActive = false;
  private lastInput = 0;
  private idleLookAt = 0;
  private idleTarget: [number, number] = [0, 0];
  // 眨眼
  private nextBlink = 1.5;
  private blinkT = -1;
  private doubleBlink = false;
  // 反應
  reaction: Reaction | null = null;
  private reactionT = 0;
  private reactionLen = 0;
  // 打瞌睡（0..1）
  sleep = 0;
  sleeping = false;
  sleepAfter = 15;
  // 說話時的嘴型（對話框打字時）與麥克風
  talk = 0;
  mic = -1; // <0 = 沒開
  private talkPhase = 0;

  /** 滑鼠位置（相對於頭部中心，大約 -1..1） */
  look(x: number, y: number) {
    this.gazeX = clamp(x, -1, 1);
    this.gazeY = clamp(y, -1, 1);
    this.mouseActive = true;
    this.input();
  }

  /** 有任何輸入就叫醒她，回傳 true 代表剛被叫醒 */
  input(): boolean {
    this.lastInput = this.t;
    if (this.sleeping) {
      this.sleeping = false;
      this.react('wake');
      return true;
    }
    return false;
  }

  react(r: Reaction) {
    this.reaction = r;
    this.reactionT = 0;
    this.reactionLen = r === 'shy' ? 2.2 : r === 'puff' ? 2.0 : r === 'wake' ? 1.6 : 1.0;
  }

  get idleTime() {
    return this.t - this.lastInput;
  }

  update(dt: number): Params {
    this.t += dt;
    const t = this.t;
    const p = defaultParams();

    // ---- 打瞌睡 ----
    if (!this.sleeping && this.idleTime > this.sleepAfter && !this.reaction) this.sleeping = true;
    this.sleep = follow(this.sleep, this.sleeping ? 1 : 0, this.sleeping ? 2.2 : 0.25, dt);
    const sl = this.sleep;

    // ---- 呼吸與晃動 ----
    const breathPeriod = lerp(3.6, 5.4, sl);
    this.talkPhase += dt;
    p.breath = 0.5 + 0.5 * Math.sin((t / breathPeriod) * Math.PI * 2);
    p.bodyX = 1.6 * Math.sin(t * 0.53) + 0.6 * Math.sin(t * 1.31 + 1);
    p.bodyZ = 2.2 * Math.sin(t * 0.37 + 0.6) + 0.5 * Math.sin(t * 1.1);

    // ---- 視線 ----
    // 滑鼠停太久就自己東張西望
    let tx = this.gazeX, ty = this.gazeY;
    if (!this.mouseActive || this.idleTime > 4) {
      if (t > this.idleLookAt) {
        this.idleLookAt = t + rand(1.6, 4.0);
        this.idleTarget = Math.random() < 0.35 ? [0, 0] : [rand(-0.6, 0.6), rand(-0.35, 0.3)];
      }
      [tx, ty] = this.idleTarget;
    }
    // 眼睛快、頭慢
    this.eyeX = follow(this.eyeX, tx, 0.07, dt);
    this.eyeY = follow(this.eyeY, ty, 0.07, dt);
    this.headX = follow(this.headX, tx, 0.38, dt);
    this.headY = follow(this.headY, ty, 0.45, dt);
    p.eyeBallX = this.eyeX;
    p.eyeBallY = this.eyeY;
    p.angleX = this.headX * 24;
    p.angleY = this.headY * 18;
    p.angleZ = -this.headX * 4 + 2 * Math.sin(t * 0.45);
    p.bodyX += this.headX * 4;

    // ---- 眨眼（隨機間隔，偶爾連眨兩下）----
    let blink = 1;
    if (this.blinkT < 0 && t > this.nextBlink) {
      this.blinkT = 0;
      this.doubleBlink = Math.random() < 0.18;
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const one = (bt: number) => {
        // 0.07 秒閉上、停 0.03、0.13 秒睜開
        if (bt < 0) return 1;
        if (bt < 0.07) return 1 - bt / 0.07;
        if (bt < 0.1) return 0;
        if (bt < 0.23) return ease((bt - 0.1) / 0.13);
        return 1;
      };
      blink = Math.min(one(this.blinkT), this.doubleBlink ? one(this.blinkT - 0.26) : 1);
      if (this.blinkT > (this.doubleBlink ? 0.5 : 0.24)) {
        this.blinkT = -1;
        this.nextBlink = t + rand(1.8, 5.5);
      }
    }
    let eyeOpen = blink;

    // ---- 打瞌睡的樣子 ----
    if (sl > 0.001) {
      const nod = Math.max(0, Math.sin(t * 0.9)) ** 6; // 偶爾點一下頭
      const droop = clamp(0.25 + 0.2 * Math.sin(t * 0.7), 0, 1) * (1 - nod);
      eyeOpen = lerp(eyeOpen, droop * 0.25, ease(sl));
      p.angleY = lerp(p.angleY, -16 - nod * 8, sl);
      p.angleZ = lerp(p.angleZ, 9 + 2 * Math.sin(t * 0.4), sl);
      p.angleX = lerp(p.angleX, -4, sl);
      p.eyeBallY = lerp(p.eyeBallY, -0.4, sl);
      p.eyeBallX = lerp(p.eyeBallX, 0, sl);
      p.bodyZ = lerp(p.bodyZ, 3, sl);
      p.mouthOpen = lerp(p.mouthOpen, 0.12 + 0.06 * Math.sin((t / breathPeriod) * Math.PI * 2), sl);
      p.browY = lerp(p.browY, -0.3, sl);
    }
    p.eyeLOpen = eyeOpen;
    p.eyeROpen = eyeOpen;

    // ---- 反應 ----
    if (this.reaction) {
      this.reactionT += dt;
      const k = this.reactionT / this.reactionLen;
      // 進場 0.15 秒、出場最後 25%
      const w = ease(this.reactionT / 0.15) * (1 - ease((k - 0.75) / 0.25));
      switch (this.reaction) {
        case 'shy': {
          // 害羞：瞇眼笑（^ ^）、臉紅、低頭歪頭，中間眨一下
          const peek = k > 0.45 && k < 0.6 ? Math.sin(((k - 0.45) / 0.15) * Math.PI) : 0;
          p.eyeSmile = lerp(p.eyeSmile, 1, w);
          p.eyeLOpen = lerp(p.eyeLOpen, 0.35 * peek, w);
          p.eyeROpen = lerp(p.eyeROpen, 0.35 * peek, w);
          p.blush = lerp(p.blush, 1, w);
          p.angleY = lerp(p.angleY, -10, w);
          p.angleZ = lerp(p.angleZ, -12, w);
          p.mouthForm = lerp(p.mouthForm, 0.8, w);
          p.browAngle = lerp(p.browAngle, -0.6, w);
          p.browY = lerp(p.browY, 0.3, w);
          break;
        }
        case 'puff': {
          // 鼓臉頰：嘴巴嘟起、眉毛皺、瞪你
          p.cheekPuff = lerp(p.cheekPuff, 1, w);
          p.mouthForm = lerp(p.mouthForm, -0.6, w);
          p.mouthOpen = lerp(p.mouthOpen, 0, w);
          p.blush = lerp(p.blush, 0.6, w);
          p.browAngle = lerp(p.browAngle, 0.8, w);
          p.browY = lerp(p.browY, -0.3, w);
          p.eyeLOpen = lerp(p.eyeLOpen, Math.min(p.eyeLOpen, 0.8), w);
          p.eyeROpen = lerp(p.eyeROpen, Math.min(p.eyeROpen, 0.8), w);
          p.eyeBallX = lerp(p.eyeBallX, 0, w);
          p.eyeBallY = lerp(p.eyeBallY, 0, w);
          p.angleX = lerp(p.angleX, p.angleX * 0.3, w);
          break;
        }
        case 'wake': {
          // 驚醒：眼睛睜大、抬頭
          const s = 1 - ease(k);
          p.eyeLOpen = lerp(p.eyeLOpen, 1.2, w * s);
          p.eyeROpen = lerp(p.eyeROpen, 1.2, w * s);
          p.browY = lerp(p.browY, 0.9, w);
          p.mouthOpen = lerp(p.mouthOpen, 0.45, w * s);
          p.blush = lerp(p.blush, 0.5, w);
          p.angleY = lerp(p.angleY, 6, w * s);
          break;
        }
        case 'body': {
          p.browY = lerp(p.browY, 0.5, w);
          p.mouthOpen = lerp(p.mouthOpen, 0.2, w);
          p.eyeLOpen = lerp(p.eyeLOpen, Math.max(p.eyeLOpen, 1.1), w * (p.eyeLOpen > 0.5 ? 1 : 0));
          p.eyeROpen = lerp(p.eyeROpen, Math.max(p.eyeROpen, 1.1), w * (p.eyeROpen > 0.5 ? 1 : 0));
          break;
        }
      }
      if (this.reactionT >= this.reactionLen) this.reaction = null;
    }

    // ---- 說話與對嘴 ----
    if (this.mic >= 0) {
      p.mouthOpen = Math.max(p.mouthOpen, this.mic);
      p.mouthForm = lerp(p.mouthForm, 0.3, clamp(this.mic * 2, 0, 1));
    } else if (this.talk > 0) {
      const ph = this.talkPhase;
      const flap = 0.5 + 0.5 * Math.sin(ph * 17) * Math.sin(ph * 5.3 + 1);
      p.mouthOpen = Math.max(p.mouthOpen, this.talk * (0.08 + 0.42 * flap));
    }
    return p;
  }
}
