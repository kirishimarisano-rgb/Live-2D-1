import { Character, type CharDef } from './character';
import { pink } from './chars/pink';
import { maid } from './chars/maid';
import { PARAMS, type Params } from './params';
import { LipSync } from './lipsync';
import { getUserName, loadLines, setUserName } from './bubble';
import { DebugPanel } from './debug';
import { Background } from './background';
import { chat, DUO_RULES, loadAi, parseDuo, parseLine, PERSONA, PRESETS, RULES, saveAi, type Mood, type Msg } from './ai';
import { blobImage, loadBlob, loadText, saveBlob, saveText } from './store';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

async function main() {
  const qs = new URLSearchParams(location.search);
  const debugMode = qs.get('debug') === '1';
  const bg = new Background(document.getElementById('bg') as HTMLCanvasElement);
  // ?hour=20 可以固定背景的時刻（0～24），不加就用現在的時間
  if (qs.has('hour')) bg.hour = parseFloat(qs.get('hour')!);
  // 背景：圖片房間／程式畫的房間／自己上傳的圖（記在這台瀏覽器，?bg=room / photo / custom 可指定）
  const BG_KEY = 'kanban-bg';
  const saved = loadText(BG_KEY);
  if (saved === 'room' || saved === 'photo' || saved === 'custom') bg.mode = saved;
  const qbg = qs.get('bg');
  if (qbg === 'room' || qbg === 'photo' || qbg === 'custom') bg.mode = qbg;
  const customBlob = await loadBlob('background');
  if (customBlob) bg.custom = await blobImage(customBlob).catch(() => null);
  if (bg.mode === 'custom' && !bg.custom) bg.mode = 'photo';
  const bgBtn = document.getElementById('bgbtn') as HTMLButtonElement;
  const BG_NAMES = { photo: '房間圖', room: '小窗戶', custom: '我的圖' } as const;
  const bgLabel = () => { bgBtn.textContent = `🖼 背景：${BG_NAMES[bg.mode]}`; };
  const setBg = (m: typeof bg.mode) => {
    bg.mode = m;
    saveText(BG_KEY, m);
    bgLabel();
    bg.draw();
  };
  bgLabel();
  bgBtn.addEventListener('click', () => {
    const order: (typeof bg.mode)[] = bg.custom ? ['photo', 'room', 'custom'] : ['photo', 'room'];
    setBg(order[(order.indexOf(bg.mode) + 1) % order.length]);
  });

  // 名字：台詞裡的 {name}
  setUserName(loadText('kanban-name') ?? '');

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
  let duo: [string, string, Mood?][] = [];
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

  // 短時間內戳太多次會抗議
  const pokeTimes = new Map<string, number[]>();
  const poke = (c: Character, where: 'head' | 'cheek' | 'body') => {
    duo = [];
    const r = c.poke(where);
    const times = (pokeTimes.get(c.id) ?? []).filter((x) => t - x < 6);
    times.push(t);
    pokeTimes.set(c.id, times);
    const many = (settings as Record<string, unknown>).pokeManyCount as number ?? 4;
    if (r !== 'wake' && times.length >= many) {
      c.bubble.say('pokeMany');
      pokeTimes.set(c.id, []);
    }
    // 另一個人會轉頭看，偶爾吐槽一句
    for (const o of others(c)) {
      if (o.motion.sleeping) continue;
      lookAtOther(o, c, 1.8);
      if (r !== 'wake' && Math.random() < 0.45) {
        later(0.9, () => o.bubble.say('otherPoked'));
      }
    }
  };

  // 依時間挑台詞：早上／中午／下午／晚上／深夜
  const timeKind = () => {
    const h = bg.hour ?? new Date().getHours() + new Date().getMinutes() / 60;
    if (h >= 5 && h < 11) return 'morning';
    if (h >= 11 && h < 14) return 'noon';
    if (h >= 14 && h < 18) return 'afternoon';
    if (h >= 18 && h < 22) return 'evening';
    return 'lateNight';
  };
  const timeChance = ((settings as Record<string, unknown>).timeLineChance as number) ?? 0.35;
  const sayTimed = (c: Character, kind: 'idle' | 'greeting') =>
    c.bubble.say(Math.random() < timeChance && c.lines[timeKind()]?.length ? timeKind() : kind, false);

  // 離開分頁一段時間再回來，她們會說「歡迎回來」
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = performance.now(); return; }
    const away = (performance.now() - hiddenAt) / 1000;
    const need = ((settings as Record<string, unknown>).returnAfterSeconds as number) ?? 60;
    if (hiddenAt && away > need) {
      for (const c of chars) c.motion.input();
      byId('pink').bubble.say('return');
      later(1.8, () => byId('maid').bubble.say('return'));
    }
  });

  // ---- 設定面板：名字、自訂背景 ----
  const panel = document.getElementById('settings')!;
  const nameInput = document.getElementById('name-input') as HTMLInputElement;
  const fileInput = document.getElementById('bg-file') as HTMLInputElement;
  const clearBtn = document.getElementById('bg-clear') as HTMLButtonElement;
  const note = document.getElementById('settings-note')!;
  nameInput.value = getUserName();
  clearBtn.disabled = !bg.custom;
  document.getElementById('gear')!.addEventListener('click', () => panel.classList.toggle('open'));
  document.getElementById('settings-close')!.addEventListener('click', () => panel.classList.remove('open'));
  document.getElementById('name-save')!.addEventListener('click', () => {
    setUserName(nameInput.value);
    saveText('kanban-name', getUserName() || null);
    if (getUserName()) {
      byId('pink').bubble.say('nameSet');
      later(1.6, () => byId('maid').bubble.say('nameSet'));
    }
    note.textContent = getUserName() ? `好，之後會叫你「${getUserName()}」。` : '名字清掉了，改回預設的叫法。';
  });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    document.getElementById('bg-file-name')!.textContent = f.name;
    // 太大的圖縮到 2560 寬再存，省空間
    const img = await blobImage(f).catch(() => null);
    if (!img) { note.textContent = '這個檔案打不開，換一張圖試試看。'; return; }
    const k = Math.min(1, 2560 / img.naturalWidth);
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * k);
    cv.height = Math.round(img.naturalHeight * k);
    cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, 'image/jpeg', 0.9));
    if (!blob) return;
    bg.custom = await blobImage(blob);
    const okSaved = await saveBlob('background', blob);
    note.textContent = okSaved ? '換好了！這張圖會記在這台電腦的瀏覽器裡。' : '換好了，但這個瀏覽器存不了，重新整理後會不見。';
    clearBtn.disabled = false;
    setBg('custom');
    byId('pink').bubble.say('bgChanged');
    later(1.6, () => byId('maid').bubble.say('bgChanged'));
    fileInput.value = '';
  });
  clearBtn.addEventListener('click', async () => {
    bg.custom = null;
    await saveBlob('background', null);
    clearBtn.disabled = true;
    note.textContent = '自訂背景刪掉了。';
    if (bg.mode === 'custom') setBg('photo');
  });

  // ---- AI 聊天 ----
  const showMood = (c: Character, mood: Mood) => {
    if (mood === 'shy') { c.motion.react('shy'); c.physics.kick(3); }
    else if (mood === 'angry') c.motion.react('puff');
    else if (mood === 'happy') { c.motion.react('body'); c.physics.kick(2); }
  };
  let history: Msg[] = [];
  let pending: AbortController | null = null;
  const chatForm = document.getElementById('chat') as HTMLFormElement;
  const chatInput = document.getElementById('chat-input') as HTMLInputElement;
  const chatWho = document.getElementById('chat-who') as HTMLSelectElement;
  const callName = (id: string) => getUserName() || byId(id).def.callYou || '你';
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    const cfg = loadAi();
    if (!cfg || !cfg.model) {
      byId('pink').bubble.show('要先到「⚙ 設定」接上 AI，我才能跟你聊天喔～');
      panel.classList.add('open');
      return;
    }
    chatInput.value = '';
    pending?.abort();
    pending = new AbortController();
    duo = [];
    for (const c of chars) c.motion.input();
    const who = chatWho.value;
    const both = who === 'both';
    const speaker = both ? byId('pink') : byId(who);
    for (const c of chars) if (c !== speaker) c.bubble.hide();
    speaker.bubble.show('……');
    if (both) lookAtOther(byId('maid'), byId('pink'), 2);
    const system = both
      ? `${PERSONA.pink.replace('{name}', callName('pink'))}\n${PERSONA.maid.replace('{name}', callName('maid'))}\n${DUO_RULES}`
      : `${PERSONA[who].replace('{name}', callName(who))}\n${RULES}`;
    history.push({ role: 'user', content: both ? text : text });
    history = history.slice(-12);
    try {
      const reply = await chat(cfg, system, history, pending.signal);
      history.push({ role: 'assistant', content: reply });
      if (both) {
        const lines_ = parseDuo(reply);
        speaker.bubble.hide();
        duo = lines_;
        duoNext = t;
      } else {
        const { text: say, mood } = parseLine(reply);
        speaker.bubble.show(say || '……');
        if (mood) showMood(speaker, mood);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      history.pop();
      console.warn('AI 連線失敗', err);
      speaker.bubble.show('嗚……連不上 AI 耶，去設定看看？');
      aiNote.textContent = `連線失敗：${String((err as Error).message ?? err).slice(0, 120)}`;
    }
  });

  // 設定面板裡的 AI 區塊
  const aiPreset = document.getElementById('ai-preset') as HTMLSelectElement;
  const aiUrl = document.getElementById('ai-url') as HTMLInputElement;
  const aiModel = document.getElementById('ai-model') as HTMLInputElement;
  const aiKey = document.getElementById('ai-key') as HTMLInputElement;
  const aiNote = document.getElementById('ai-note')!;
  for (const [k, p] of Object.entries(PRESETS)) aiPreset.add(new Option(p.label, k));
  const fillAi = (preset: string, keepKey = false) => {
    const p = PRESETS[preset];
    aiUrl.value = p.baseUrl;
    aiModel.value = p.model;
    if (!keepKey) aiKey.value = '';
  };
  const savedAi = loadAi();
  if (savedAi) {
    aiPreset.value = savedAi.preset;
    aiUrl.value = savedAi.baseUrl;
    aiModel.value = savedAi.model;
    aiKey.value = savedAi.apiKey;
  } else fillAi('ollama');
  aiPreset.addEventListener('change', () => fillAi(aiPreset.value));
  const readAi = () => ({
    preset: aiPreset.value,
    provider: PRESETS[aiPreset.value].provider,
    baseUrl: aiUrl.value.trim(),
    model: aiModel.value.trim(),
    apiKey: aiKey.value.trim(),
  });
  document.getElementById('ai-save')!.addEventListener('click', () => {
    saveAi(readAi());
    history = [];
    aiNote.textContent = '存好了！在下面的聊天框打字就可以聊天。';
  });
  document.getElementById('ai-test')!.addEventListener('click', async () => {
    aiNote.textContent = '測試中……';
    try {
      const r = await chat(readAi(), '用繁體中文回一句很短的打招呼。', [{ role: 'user', content: '嗨' }]);
      aiNote.textContent = `連上了：${parseLine(r).text.slice(0, 40)}`;
    } catch (err) {
      const local = aiPreset.value === 'ollama' || aiPreset.value === 'lmstudio';
      aiNote.textContent = `連不上：${String((err as Error).message ?? err).slice(0, 100)}` +
        (local ? '（本機模型要開啟跨網域：Ollama 啟動前設定 OLLAMA_ORIGINS=*；LM Studio 在伺服器設定打開 CORS）' : '');
    }
  });
  document.getElementById('ai-clear')!.addEventListener('click', () => {
    saveAi(null);
    fillAi(aiPreset.value);
    aiNote.textContent = 'AI 設定（含金鑰）已從這個瀏覽器刪除。';
  });

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
      const [who, text, mood] = duo.shift()!;
      const c = byId(who);
      if (c && !c.motion.sleeping) {
        c.bubble.show(text);
        if (mood) showMood(c, mood);
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
        if (first) sayTimed(first, 'greeting');
        later(1.6, () => second?.motion.sleeping === false && sayTimed(second, 'greeting'));
      } else if (!busy && awake.length === chars.length && Math.random() < settings.duoChance) {
        startDuo(Math.floor(Math.random() * lines.duo.length));
      } else {
        for (const c of chars) if (c.motion.sleeping) c.bubble.say('sleep', false);
        if (!busy && awake.length) sayTimed(pick(awake), 'idle');
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
