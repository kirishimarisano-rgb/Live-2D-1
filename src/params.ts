// 參數表（像 Live2D 的參數）。debug 模式的滑桿就是照這張表產生的。
export interface ParamDef {
  id: string;
  name: string;
  min: number;
  max: number;
  def: number;
}

export const PARAMS: ParamDef[] = [
  { id: 'angleX', name: '頭 左右轉', min: -30, max: 30, def: 0 },
  { id: 'angleY', name: '頭 上下', min: -30, max: 30, def: 0 },
  { id: 'angleZ', name: '頭 歪頭', min: -30, max: 30, def: 0 },
  { id: 'bodyX', name: '身體 左右', min: -10, max: 10, def: 0 },
  { id: 'bodyZ', name: '身體 傾斜', min: -10, max: 10, def: 0 },
  { id: 'breath', name: '呼吸', min: 0, max: 1, def: 0 },
  { id: 'eyeLOpen', name: '左眼 開合', min: 0, max: 1.2, def: 1 },
  { id: 'eyeROpen', name: '右眼 開合', min: 0, max: 1.2, def: 1 },
  { id: 'eyeSmile', name: '眼睛 笑', min: 0, max: 1, def: 0 },
  { id: 'eyeBallX', name: '瞳孔 左右', min: -1, max: 1, def: 0 },
  { id: 'eyeBallY', name: '瞳孔 上下', min: -1, max: 1, def: 0 },
  { id: 'browY', name: '眉毛 上下', min: -1, max: 1, def: 0 },
  { id: 'browAngle', name: '眉毛 角度', min: -1, max: 1, def: 0 },
  { id: 'mouthOpen', name: '嘴巴 開合', min: 0, max: 1, def: 0 },
  { id: 'mouthForm', name: '嘴巴 形狀', min: -1, max: 1, def: 0 },
  { id: 'cheekPuff', name: '鼓臉頰', min: 0, max: 1, def: 0 },
  { id: 'blush', name: '臉紅', min: 0, max: 1, def: 0 },
  { id: 'hairFront', name: '瀏海 擺動', min: -1, max: 1, def: 0 },
  { id: 'hairBack', name: '後髮 擺動', min: -1, max: 1, def: 0 },
  { id: 'tail', name: '側馬尾 擺動', min: -1, max: 1, def: 0 },
  { id: 'ahoge', name: '呆毛 擺動', min: -1, max: 1, def: 0 },
  { id: 'earring', name: '耳環 擺動', min: -1, max: 1, def: 0 },
];

export type Params = Record<string, number>;

export function defaultParams(): Params {
  const p: Params = {};
  for (const d of PARAMS) p[d.id] = d.def;
  return p;
}

export function clampParams(p: Params) {
  for (const d of PARAMS) p[d.id] = Math.min(d.max, Math.max(d.min, p[d.id] ?? d.def));
}
