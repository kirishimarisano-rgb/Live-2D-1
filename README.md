# 網頁看板娘

用一張平面的二次元角色圖做出像 Live2D 那樣會動的看板娘。沒有用 Live2D SDK 或任何角色動畫函式庫，網格變形、物理、眨眼、對嘴全部是自己用 TypeScript + WebGL 寫的。

> 圖是別人畫的，自己玩沒問題，但**不要公開發布**（這個 repo 請保持私人）。

## 直接玩

雙擊 **`dist/index.html`** 就能打開（單一檔案，圖片都內嵌在裡面，不用架伺服器）。

- 眼睛和頭會跟著滑鼠轉（眼睛比頭快）
- 戳**頭**：害羞瞇眼、臉紅
- 戳**臉頰**：鼓起來
- 滑鼠**不動 15 秒**：開始打瞌睡，再戳她一下或動滑鼠就會驚醒
- 按「🎤 對嘴」：允許麥克風後，她的嘴巴會跟著你的聲音動
- 右下角的對話框會隨機說話
- 網址後面加 `?debug=1`（例如 `dist/index.html?debug=1`）：顯示網格線和所有參數滑桿
- 背景的窗外會跟著你電腦現在的時間變成白天、黃昏或晚上；想固定的話加 `?hour=20`（0～24，可以和 debug 一起用：`?debug=1&hour=18`）

**跑完先玩什麼**：打開後別動滑鼠，等她打瞌睡，再戳她一下喵。

## 開發

需要 Node.js 18 以上。

```bash
npm install
npm run dev      # 開發伺服器，改程式會自動重新整理
npm run build    # 打包成 dist/index.html
```

重新切圖需要 Python 3 和 `pip install pillow numpy opencv-python-headless`：

```bash
npm run parts    # = python3 tools/cutout.py && python3 tools/segment.py
python3 tools/rig_sheet.py   # 重新產生 RIG.md 用的圖
```

截圖檢查需要 Playwright（`npm i -D playwright && npx playwright install chromium`）：

```bash
npm run build && node tools/shots.mjs m5        # 全部姿勢存到 screenshots/m5-*.png
node tools/shots.mjs test eyes-closed corner     # 只拍某幾個
```

## 改台詞

台詞在 **`src/lines.json`**，改完 `npm run build` 就好。

不想重新打包的話，也可以直接用文字編輯器打開 `dist/index.html`，最上面有一段 `<script type="application/json" id="lines-data">`，裡面就是同一份台詞，直接改那裡也有效。

| 欄位 | 什麼時候說 |
|---|---|
| `greeting` | 剛打開 |
| `idle` | 沒事的時候隨機說 |
| `head` / `cheek` / `body` | 被戳頭、臉頰、身體 |
| `sleep` / `wake` | 打瞌睡中、被叫醒 |
| `micOn` / `micOff` / `micError` | 開關麥克風、麥克風不能用 |
| `settings.sleepAfterSeconds` | 滑鼠多久不動就打瞌睡（秒） |
| `settings.idleLineEverySeconds` | 隨機說話的間隔 `[最短, 最長]`（秒） |
| `settings.showSeconds` | 對話框停留多久（秒，長句會自動加長） |

## 調參數

1. 打開 `?debug=1`，左邊有所有參數的滑桿。拉任何一個就會切到「手動」模式（停止自動動作，但頭髮物理還是會動），勾掉「手動」就恢復自動。
2. 找到喜歡的數值後，改程式裡對應的地方：

| 想改的 | 檔案 | 位置 |
|---|---|---|
| 參數範圍、預設值 | `src/params.ts` | `PARAMS` |
| 各部位轉頭時的立體感（視差） | `src/model.ts` | `PART_CONF` 的 `depth`：越大越靠前、動越多；負數會往反方向動 |
| 轉頭幅度、眼睛和頭追滑鼠的速度 | `src/motion.ts` | 「視線」那段：`follow(..., 0.07)` 是眼睛、`0.38` 是頭（秒，越小越快）；`* 24`、`* 18` 是最大角度 |
| 眨眼頻率、連眨機率 | `src/motion.ts` | 「眨眼」那段：`rand(1.8, 5.5)` 秒眨一次、`0.18` 是連眨機率 |
| 呼吸、晃動 | `src/motion.ts` | 「呼吸與晃動」那段 |
| 害羞、鼓臉、驚醒的表情 | `src/motion.ts` | 「反應」那段，每種反應各自設定要改哪些參數 |
| 頭髮、馬尾、呆毛、耳環的晃法 | `src/physics.ts` | `HairPhysics.parts`：`stiff` 越大越硬、`damping` 越大越快停、`inertia` 越大越容易被甩 |
| 網格密度 | `src/model.ts` | `PART_CONF` 的 `cell`（px，越小越細） |
| 呆毛、馬尾的待機晃動 | `src/physics.ts` | `update()` 裡 `this.ahoge.step(...)`、`this.tail.step(...)` 的正弦波大小；`breeze = 0` 就完全不晃 |
| 背景（窗戶、天空顏色、花瓣、串燈） | `src/background.ts` | `SKY` 是每個時刻的天空顏色；花瓣數量在建構子的 `26` |
| 麥克風靈敏度 | `src/lipsync.ts` | `(rms - ...) * 9` 的 `9` |

