# 網頁看板娘

用平面的二次元角色圖做出像 Live2D 那樣會動的看板娘，現在有兩個人：右下角的粉紅雙馬尾**瑞希**，和從左下角探頭的藍色垂耳女僕**大肥魚**。沒有用 Live2D SDK 或任何角色動畫函式庫，網格變形、物理、眨眼、對嘴全部是自己用 TypeScript + WebGL 寫的。

> 圖是別人畫的，自己玩沒問題，但**不要公開發布**（這個 repo 請保持私人）。

## 直接玩

雙擊 **`dist/index.html`** 就能打開（單一檔案，圖片都內嵌在裡面，不用架伺服器）。

- 兩個人的眼睛和頭都會跟著滑鼠轉（眼睛比頭快，大肥魚慢半拍）
- 戳**頭**：害羞瞇眼、臉紅（大肥魚的垂耳會抖一下）
- 戳**臉頰**：鼓起來
- 戳其中一個，另一個會轉頭看她，有時候還會吐槽一句
- 滑鼠**不動 15 秒**：開始打瞌睡（大肥魚比較愛睏，大約 10 秒就睡了），再戳一下或動滑鼠就會驚醒
- 按「🎤 對嘴」：允許麥克風後，兩個人的嘴巴都會跟著你的聲音動
- 兩個人會隨機說話，偶爾會互相聊起來（主角是右下角的對話框，大肥魚是原圖那種想法泡泡）
- 網址後面加 `?debug=1`（例如 `dist/index.html?debug=1`）：顯示網格線和所有參數滑桿
- 背景的窗外會跟著你電腦現在的時間變成白天、黃昏或晚上；想固定的話加 `?hour=20`（0～24，可以和 debug 一起用：`?debug=1&hour=18`）

- 下面的聊天框：在「⚙ 設定」接上 AI 之後，可以打字跟瑞希、大肥魚或兩個人一起聊天（見下面「接上 AI 聊天」）

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
npm run parts    # 兩個角色都重切：tools/pink2_segment.py（主角）、maid2_align.py + maid_cutout.py + maid_segment.py（女僕）
python3 tools/rig_sheet.py pink   # 重新產生 RIG.md 用的圖（maid 也可以）
python3 tools/compose.py maid out.png front_hair   # 把部位疊回去看看（第三個參數是要藏起來的部位）
```

截圖檢查需要 Playwright（`npm i -D playwright && npx playwright install chromium`）：

```bash
npm run build && node tools/shots.mjs m7        # 兩個角色的全部姿勢存到 screenshots/m7-pink-*.png、m7-maid-*.png
node tools/shots.mjs test eyes-closed corner     # 只拍某幾個
node tools/zoom.mjs out.png 140,380,440,560 '[{},{"eyeLOpen":0}]' maid   # 近拍某一塊的幾個姿勢
```

## 改台詞

台詞在 **`src/lines.json`**，改完 `npm run build` 就好。

不想重新打包的話，也可以直接用文字編輯器打開 `dist/index.html`，最上面有一段 `<script type="application/json" id="lines-data">`，裡面就是同一份台詞，直接改那裡也有效。

`"pink"` 是主角的台詞、`"maid"` 是大肥魚的台詞，兩邊的欄位一樣：

| 欄位 | 什麼時候說 |
|---|---|
| `greeting` | 剛打開 |
| `idle` | 沒事的時候隨機說 |
| `head` / `cheek` / `body` | 被戳頭、臉頰、身體 |
| `sleep` / `wake` | 打瞌睡中、被叫醒 |
| `otherPoked` | 另一個人被戳的時候（不一定每次都說） |
| `micOn` / `micOff` / `micError` | 開關麥克風、麥克風不能用 |

`"duo"` 是兩個人的對話，每一段是一串 `["誰", "台詞"]`，會照順序一句一句講，例如：

```json
[["maid", "……要喝茶嗎？"], ["pink", "好啊！要加很多糖喔～"], ["maid", "……好。"]]
```

`"settings"`：

| 欄位 | 意思 |
|---|---|
| `sleepAfterSeconds` | 滑鼠多久不動就打瞌睡（秒；大肥魚是這個的 0.7 倍） |
| `idleLineEverySeconds` | 隨機說話的間隔 `[最短, 最長]`（秒） |
| `duoChance` | 該說話的時候，改成兩個人聊天的機率（0～1） |
| `showSeconds` | 對話框停留多久（秒，長句會自動加長） |

## 調參數

1. 打開 `?debug=1`，左邊有所有參數的滑桿，最上面可以選要控制哪個角色（面板擋到大肥魚的話按「收合」）。拉任何一個就會切到「手動」模式（停止自動動作，但頭髮物理還是會動），勾掉「手動」就恢復自動。
2. 找到喜歡的數值後，改程式裡對應的地方。每個角色自己的設定都在 **`src/chars/<角色>/index.ts`**（`pink` 是主角、`maid` 是女僕）：

| 想改的 | 檔案 | 位置 |
|---|---|---|
| 參數範圍、預設值 | `src/params.ts` | `PARAMS` |
| 各部位轉頭時的立體感（視差） | `src/chars/<角色>/index.ts` | `conf.parts` 的 `depth`：越大越靠前、動越多；負數會往反方向動 |
| 頭髮擺動的範圍、呆毛／垂耳長度、歪頭角度、嘴巴寬度 | `src/chars/<角色>/index.ts` | `conf.tune` |
| 轉頭幅度、眼睛和頭追滑鼠的速度、眨眼頻率、多容易睡著 | `src/chars/<角色>/index.ts` | `persona`（沒寫的用 `src/motion.ts` 的 `DEFAULT_PERSONA`）：`headTau`／`eyeTau` 是追上視線要幾秒（越小越快）、`angle` 是最大角度、`blink` 是眨眼間隔、`doubleBlink` 是連眨機率、`sleepFactor` 越小越容易睡 |
| 呼吸、晃動 | `src/motion.ts` | 「呼吸與晃動」那段 |
| 害羞、鼓臉、驚醒的表情 | `src/motion.ts` | 「反應」那段，每種反應各自設定要改哪些參數 |
| 頭髮、馬尾、呆毛、耳環、垂耳的晃法 | `src/physics.ts` | `HairPhysics.parts`：`stiff` 越大越硬、`damping` 越大越快停、`inertia` 越大越容易被甩 |
| 網格密度 | `src/chars/<角色>/index.ts` | `conf.parts` 的 `cell`（px，越小越細） |
| 兩個人的位置和大小 | `index.html` | `#stage-pink`、`#stage-maid` 的 `height` |
| 戳了之後另一個人的反應、聊天的節奏 | `src/main.ts` | 「兩個人之間」那段和主迴圈裡的「對話」 |
| 呆毛、馬尾的待機晃動 | `src/physics.ts` | `update()` 裡 `this.ahoge.step(...)`、`this.tail.step(...)` 的正弦波大小；`breeze = 0` 就完全不晃 |
| 背景（窗戶、天空顏色、花瓣、串燈） | `src/background.ts` | `SKY` 是每個時刻的天空顏色；花瓣數量在建構子的 `26` |
| 麥克風靈敏度 | `src/lipsync.ts` | `(rms - ...) * 9` 的 `9` |

