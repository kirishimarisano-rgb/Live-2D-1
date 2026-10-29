// 麥克風對嘴：取音量（RMS），換成嘴巴開合 0..1。
export class LipSync {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private buf = new Float32Array(1024);
  private level = 0;
  private floor = 0.01;
  active = false;

  async start() {
    if (this.active) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    src.connect(this.analyser);
    this.active = true;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    this.stream = null;
    this.active = false;
    this.level = 0;
  }

  /** 回傳 0..1 的嘴巴開合 */
  read(dt: number) {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    // 慢慢學習環境噪音
    this.floor = Math.min(this.floor + dt * 0.002, Math.max(0.004, this.floor * 0.995 + rms * 0.005));
    const v = Math.max(0, Math.min(1, (rms - this.floor * 1.5) * 9));
    // 張嘴快、閉嘴稍慢
    const k = v > this.level ? 1 - Math.exp(-dt / 0.03) : 1 - Math.exp(-dt / 0.09);
    this.level += (v - this.level) * k;
    return this.level;
  }
}