## 換成別的角色圖

### 做法 A：自己準備分好的圖層（效果最好）

1. 每個部位一張 PNG，**和整張圖同樣大小、對齊**，被遮住的地方也要畫出來（例如瀏海底下的額頭、睫毛底下的眼白）。檔名照這張表：

   `back_hair` 後髮 · `body` 身體（含脖子）· `tail` 馬尾（沒有就省略）· `headdress` 頭飾 · `face` 臉（不含眼睛和嘴）· `eyeL_white` `eyeR_white` 眼白 · `eyeL_iris` `eyeR_iris` 瞳孔（畫成完整的圓）· `eyeL_lash` `eyeR_lash` 上眼皮含睫毛 · `eyeL_closed` `eyeR_closed` 閉眼的線 · `eyeL_smile` `eyeR_smile` 笑眼（^ ^）的線 · `browL` `browR` 眉毛 · `mouth_closed` `mouth_open` 閉嘴和張嘴 · `blush` 臉紅 · `front_hair` 瀏海與側髮 · `ahoge` 呆毛 · `earring` 飾品

   （`L` 是畫面左邊那一隻）

2. 寫一個小腳本把它們裁到最小外框、放進 `src/assets/parts/`，並更新 `src/assets/rig.json`：每個部位的 `x, y, w, h`（在畫布上的位置）、`z`（層級）、馬尾／呆毛／耳環的 `pivot`（樞紐）、瞳孔的 `center`、張嘴的 `anchor`。可以直接參考 `tools/segment.py` 最後面 `save_layer()` 的寫法。
3. `rig.json` 裡還要改：`headCenter`、`headRadius`（頭部中心和半徑）、`neck`（脖子）、`bodyPivot`（身體底部中心）、`mouth`、`blush`（兩頰中心）、`eyes.L/R.top`（睫毛下緣的點，左到右）、`eyes.L/R.bot`（下眼緣的點，左到右，最後回到右上角）、`eyes.L/R.iris`（瞳孔中心 x, y 和半徑）。
4. 部位名稱不一樣或沒有某個部位，就到 `src/model.ts` 的 `PART_CONF` 和 `deform()` 裡增減。
5. `npm run build`，用 `?debug=1` 看網格和拉參數檢查。

### 做法 B：只有一張平面圖

1. 圖放進 `art/`，改 `tools/cutout.py` 讀的檔名。背景如果不是純色條紋，就要改去背的方法（或先自己去背成透明 PNG，跳過這一步直接存成 `build/cutout.png`）。
2. 打開 `tools/segment.py`，最上面的座標全部是原圖的像素座標，照新圖重新量：
   - `P['body']`（脖子以下）、`P['tail']`、`P['headdress']`、`P['ahoge']`、`P['face']`、`P['earring']`…：各部位的多邊形
   - `EYES`：每隻眼睛的 `top`（睫毛下緣）、`bot`（下眼緣）、`iris`（瞳孔中心與半徑）、`seed`（睫毛上的一點）、`lashbox`（睫毛所在的方框）、`brow`（眉毛三個點）
   - `MOUTH_BOX`、`MOUTH_C`、`NOSE`、`BLUSH`
   - `CANVAS`：要用原圖的哪一塊當畫布
   - 程式最後 `rig = dict(...)` 裡的 `headCenter`、`headRadius`、`neck`
3. `npm run parts`，看 `build/debug/` 裡的圖檢查切得對不對（`polygons.png` 是多邊形疊在原圖上，`L_*.png` 是各部位單獨的樣子），再 `npm run build`。

## 檔案結構

```
art/              原始圖（主圖 ref-main-flag.png，另外兩張是參考）
tools/            切圖腳本（Python）、截圖腳本（Playwright）
src/assets/       切好的部位圖與 rig.json
src/              渲染器、變形器、物理、動作、對嘴、對話框、debug 面板
screenshots/      各里程碑的檢查截圖
dist/index.html   打包好的單一檔案
PLAN.md / PROGRESS.md / RIG.md
```