## 換成別的角色圖、再加一個角色

每個角色是 `src/chars/<角色>/` 一個資料夾：`parts/*.png`（部位圖）、`rig.json`（位置、層級、樞紐）、`index.ts`（深度、擺動範圍、個性）。要再加一個角色：

1. 照下面 A 或 B 做出 `parts/` 和 `rig.json`
2. 複製 `src/chars/maid/index.ts` 改名字和數值
3. 在 `src/main.ts` 的 `defs` 加上它，`index.html` 加一個 `<div class="stage" id="stage-<角色>"><canvas></canvas></div>` 和對話框 `<div id="bubble-<角色>">`，CSS 設定它的位置
4. `src/lines.json` 加一段 `"<角色>": { ... }` 台詞

大肥魚的原圖右邊和下面被切掉，所以 `tools/maid_segment.py` 把切到的兩邊往外多補一圈（`PAD_R`、`PAD_B`），再整張左右翻轉（`FLIP`），讓她從畫面左下角探頭：補出來的那一圈放在畫面外，轉頭、歪頭時才不會露出切口。不想翻轉的話把 `FLIP = False`，再把 `index.html` 裡她的位置改到右邊。

### 做法 A：自己準備分好的圖層（效果最好）

1. 每個部位一張 PNG，**和整張圖同樣大小、對齊**，被遮住的地方也要畫出來（例如瀏海底下的額頭、睫毛底下的眼白）。檔名照這張表：

   `back_hair` 後髮 · `body` 身體（含脖子）· `tail` 馬尾（沒有就省略）· `headdress` 頭飾 · `face` 臉（不含眼睛和嘴）· `eyeL_white` `eyeR_white` 眼白 · `eyeL_iris` `eyeR_iris` 瞳孔（畫成完整的圓）· `eyeL_lash` `eyeR_lash` 上眼皮含睫毛 · `eyeL_closed` `eyeR_closed` 閉眼的線 · `eyeL_smile` `eyeR_smile` 笑眼（^ ^）的線 · `browL` `browR` 眉毛 · `mouth_closed` `mouth_open` 閉嘴和張嘴 · `blush` 臉紅 · `front_hair` 瀏海與側髮 · `ahoge` 呆毛 · `earring` 飾品

   （`L` 是畫面左邊那一隻）

