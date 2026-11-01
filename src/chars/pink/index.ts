// 粉紅雙馬尾（主角）：art/pink2/expression_01..12.png（同一張圖只換表情），由 tools/pink2_segment.py 切出來
// 座標都是畫布座標（原圖往左上移 180, 50）
import type { CharDef } from '../../character';
import rig from './rig.json';

const images = import.meta.glob('./parts/*.png', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;

export const pink: CharDef = {
  id: 'pink',
  name: '粉紅雙馬尾',
  rig: rig as unknown as CharDef['rig'],
  images,
  conf: {
    parts: {
      back_hair: { depth: -0.45, head: true, fade: [550, 650], cell: 24 },
      body: { depth: 0, head: false, cell: 24 },
      tail: { depth: -0.3, head: true, cell: 18 },
      headdress: { depth: -0.3, head: true, cell: 18 },
      face: { depth: 0, head: true, cell: 14 },
      eyeL_white: { depth: 0.12, head: true, cell: 6 },
      eyeR_white: { depth: 0.12, head: true, cell: 6 },
      eyeL_iris: { depth: 0.14, head: true, cell: 6 },
      eyeR_iris: { depth: 0.14, head: true, cell: 6 },
      eyeL_lower: { depth: 0.12, head: true, cell: 5 },
      eyeR_lower: { depth: 0.12, head: true, cell: 5 },
      eyeL_lash: { depth: 0.13, head: true, cell: 5 },
      eyeR_lash: { depth: 0.13, head: true, cell: 5 },
      eyeL_closed: { depth: 0.13, head: true, cell: 5 },
      eyeR_closed: { depth: 0.13, head: true, cell: 5 },
      eyeL_smile: { depth: 0.13, head: true, cell: 5 },
      eyeR_smile: { depth: 0.13, head: true, cell: 5 },
      mouth_closed: { depth: 0.1, head: true, cell: 5 },
      mouth_open: { depth: 0.1, head: true, cell: 5 },
      blush: { depth: 0.1, head: true, cell: 12 },
      front_hair: { depth: 0.22, head: true, fade: [550, 640], cell: 16 },
      ahoge: { depth: 0.1, head: true, cell: 8 },
      earring: { depth: -0.1, head: true, cell: 8 },
    },
    tune: {
      hairFront: { y0: 250, len: 330, fade: [550, 640] },
      hairBack: { y0: 250, len: 330, fade: [550, 650] },
      frontHairSideDepth: -0.2,
      tailLen: 640,
      ahogeLen: 220,
      earringLen: 40,
      earLen: 100,
      mouthW: 38,
      mouthOpenW: 22,
      cheekOffset: [-26, 22],
      tailHeadFade: [300, 800],
      roll: 0.15,
    },
  },
};
