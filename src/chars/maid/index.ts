// 藍色垂耳女僕：art/ref-maid.jpg，由 tools/maid_segment.py 切出來（左右翻轉，從左下角探頭）
import type { CharDef } from '../../character';
import rig from './rig.json';

const images = import.meta.glob('./parts/*.png', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;

export const maid: CharDef = {
  id: 'maid',
  name: '垂耳女僕',
  rig: rig as unknown as CharDef['rig'],
  images,
  conf: {
    parts: {
      back_hair: { depth: -0.4, head: true, fade: [600, 730], cell: 24 },
      earL: { depth: -0.25, head: true, cell: 10 },
      earR: { depth: -0.25, head: true, cell: 10 },
      body: { depth: 0, head: false, cell: 20 },
      headdress: { depth: -0.15, head: true, cell: 14 },
      face: { depth: 0, head: true, cell: 14 },
      eyeL_white: { depth: 0.12, head: true, cell: 6 },
      eyeR_white: { depth: 0.12, head: true, cell: 6 },
      eyeL_iris: { depth: 0.15, head: true, cell: 6 },
      eyeR_iris: { depth: 0.15, head: true, cell: 6 },
      eyeL_lash: { depth: 0.13, head: true, cell: 5 },
      eyeR_lash: { depth: 0.13, head: true, cell: 5 },
      eyeL_closed: { depth: 0.13, head: true, cell: 5 },
      eyeR_closed: { depth: 0.13, head: true, cell: 5 },
      eyeL_smile: { depth: 0.13, head: true, cell: 5 },
      eyeR_smile: { depth: 0.13, head: true, cell: 5 },
      browL: { depth: 0.16, head: true, cell: 5 },
      browR: { depth: 0.16, head: true, cell: 5 },
      mouth_closed: { depth: 0.1, head: true, cell: 4 },
      mouth_open: { depth: 0.1, head: true, cell: 4 },
      blush: { depth: 0.1, head: true, cell: 12 },
      front_hair: { depth: 0.3, head: true, fade: [600, 730], cell: 14 },
      ahoge: { depth: 0.05, head: true, cell: 8 },
    },
    tune: {
      hairFront: { y0: 330, len: 300, fade: [600, 730] },
      hairBack: { y0: 330, len: 300, fade: [600, 730] },
      frontHairSideDepth: -0.15,
      tailLen: 300,
      ahogeLen: 220,
      earringLen: 40,
      earLen: 130,
      mouthW: 10,
      mouthOpenW: 12,
      cheekOffset: [-18, 18],
      tailHeadFade: [300, 800],
      roll: 0.1,
    },
  },
  // 比較愛睏、動作慢半拍
  persona: { headTau: 0.6, eyeTau: 0.12, blink: [2.6, 6.5], doubleBlink: 0.1, sleepFactor: 0.7, angle: [20, 14], sway: 0.8 },
};