2. 寫一個小腳本把它們裁到最小外框、放進 `src/chars/<角色>/parts/`，並更新 `src/chars/<角色>/rig.json`：每個部位的 `x, y, w, h`（在畫布上的位置）、`z`（層級）、馬尾／呆毛／耳環的 `pivot`（樞紐）、瞳孔的 `center`、張嘴的 `anchor`。可以直接參考 `tools/segment.py` 最後面 `save_layer()` 的寫法。
3. `rig.json` 裡還要改：`headCenter`、`headRadius`（頭部中心和半徑）、`neck`（脖子）、`bodyPivot`（身體底部中心）、`mouth`、`blush`（兩頰中心）、`eyes.L/R.top`（睫毛下緣的點，左到右）、`eyes.L/R.bot`（下眼緣的點，左到右，最後回到右上角）、`eyes.L/R.iris`（瞳孔中心 x, y 和半徑）。
4. 部位名稱不一樣或沒有某個部位，就到 `src/chars/<角色>/index.ts` 的 `conf.parts` 和 `src/model.ts` 的 `deform()` 裡增減（沒有的部位直接不放就好，例如女僕沒有側馬尾、耳環和閉嘴的圖）。
5. `npm run build`，用 `?debug=1` 看網格和拉參數檢查。

### 做法 B：只有一張平面圖

1. 圖放進 `art/`，改 `tools/cutout.py` 讀的檔名。背景如果不是純色條紋，就要改去背的方法（白底的圖可以參考 `tools/maid_cutout.py`，或先自己去背成透明 PNG，跳過這一步直接存成 `build/cutout.png`）。
2. 打開 `tools/segment.py`（白底、Q 版的圖參考 `tools/maid_segment.py`），最上面的座標全部是原圖的像素座標，照新圖重新量：
   - `P['body']`（脖子以下）、`P['tail']`、`P['headdress']`、`P['ahoge']`、`P['face']`、`P['earring']`…：各部位的多邊形
   - `EYES`：每隻眼睛的 `top`（睫毛下緣）、`bot`（下眼緣）、`iris`（瞳孔中心與半徑）、`seed`（睫毛上的一點）、`lashbox`（睫毛所在的方框）、`brow`（眉毛三個點）
   - `MOUTH_BOX`、`MOUTH_C`、`NOSE`、`BLUSH`
   - `CANVAS`：要用原圖的哪一塊當畫布
   - 程式最後 `rig = dict(...)` 裡的 `headCenter`、`headRadius`、`neck`
3. `npm run parts`，看 `build/debug/` 裡的圖檢查切得對不對（`polygons.png` 是多邊形疊在原圖上，`L_*.png` 是各部位單獨的樣子），再 `npm run build`。

## 接上 AI 聊天

打開「⚙ 設定」→「AI 聊天」，選一個 AI、按「測試連線」，成功就按「儲存」。之後在畫面下方的聊天框打字，左邊可以選跟瑞希、大肥魚還是兩個人說話。AI 回話時會順便帶心情，她們會跟著害羞、鼓臉或開心地晃一下。

| 選項 | 要填的 | 說明 |
|---|---|---|
| Ollama（本機） | 模型名稱，例如 `qwen2.5:7b` | 免費、不用網路。先 `ollama pull qwen2.5:7b`。**要允許網頁連線**：關掉 Ollama，用 `OLLAMA_ORIGINS=* ollama serve` 重開（Windows：系統環境變數加 `OLLAMA_ORIGINS` = `*`，再重開 Ollama） |
| LM Studio（本機） | 模型名稱（載入的那個） | 在 Developer／Local Server 頁面開伺服器，並打開 **Enable CORS** |
| OpenAI／OpenRouter／Claude | API 金鑰 | 要付費或額度。金鑰只存在這個瀏覽器，只會直接送到你選的 AI |
| 其他（OpenAI 相容） | 網址、模型 | llama.cpp server、vLLM、Jan 等只要有 `/v1/chat/completions` 都能用 |

- 中文聊天建議至少 7B 的模型（qwen2.5 系列中文很好）；太小的模型可能不照格式回答，不過還是會顯示
- 聊天紀錄只保留最近 12 句、不會存檔；重新整理就忘了
- 給朋友的檔案裡不會有你的設定和金鑰（都存在你自己的瀏覽器）；不要在別人的電腦上存金鑰
- 角色個性寫在 `src/ai.ts` 的 `PERSONA`，想改說話方式改那裡

## 檔案結構

```
art/                原始圖（主角 pink2/expression_01..12.png，舊版 ref-main-flag.png；大肥魚 ref-maid.jpg、新的表情組 maid2/）
tools/              切圖腳本（Python）、截圖腳本（Playwright）
src/chars/pink/     主角：切好的部位圖、rig.json、設定 index.ts
src/chars/maid/     大肥魚：同上
src/character.ts    一個角色（畫布、網格、物理、動作、對話框）
src/ai.ts           AI 聊天：各家 AI 的連線設定、角色個性、解析回話
src/main.ts         放兩個角色、滑鼠、麥克風、兩個人之間的互動
src/                渲染器、變形器、物理、動作、對嘴、對話框、背景、debug 面板
screenshots/        各里程碑的檢查截圖
dist/index.html     打包好的單一檔案
PLAN.md / PROGRESS.md / RIG.md
```

## 給朋友玩

整個看板娘就是 `dist/index.html` 這一個檔案，私下傳給朋友（聊天軟體直接傳檔案），朋友用電腦或手機的瀏覽器打開就能玩，不用安裝。
名字和自訂背景是存在各自的瀏覽器裡，每個人設定自己的，互不影響。
角色圖不是自己畫的，所以只私下給朋友玩，不要放到公開網站或社群上。
