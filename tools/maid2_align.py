"""Maid, new set: line up art/maid2/expression_01..12.png (generated, 1254×1254, white background)
with the old art/ref-maid.jpg frame (988×988), so all the measurements in maid_segment.py still fit.
Writes build/maid2/expression_XX.png.  Run:  python3 tools/maid2_align.py
"""
import os
import cv2, numpy as np
from PIL import Image

os.makedirs('build/maid2', exist_ok=True)
ref = cv2.cvtColor(np.array(Image.open('art/ref-maid.jpg').convert('RGB')), cv2.COLOR_RGB2GRAY)
sift = cv2.SIFT_create(6000)
kr, dr = sift.detectAndCompute(ref, None)


def match(img, kd):
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    k, d = sift.detectAndCompute(g, None)
    m = cv2.BFMatcher().knnMatch(d, kd[1], k=2)
    good = [x for x, y in m if x.distance < 0.75 * y.distance]
    p = np.float32([k[x.queryIdx].pt for x in good])
    q = np.float32([kd[0][x.trainIdx].pt for x in good])
    M, _ = cv2.estimateAffinePartial2D(p, q, ransacReprojThreshold=3)
    return M


base = np.array(Image.open('art/maid2/expression_01.png').convert('RGB'))
M = match(base, (kr, dr))
# the other expressions are lined up against expression_01 (same drawing, so this is exact)
kb, db = sift.detectAndCompute(cv2.cvtColor(base, cv2.COLOR_RGB2GRAY), None)
for i in range(1, 13):
    img = np.array(Image.open(f'art/maid2/expression_{i:02d}.png').convert('RGB'))
    Mi = np.eye(3)
    if i > 1:
        Mi[:2] = match(img, (kb, db))
    T = np.vstack([M, [0, 0, 1]]) @ Mi
    w = cv2.warpAffine(img, T[:2], (988, 988), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)
    Image.fromarray(w).save(f'build/maid2/expression_{i:02d}.png')
print('scale', np.hypot(M[0, 0], M[1, 0]))
