// ?debug=1：顯示網格線與所有參數滑桿。
import { PARAMS, type Params } from './params';

export class DebugPanel {
  manual = false;
  wire = true;
  values: Params = {};
  /** 滑桿控制哪一個角色 */
  target: string;
  private inputs = new Map<string, HTMLInputElement>();
  private labels = new Map<string, HTMLElement>();

  constructor(chars: { id: string; name: string }[], onPoke: (id: string, where: string) => void, onSleep: (id: string) => void) {
    this.target = chars[chars.length - 1].id;
    const box = document.createElement('div');
    box.id = 'debug';
    box.innerHTML = `
      <style>
        #debug { position: fixed; left: 12px; top: 12px; bottom: 12px; width: 300px; overflow: auto; z-index: 20;
          background: rgba(255,255,255,.92); border: 1px solid #e3b6c4; border-radius: 12px; padding: 10px 12px;
          font: 12px/1.4 system-ui, sans-serif; color: #5a3440; }
        #debug h3 { margin: 0 0 6px; font-size: 14px; }
        #debug label.row { display: grid; grid-template-columns: 92px 1fr 44px; gap: 6px; align-items: center; margin: 2px 0; }
        #debug input[type=range] { width: 100%; }
        #debug .tog { display: flex; gap: 10px; margin: 6px 0; flex-wrap: wrap; }
        #debug button, #debug select { font: inherit; border: 1px solid #e3b6c4; background: #fff; border-radius: 6px; padding: 2px 8px; cursor: pointer; }
        #debug .v { text-align: right; font-variant-numeric: tabular-nums; }
        #debug.folded { bottom: auto; }
        #debug.folded #dbg-sliders { display: none; }
        .hint { display: none; }
      </style>
      <h3>debug 模式</h3>
      <div class="tog"><label>角色 <select id="dbg-char">${chars
        .map((c) => `<option value="${c.id}"${c.id === this.target ? ' selected' : ''}>${c.name}</option>`)
        .join('')}</select></label></div>
      <div class="tog">
        <label><input type="checkbox" id="dbg-wire" checked> 網格線</label>
        <label><input type="checkbox" id="dbg-manual"> 手動（停止自動動作）</label>
      </div>
      <div class="tog">
        <button data-poke="head">戳頭</button><button data-poke="cheek">戳臉頰</button>
        <button data-poke="body">戳身體</button><button id="dbg-sleep">睡覺</button>
        <button id="dbg-reset">參數歸零</button><button id="dbg-fold">收合</button>
      </div>
      <div id="dbg-sliders"></div>`;
    document.body.appendChild(box);
    const sliders = box.querySelector('#dbg-sliders')!;
    for (const d of PARAMS) {
      const row = document.createElement('label');
      row.className = 'row';
      row.innerHTML = `<span title="${d.id}">${d.name}</span><input type="range" min="${d.min}" max="${d.max}" step="${(d.max - d.min) / 200}" value="${d.def}"><span class="v"></span>`;
      const input = row.querySelector('input')!;
      input.addEventListener('input', () => {
        this.values[d.id] = parseFloat(input.value);
        if (!this.manual) this.setManual(true);
      });
      this.inputs.set(d.id, input);
      this.labels.set(d.id, row.querySelector('.v')!);
      this.values[d.id] = d.def;
      sliders.appendChild(row);
    }
    const charSel = box.querySelector<HTMLSelectElement>('#dbg-char')!;
    charSel.addEventListener('change', () => {
      this.target = charSel.value;
      this.setManual(false);
    });
    const wire = box.querySelector<HTMLInputElement>('#dbg-wire')!;
    wire.addEventListener('change', () => (this.wire = wire.checked));
    const manual = box.querySelector<HTMLInputElement>('#dbg-manual')!;
    manual.addEventListener('change', () => this.setManual(manual.checked));
    box.querySelectorAll<HTMLButtonElement>('[data-poke]').forEach((b) =>
      b.addEventListener('click', () => {
        this.setManual(false);
        onPoke(this.target, b.dataset.poke!);
      }),
    );
    box.querySelector('#dbg-sleep')!.addEventListener('click', () => {
      this.setManual(false);
      onSleep(this.target);
    });
    // 面板會擋到左下角的女僕，可以收起來
    const fold = box.querySelector<HTMLButtonElement>('#dbg-fold')!;
    fold.addEventListener('click', () => {
      const folded = box.classList.toggle('folded');
      fold.textContent = folded ? '展開' : '收合';
    });
    box.querySelector('#dbg-reset')!.addEventListener('click', () => {
      for (const d of PARAMS) this.values[d.id] = d.def;
      this.setManual(true);
      this.sync(this.values);
    });
  }

  setManual(on: boolean) {
    this.manual = on;
    (document.getElementById('dbg-manual') as HTMLInputElement).checked = on;
  }

  /** 自動模式下讓滑桿顯示目前的值 */
  sync(p: Params) {
    for (const d of PARAMS) {
      const v = p[d.id];
      if (!this.manual) {
        this.inputs.get(d.id)!.value = String(v);
        this.values[d.id] = v;
      }
      this.labels.get(d.id)!.textContent = v.toFixed(2);
    }
  }
}
