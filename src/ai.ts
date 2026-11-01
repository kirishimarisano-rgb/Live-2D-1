// 接 AI 聊天：OpenAI 相容的介面（Ollama、LM Studio、OpenAI、OpenRouter……）或 Anthropic（Claude）。
// 設定只存在這台瀏覽器（localStorage），金鑰不會送到除了你選的 AI 以外的地方。
import { loadText, saveText } from './store';

export type Provider = 'openai' | 'anthropic';

export interface AiConfig {
  provider: Provider;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export const PRESETS: Record<string, AiConfig & { label: string }> = {
  ollama: { label: 'Ollama（本機）', provider: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b', apiKey: '' },
  lmstudio: { label: 'LM Studio（本機）', provider: 'openai', baseUrl: 'http://localhost:1234/v1', model: 'local-model', apiKey: '' },
  openai: { label: 'OpenAI', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' },
  openrouter: { label: 'OpenRouter', provider: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', apiKey: '' },
  claude: { label: 'Claude（Anthropic）', provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-haiku-5-5', apiKey: '' },
  custom: { label: '其他（OpenAI 相容）', provider: 'openai', baseUrl: 'http://localhost:8080/v1', model: '', apiKey: '' },
};

const KEY = 'kanban-ai';

export function loadAi(): (AiConfig & { preset: string }) | null {
  try {
    const raw = loadText(KEY);
    const c = raw ? JSON.parse(raw) : null;
    if (!c || typeof c.baseUrl !== 'string' || typeof c.model !== 'string') return null;
    return { preset: 'custom', provider: 'openai', apiKey: '', ...c };
  } catch {
    return null;
  }
}

export function saveAi(c: (AiConfig & { preset: string }) | null) {
  saveText(KEY, c ? JSON.stringify(c) : null);
}

export interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

/** 送出對話，回傳 AI 的文字 */
export async function chat(cfg: AiConfig, system: string, messages: Msg[], signal?: AbortSignal): Promise<string> {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  if (cfg.provider === 'anthropic') {
    const r = await fetch(`${base}/messages`, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: cfg.model, max_tokens: 300, system, messages }),
    });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return (j.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
  }
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers,
    body: JSON.stringify({ model: cfg.model, max_tokens: 300, temperature: 0.8, messages: [{ role: 'system', content: system }, ...messages] }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? '';
}

// ---- 角色設定 ----
export const PERSONA: Record<string, string> = {
  pink: '你是「粉紅」，粉紅色長髮、側馬尾、穿蘿莉塔洋裝的看板娘。個性活潑、愛撒嬌、有點傲嬌，被摸頭會害羞，喜歡甜點和蛋糕。叫對方「{name}」。',
  maid: '你是「女僕」，藍色長髮、垂耳、Q 版的女僕看板娘。個性慢吞吞、愛睏、話很少、常用「……」，但很關心主人，喜歡布丁和泡茶。叫對方「{name}」。',
};

export const RULES =
  '用繁體中文、口語、像在聊天，一次只回一到兩句、不超過 40 個字，不要用條列、不要用表情符號以外的格式。' +
  '可以在句子最前面加一個心情標記：[開心]、[害羞]、[生氣]、[想睡]，沒有特別心情就不要加。';

export const DUO_RULES =
  '你同時扮演兩個角色：「粉紅」和「女僕」。兩人一起回應對方，一共 2 到 3 行，每行開頭寫「粉紅：」或「女僕：」，每行不超過 30 個字。' +
  '心情標記放在冒號後面，例如「女僕：[想睡]……好睏」。用繁體中文、口語。';

export type Mood = 'happy' | 'shy' | 'angry' | 'sleepy' | null;

/** 拿掉心情標記和多餘的東西 */
export function parseLine(s: string): { text: string; mood: Mood } {
  let t = s.replace(/<think>[\s\S]*?<\/think>/g, '').trim(); // 有些本地模型會輸出思考過程
  let mood: Mood = null;
  const m = t.match(/^\s*[[【](開心|害羞|生氣|想睡)[\]】]\s*/);
  if (m) {
    mood = ({ 開心: 'happy', 害羞: 'shy', 生氣: 'angry', 想睡: 'sleepy' } as const)[m[1] as '開心'];
    t = t.slice(m[0].length);
  }
  t = t.replace(/[[【](開心|害羞|生氣|想睡)[\]】]/g, '').replace(/\s+/g, ' ').trim();
  return { text: t.slice(0, 120), mood };
}

/** 「兩個人」模式：拆成 [誰, 台詞] */
export function parseDuo(s: string): [string, string, Mood][] {
  const out: [string, string, Mood][] = [];
  for (const raw of s.replace(/<think>[\s\S]*?<\/think>/g, '').split('\n')) {
    const m = raw.match(/^\s*(粉紅|女僕)\s*[:：]\s*(.+)$/);
    if (!m) continue;
    const { text, mood } = parseLine(m[2]);
    if (text) out.push([m[1] === '粉紅' ? 'pink' : 'maid', text, mood]);
  }
  if (!out.length) {
    const { text, mood } = parseLine(s);
    if (text) out.push(['pink', text, mood]);
  }
  return out.slice(0, 4);
}
