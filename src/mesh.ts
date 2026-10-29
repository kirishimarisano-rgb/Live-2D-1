// 依圖片的 alpha 自動建立三角網格：把部位的外框切成格子，只保留有內容的格子。
export interface Mesh {
  rest: Float32Array; // 靜止時的頂點座標（畫布座標，px）
  uv: Float32Array;
  index: Uint16Array;
  pos: Float32Array; // 每一幀變形後的座標
  count: number; // 頂點數
}

export function buildMesh(
  img: HTMLImageElement,
  x: number,
  y: number,
  cell: number,
): Mesh {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const alpha = ctx.getImageData(0, 0, w, h).data;

  const cols = Math.max(1, Math.ceil(w / cell));
  const rows = Math.max(1, Math.ceil(h / cell));
  const used = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // 格子外圍多看 2px，避免邊緣被切掉
      const x0 = Math.max(0, c * cell - 2), x1 = Math.min(w, (c + 1) * cell + 2);
      const y0 = Math.max(0, r * cell - 2), y1 = Math.min(h, (r + 1) * cell + 2);
      let hit = false;
      for (let yy = y0; yy < y1 && !hit; yy += 2) {
        for (let xx = x0; xx < x1; xx += 2) {
          if (alpha[(yy * w + xx) * 4 + 3] > 2) { hit = true; break; }
        }
      }
      used[r * cols + c] = hit ? 1 : 0;
    }
  }

  const vid = new Int32Array((cols + 1) * (rows + 1)).fill(-1);
  const rest: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const vert = (c: number, r: number) => {
    const k = r * (cols + 1) + c;
    if (vid[k] < 0) {
      vid[k] = rest.length / 2;
      const px = Math.min(c * cell, w);
      const py = Math.min(r * cell, h);
      rest.push(x + px, y + py);
      uv.push(px / w, py / h);
    }
    return vid[k];
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!used[r * cols + c]) continue;
      const a = vert(c, r), b = vert(c + 1, r), d = vert(c, r + 1), e = vert(c + 1, r + 1);
      idx.push(a, b, e, a, e, d);
    }
  }
  if (rest.length / 2 > 65535) throw new Error('mesh too big');
  return {
    rest: new Float32Array(rest),
    uv: new Float32Array(uv),
    index: new Uint16Array(idx),
    pos: new Float32Array(rest),
    count: rest.length / 2,
  };
}
