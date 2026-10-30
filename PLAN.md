# 開發計畫（PLAN）

目標：用 `art/` 裡的平面圖做一個像 Live2D 那樣會動的網頁看板娘。不使用 Live2D SDK 或任何角色動畫函式庫，自己用 TypeScript + WebGL 實作網格變形，最後打包成一個可以雙擊打開的 HTML（圖片內嵌）。

## 素材判斷
- `art/ref-main-flag.png`：最乾淨、最接近正面、解析度最高 → **主要綁定來源**（背景是跨性別旗，要先去背）
- `art/ref-alt-lick.jpg`、`art/ref-alt-punk.jpg`：同一個角色的其他服裝／表情 → 只當配色與表情參考（眼睛閉起來、張嘴的畫法）
- 只有平面圖，所以部位要自己切、被遮住的地方要自己補，閉眼和張嘴要自己畫

## 里程碑
| # | 內容 | 驗收 |
|---|------|------|
| M0 | 專案骨架、PLAN.md、PROGRESS.md、素材放進 art/ | `npm run build` 能跑 |
| M1 | 去背 + 切圖（`tools/cutout.py`、`tools/segment.py`），補出被遮住的部分，畫出閉眼／張嘴需要的零件；寫 RIG.md | 每個部位單獨輸出成 PNG，RIG.md 有範圍、樞紐點、層級與截圖 |
| M2 | WebGL 網格渲染器 + 參數系統 + 變形器（頭部三軸、身體、呼吸、眼睛開合、瞳孔、眉毛、嘴巴、鼓臉、頭髮擺動）+ `?debug=1`（網格線、參數滑桿） | Playwright 截圖：不同參數組合沒有破圖、空白、眼皮蓋不住 |
| M3 | 讓她活起來：呼吸、隨機眨眼（偶爾連眨）、身體晃動、視線跟隨（眼睛比頭快）、彈簧物理（頭髮、側馬尾、呆毛、耳環） | 截圖 + 物理在戳完後會慢慢停下 |
| M4 | 互動：戳頭害羞、戳臉頰鼓臉、太久不動打瞌睡、麥克風對嘴、右下角對話框（台詞在 `src/lines.json`） | 截圖：害羞、鼓臉、打瞌睡、張嘴 |
| M5 | 打包成單一 HTML、README.md（繁中：換圖、改台詞、調參數）、最後一輪截圖檢查 | `dist/index.html` 雙擊可開 |
| M6 | 第二輪優化：閉眼、呆毛、頭髮切割、背景 | 截圖 |
| M7 | 第二個角色（`art/ref-maid.jpg`，藍色垂耳女僕）：切圖、綁定、程式改成多角色、兩個人的互動與台詞 | 截圖：兩個角色的各種姿勢、互動、聊天、手機寬度 |

## 架構
- `tools/`：Python 切圖腳本（去背、分部位、補圖、畫閉眼和張嘴零件）→ `src/chars/<角色>/parts/*.png` + `src/chars/<角色>/rig.json`
- `src/gl.ts`：WebGL 渲染（每個部位一個三角網格、預乘 alpha、用 stencil 把瞳孔裁在眼白裡）
- `src/mesh.ts`：依圖片 alpha 自動建三角網格
- `src/model.ts`：參數表 + 變形器（像 Live2D 的 warp/rotation deformer）
- `src/physics.ts`：彈簧擺
- `src/motion.ts`：待機、眨眼、視線、互動、打瞌睡
- `src/lipsync.ts`：麥克風對嘴
- `src/bubble.ts`：對話框
- `src/debug.ts`：`?debug=1` 網格線與滑桿
- `tools/shots.mjs`：Playwright 截圖到 `screenshots/`
