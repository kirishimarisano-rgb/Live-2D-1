// 最小的 WebGL 渲染器：每個部位一個貼圖 + 一個三角網格。
import type { Mesh } from './mesh';

const VS = `
attribute vec2 aPos;
attribute vec2 aUV;
uniform vec2 uSize;
varying vec2 vUV;
void main() {
  vUV = aUV;
  vec2 p = aPos / uSize * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
}`;

const FS = `
precision mediump float;
uniform sampler2D uTex;
uniform float uAlpha;
uniform vec4 uTint;
varying vec2 vUV;
void main() {
  vec4 c = texture2D(uTex, vUV);
  c.rgb = mix(c.rgb, uTint.rgb * c.a, uTint.a);
  gl_FragColor = c * uAlpha;
}`;

const LINE_FS = `
precision mediump float;
uniform vec4 uColor;
void main() { gl_FragColor = uColor; }`;

export interface DrawItem {
  mesh: Mesh;
  tex: WebGLTexture;
  alpha: number;
  /** 0 = 不用 stencil；>0 寫入這個值；<0 只畫在 stencil == -值 的地方 */
  stencil: number;
  posBuf: WebGLBuffer;
  uvBuf: WebGLBuffer;
  idxBuf: WebGLBuffer;
  lineBuf: WebGLBuffer;
  lineCount: number;
  hidden?: boolean;
}

export class Renderer {
  gl: WebGLRenderingContext;
  prog: WebGLProgram;
  lineProg: WebGLProgram;
  width: number;
  height: number;

  constructor(public canvas: HTMLCanvasElement, width: number, height: number) {
    const gl = canvas.getContext('webgl', {
      premultipliedAlpha: true,
      alpha: true,
      stencil: true,
      antialias: true,
      preserveDrawingBuffer: true, // 讓截圖能讀到畫面
    });
    if (!gl) throw new Error('這個瀏覽器不支援 WebGL');
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.prog = this.program(VS, FS);
    this.lineProg = this.program(VS, LINE_FS);
  }

  private program(vs: string, fs: string) {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    return p;
  }

  texture(img: HTMLImageElement) {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  item(mesh: Mesh, tex: WebGLTexture, stencil = 0): DrawItem {
    const gl = this.gl;
    const posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.DYNAMIC_DRAW);
    const uvBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.STATIC_DRAW);
    const idxBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.index, gl.STATIC_DRAW);
    // 網格線（debug 用）：每個三角形三條邊
    const lines: number[] = [];
    for (let i = 0; i < mesh.index.length; i += 3) {
      const a = mesh.index[i], b = mesh.index[i + 1], c = mesh.index[i + 2];
      lines.push(a, b, b, c, c, a);
    }
    const lineBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(lines), gl.STATIC_DRAW);
    return { mesh, tex, alpha: 1, stencil, posBuf, uvBuf, idxBuf, lineBuf, lineCount: lines.length };
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  draw(items: DrawItem[], wire: boolean, tints?: Map<DrawItem, [number, number, number, number]>) {
    const gl = this.gl;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.prog);
    const aPos = gl.getAttribLocation(this.prog, 'aPos');
    const aUV = gl.getAttribLocation(this.prog, 'aUV');
    gl.uniform2f(gl.getUniformLocation(this.prog, 'uSize'), this.width, this.height);
    const uAlpha = gl.getUniformLocation(this.prog, 'uAlpha');
    const uTint = gl.getUniformLocation(this.prog, 'uTint');
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aUV);

    for (const it of items) {
      if (it.alpha <= 0.002) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, it.posBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, it.mesh.pos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, it.uvBuf);
      gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, it.idxBuf);
      gl.bindTexture(gl.TEXTURE_2D, it.tex);
      gl.uniform1f(uAlpha, it.alpha);
      const t = tints?.get(it) ?? [0, 0, 0, 0];
      gl.uniform4f(uTint, t[0], t[1], t[2], t[3]);
      if (it.stencil > 0) {
        gl.enable(gl.STENCIL_TEST);
        gl.stencilFunc(gl.ALWAYS, it.stencil, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      } else if (it.stencil < 0) {
        gl.enable(gl.STENCIL_TEST);
        gl.stencilFunc(gl.EQUAL, -it.stencil, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      } else {
        gl.disable(gl.STENCIL_TEST);
      }
      gl.drawElements(gl.TRIANGLES, it.mesh.index.length, gl.UNSIGNED_SHORT, 0);
    }
    gl.disable(gl.STENCIL_TEST);
    gl.disableVertexAttribArray(aUV);

    if (wire) {
      gl.useProgram(this.lineProg);
      const lp = gl.getAttribLocation(this.lineProg, 'aPos');
      gl.uniform2f(gl.getUniformLocation(this.lineProg, 'uSize'), this.width, this.height);
      const uColor = gl.getUniformLocation(this.lineProg, 'uColor');
      gl.enableVertexAttribArray(lp);
      items.forEach((it, i) => {
        if (it.alpha <= 0.002) return;
        const hue = (i * 0.137) % 1;
        const [r, g, b] = hsl(hue, 0.9, 0.45);
        gl.uniform4f(uColor, r * 0.35, g * 0.35, b * 0.35, 0.35);
        gl.bindBuffer(gl.ARRAY_BUFFER, it.posBuf);
        gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, it.lineBuf);
        gl.drawElements(gl.LINES, it.lineCount, gl.UNSIGNED_SHORT, 0);
      });
    }
  }
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
