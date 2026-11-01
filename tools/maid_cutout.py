"""Maid step 1: remove the white background (and the thought bubble) -> build/maid/cutout.png

Source: build/maid2/expression_01.png (the generated set, lined up by tools/maid2_align.py) when it
exists, otherwise the original art/ref-maid.jpg.

The art has thick dark outlines on pure white, so: flood the near-white area from the borders,
keep the biggest remaining component (the girl; the thought bubble is separate), and turn the
anti-aliased rim into alpha by un-blending the outline colour from white.
"""
import numpy as np, cv2, os
from PIL import Image
SRC = 'build/maid2/expression_01.png' if os.path.exists('build/maid2/expression_01.png') else 'art/ref-maid.jpg'
a = np.array(Image.open(SRC).convert('RGB')).astype(np.float32)
H, W, _ = a.shape
mn = a.min(-1)
white = (mn > 228).astype(np.uint8)
n, lab = cv2.connectedComponents(white, connectivity=4)
border = set(np.unique(np.concatenate([lab[0], lab[:, 0]]))) - {0}
bg = np.isin(lab, list(border))
fg = (~bg).astype(np.uint8)
n, lab = cv2.connectedComponents(fg, connectivity=8)
sizes = np.bincount(lab.ravel()); sizes[0] = 0
fg = lab == sizes.argmax()
# fill holes (white pockets inside the girl are part of her: collar, headdress)
ff = fg.astype(np.uint8).copy()
cv2.floodFill(ff, np.zeros((H + 2, W + 2), np.uint8), (0, 0), 1)
fg = fg | (ff == 0)
# rim: un-blend the outline navy from the white background
OUT = np.array([34, 48, 92], np.float32)
rim = fg & ~(cv2.erode(fg.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0)
rim = cv2.dilate(rim.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
lum = a.mean(-1)
alpha = fg.astype(np.float32)
ua = np.clip((255 - lum) / (255 - OUT.mean()), 0, 1)
alpha = np.where(rim, np.maximum(ua, 0) * (fg | rim), alpha)
alpha = np.where(bg & ~rim, 0, alpha)
rgb = np.where((rim & (alpha < 0.98))[..., None], OUT, a)
os.makedirs('build/maid', exist_ok=True)
Image.fromarray(np.dstack([rgb.astype(np.uint8), (alpha * 255).astype(np.uint8)])).save('build/maid/cutout.png')
ys, xs = np.nonzero(fg); print('bbox', xs.min(), xs.max(), ys.min(), ys.max())
