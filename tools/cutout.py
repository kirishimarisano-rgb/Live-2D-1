"""Step 1: remove the trans-flag background from art/ref-main-flag.png -> build/cutout.png"""
import numpy as np, cv2, sys
from PIL import Image
src = Image.open('art/ref-main-flag.png').convert('RGB')
a = np.array(src).astype(np.int16)
H, W, _ = a.shape
flag = np.array([[91,206,250],[245,169,184],[255,255,255]])
# distance to nearest flag colour
d = np.min(np.stack([np.abs(a - c).sum(-1) for c in flag]), 0)
cand = (d < 60).astype(np.uint8)
# connected component of candidate pixels touching the left/right/top border
n, lab = cv2.connectedComponents(cand, connectivity=4)
border = set(np.unique(np.concatenate([lab[0], lab[:, 0], lab[:, -1]]))) - {0}
# background pockets enclosed by hair (seen through gaps) — picked by hand
SEEDS = [(1200, 450), (1065, 480)]
border |= {lab[y, x] for x, y in SEEDS if lab[y, x]}
# flag blue never appears on the character: every blue pocket is background
blue = (np.abs(a - flag[0]).sum(-1) < 90).astype(np.uint8)
bg = np.isin(lab, list(border)) | (cv2.dilate(blue, np.ones((3,3),np.uint8)) > 0)
# fill tiny holes inside the figure that are not bg, and close small leaks
fg = (~bg).astype(np.uint8)
fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3,3),np.uint8))
# keep biggest fg component
n, lab = cv2.connectedComponents(fg, connectivity=8)
sizes = np.bincount(lab.ravel()); sizes[0] = 0
fg = (lab == sizes.argmax()).astype(np.uint8)
# soft edge
alpha = cv2.GaussianBlur(fg.astype(np.float32), (3,3), 0.8)
rgba = np.dstack([a.astype(np.uint8), (alpha*255).astype(np.uint8)])
import os; os.makedirs('build', exist_ok=True)
Image.fromarray(rgba).save('build/cutout.png')
ys, xs = np.nonzero(fg); print('bbox', xs.min(), xs.max(), ys.min(), ys.max())
