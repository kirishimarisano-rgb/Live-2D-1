import { Character, type CharDef } from './character';
import { pink } from './chars/pink';
import { maid } from './chars/maid';
import { PARAMS, type Params } from './params';
import { LipSync } from './lipsync';
import { loadLines } from './bubble';
import { DebugPanel } from './debug';
import { Background } from './background';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

async function main() {
  const qs = new URLSearchParams(location.search);
  const debugMode = qs.get('debug') === '1';
  const bg = new Background(document.getElementById('bg') as HTMLCanvasElement);
  // ?hour=20 可以固定背景的時刻（0～24），不加就用現在的時間
  if (qs.has('hour')) bg.hour = parseFloat(qs.get('hour')!);
  // 背景：圖片房間／程式畫的房間（記在這台瀏覽器，?bg=room 或 ?bg=photo 可指定）
  const BG_KEY = 'kanban-bg';
  try {
    const saved = localStorage.getItem(BG_KEY);
    if (saved === 'room' || saved === 'photo') bg.mode = saved;
  } catch { /* 無痕模式之類，用預設 */ }
  const qbg = qs.get('bg');
  if (qbg === 'room' || qbg === 'photo') bg.mode = qbg;
  const bgBtn = document.getElementById('bgbtn') as HTMLButtonElement;
  const bgLabel = () => { bgBtn.textContent = bg.mode === 'photo' ? '🖼 背景：房間圖' : '🖼 背景：小窗戶'; };
  bgLabel();
  bgBtn.addEventListener('click', () => {
    bg.mode = bg.mode === 'photo' ? 'room' : 'photo';
    try { localStorage.setItem(BG_KEY, bg.mode); } catch { /* 存不了就算了 */ }
    bgLabel();
    bg.draw();
  });

  const lines = loadLines();
  const settings = lines.settings;
  // 後面的畫在上面：女僕在左下角、主角在右下角
  const defs: CharDef[] = [maid, pink];
  const chars: Character[] = [];
  for (const def of defs) {
    const stage = document.getElementById(`stage-${def.id}`)!;
    const bubbleEl = document.getElementById(`bubble-${def.id}`)!;
    const charLines = (lines as unknown as Record<string, Record<string, string[]>>)[def.id] ?? {};
    const c = new Character(def, stage, bubbleEl, charLines, settings.showSeconds);
    c.motion.sleepAfter = settings.sleepAfterSeconds;
    // 畫布超出畫面的部分（切到的邊緣往外補的那一圈）
    stage.style.aspectRatio = `${def.rig.canvas.w} / ${def.rig.canvas.h}`;
    const bleed = def.rig.canvas.bleed;
    if (bleed) {
      stage.style.setProperty('--bleed-left', String(bleed.left / def.rig.canvas.h));
      stage.style.setProperty('--bleed-bottom', String(bleed.bottom / def.rig.canvas.h));
    }
    await c.load();
    chars.push(c);
  }
  const byId = (id: string) => chars.find((c) => c.id === id)!;
  const others = (c: Character) => chars.filter((o) => o !== c);

  // ---- 兩個人之間 ----
  /** 讓 a 轉頭看 b 一下 */
  const lookAtOther = (a: Character, b: Character, seconds: number) => {
    const [x, y] = b.headScreen();
    const [gx, gy] = a.gazeTo(x, y);
    a.motion.glance(gx, gy, seconds);
  };
  // 正在進行的對話：[誰, 台詞] 一句一句講
  let duo: [string, string][] = [];
  let duoNext = 0;
  const startDuo = (i: number) => {
    duo = lines.duo[i % lines.duo.length].map(([w, s]) => [w, s] as [string, string]);
    duoNext = t;
    chars.forEach((c) => c.bubble.hide());
  };
  let t = 0;
  // 用動畫時間排程（截圖時 advance 快轉也會照順序發生）
  const timers: { at: number; fn: () => void }[] = [];
  const later = (seconds: number, fn: () => void) => timers.push({ at: t + seconds, fn });

  const poke = (c: Character, where: 'head' | 'cheek' | 'body') => {
    duo = [];
    const r = c.poke(where);
    // 另一個人會轉頭看，偶爾吐槽一句
    for (const o of others(c)) {
      if (o.motion.sleeping) continue;
      lookAtOther(o, c, 1.8);
      if (r !== 'wake' && Math.random() < 0.45) {
        later(0.9, () => o.bubble.say('otherPoked'));
      }
    }
  };

  const debug = debugMode
    ? new DebugPanel(
        chars.map((c) => ({ id: c.id, name: c.def.name })),
        (id, where) => poke(byId(id), where as 'head' | 'cheek' | 'body'),
        (id) => (byId(id).motion.sleeping = true),
      )
    : null;

  // ---- 滑鼠 / 觸控 ----
  /** 最上面、而且這一點有畫到的角色 */
  const charAt = (x: number, y: number) => [...chars].reverse().find((c) => c.opaqueAt(x, y)) ?? null;
  window.addEventListener('pointermove', (e) => {
    for (const c of chars) {
      if (c.motion.input()) {
        c.bubble.say('wake');
        c.physics.kick(3);
        c.physics.flick(4);
      }
      const [gx, gy] = c.gazeTo(e.clientX, e.clientY);
      c.motion.look(gx, gy);
    }
    document.body.style.cursor = charAt(e.clientX, e.clientY) ? 'pointer' : '';
  });
  window.addEventListener('pointerdown', (e) => {
    const c = charAt(e.clientX, e.clientY);
    if (c) poke(c, c.hitTest(e.clientX, e.clientY));
  });
  window.addEventListener('keydown', () => chars.forEach((c) => c.motion.input()));

  // ---- 麥克風（兩個人都會跟著你的聲音動嘴巴）----
  const lip = new LipSync();
  const micBtn = document.getElementById('mic') as HTMLButtonElement;
  micBtn.addEventListener('click', async () => {
    chars.forEach((c) => c.motion.input());
    const host = byId('pink');
    if (lip.active) {
      lip.stop();
      micBtn.classList.remove('on');
      micBtn.textContent = '🎤 對嘴';
      host.bubble.say('micOff');
      return;
    }
    try {
      await lip.start();
      micBtn.classList.add('on');
      micBtn.textContent = '🎤 對嘴中（再按一次關閉）';
      host.bubble.say('micOn');
      later(1.2, () => byId('maid').bubble.say('micOn'));
    } catch (err) {
      console.warn(err);
      host.bubble.say('micError');
    }
  });

  // ---- 主迴圈 ----
  let last = performance.now();
  let frozen = false;
  let nextIdleLine = 2.5;

  const frame = (dt: number, draw = true) => {
    t += dt;
    for (let i = timers.length - 1; i >= 0; i--) {
      if (t >= timers[i].at) timers.splice(i, 1)[0].fn();
    }
    const mic = lip.active ? lip.read(dt) : null;
    for (const c of chars) {
      c.manual = debug?.manual && debug.target === c.id ? debug.values : null;
      c.frame(dt, mic);
    }

    // 對話：上一句講完就換下一個人
    if (duo.length && t > duoNext) {
      const [who, text] = duo.shift()!;
      const c = byId(who);
      if (c && !c.motion.sleeping) {
        c.bubble.show(text);
        for (const o of others(c)) {
          lookAtOther(o, c, 2.2);
          lookAtOther(c, o, 1.6);
        }
        duoNext = t + 1.2 + text.length * 0.11;
      } else duo = [];
    }

    // 隨機台詞（偶爾兩個人聊起來）
    if (t > nextIdleLine) {
      const [a, b] = settings.idleLineEverySeconds;
      nextIdleLine = t + rand(a, b);
      const awake = chars.filter((c) => !c.motion.sleeping);
      const busy = duo.length || chars.some((c) => c.bubble.visible);
      if (t < 5) {
        const [first, second] = awake.length === chars.length ? [byId('pink'), byId('maid')] : [null, null];
        first?.bubble.say('greeting', false);
        later(1.6, () => second?.motion.sleeping === false && second.bubble.say('greeting', false));
      } else if (!busy && awake.length === chars.length && Math.random() < settings.duoChance) {
        startDuo(Math.floor(Math.random() * lines.duo.length));
      } else {
        for (const c of chars) if (c.motion.sleeping) c.bubble.say('sleep', false);
        if (!busy && awake.length) pick(awake).bubble.say('idle', false);
      }
    }
    bg.update(dt);
    if (draw) render();
  };

  const render = () => {
    bg.draw();
    for (const c of chars) c.render(!!debug?.wire);
    const tgt = debug ? byId(debug.target) : null;
    if (tgt) debug!.sync(tgt.params);
  };

  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!frozen) frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // 給截圖腳本與自己調整用的介面；who 不寫就是主角（pink），'all' 是兩個人
  const sel = (who = 'pink') => (who === 'all' ? chars : [byId(who)]);
  (window as unknown as { kanban: unknown }).kanban = {
    chars: Object.fromEntries(chars.map((c) => [c.id, c])),
    params: (who = 'pink') => ({ ...byId(who).params }),
    paramList: PARAMS,
    /** 停止自動動作，直接指定參數並重畫 */
    pose(values: Params, who = 'pink') {
      frozen = true;
      bg.draw();
      for (const c of chars) {
        if (sel(who).includes(c)) c.pose(values);
        else c.render();
      }
    },
    /** 恢復自動動作 */
    resume() {
      frozen = false;
      last = performance.now();
    },
    /** 用固定的時間步長往前跑 n 秒（截圖用，結果和電腦快慢無關） */
    advance(seconds: number, step = 1 / 60) {
      frozen = true;
      for (let s = 0; s < seconds; s += step) frame(step, s + step >= seconds);
    },
    /** 隱藏某些部位（除錯用），例如 kanban.hide(['front_hair'], 'maid') */
    hide(names: string[], who = 'pink') {
      sel(who).forEach((c) => c.hide(names));
    },
    poke(where: 'head' | 'cheek' | 'body', who = 'pink') {
      poke(byId(who), where);
    },
    sleep(who = 'all') {
      sel(who).forEach((c) => (c.motion.sleeping = true));
    },
    lookAt(x: number, y: number) {
      chars.forEach((c) => c.motion.look(x, y));
    },
    /** 馬上開始一段兩個人的對話（第 i 段） */
    chat(i = 0) {
      startDuo(i);
    },
  };
  document.body.dataset.ready = '1';
}

main().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;left:8px;bottom:8px;color:#a00">${String(e)}</pre>`);
});
