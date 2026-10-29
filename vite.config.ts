import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

// 把 src/lines.json 原封不動塞進 HTML 的 <script id="lines-data">，
// 這樣就算只有打包好的單一 HTML，也能直接用文字編輯器改台詞。
function embedLines(): Plugin {
  return {
    name: 'embed-lines',
    transformIndexHtml(html) {
      const json = readFileSync('src/lines.json', 'utf8').replace(/<\//g, '<\\/');
      return html.replace('<!--LINES-->', `<script type="application/json" id="lines-data">\n${json}\n</script>`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [embedLines(), viteSingleFile()],
  build: { assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 100_000 },
});
