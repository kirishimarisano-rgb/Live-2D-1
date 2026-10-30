// 對話框：台詞來自 lines.json（打包後在 HTML 裡的 <script id="lines-data">）。
import bundled from './lines.json';

export type Lines = typeof bundled;
export type CharLines = Record<string, string[]>;

export function loadLines(): Lines {
  const tag = document.getElementById('lines-data');
  if (tag?.textContent) {
    try {
      const custom = JSON.parse(tag.textContent);
      // 每個角色的台詞各自合併，只改其中幾項也沒關係
      const merged: Record<string, unknown> = { ...bundled, ...custom };
      for (const k of Object.keys(bundled) as (keyof Lines)[]) {
        const b = bundled[k], c = custom[k];
        if (b && c && typeof b === 'object' && !Array.isArray(b) && typeof c === 'object') merged[k] = { ...b, ...c };
      }
      return merged as Lines;
    } catch (e) {
      console.warn('lines-data 不是合法的 JSON，改用內建台詞', e);
    }
  }
  return bundled;
}

export class Bubble {
  private text = '';
  private shown = 0;
  private hideAt = 0;
  private t = 0;
  private last: Record<string, string> = {};
  /** 正在打字（用來讓嘴巴動） */
  typing = false;

  constructor(private el: HTMLElement, private lines: CharLines, private showSeconds: number) {}

  say(kind: string, force = true) {
    const list = this.lines[kind];
    if (!Array.isArray(list) || !list.length) return;
    if (!force && this.visible) return;
    let line = list[Math.floor(Math.random() * list.length)];
    if (list.length > 1 && line === this.last[kind]) line = list[(list.indexOf(line) + 1) % list.length];
    this.last[kind] = line;
    this.show(line);
  }

  /** 直接說一句話 */
  show(line: string) {
    this.text = line;
    this.shown = 0;
    this.hideAt = this.t + this.showSeconds + line.length * 0.06;
    this.el.textContent = '';
    this.el.classList.add('show');
  }

  hide() {
    this.hideAt = this.t;
  }

  get visible() {
    return this.t < this.hideAt;
  }

  update(dt: number) {
    this.t += dt;
    if (this.shown < this.text.length) {
      this.shown = Math.min(this.text.length, this.shown + dt * 18);
      this.el.textContent = this.text.slice(0, Math.floor(this.shown));
      this.typing = true;
    } else {
      this.typing = false;
    }
    if (this.t >= this.hideAt && this.el.classList.contains('show')) this.el.classList.remove('show');
  }
}
