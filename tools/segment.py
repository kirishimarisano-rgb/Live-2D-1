"""Step 2: cut build/cutout.png into rig parts.

Every coordinate below is in the pixel space of art/ref-main-flag.png.
Outputs src/assets/parts/*.png (each trimmed to its bbox) and src/assets/rig.json.
Run:  python3 tools/cutout.py && python3 tools/segment.py
"""
import json, os, math
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFilter

OUT = 'src/assets/parts'
os.makedirs(OUT, exist_ok=True)
os.makedirs('build/debug', exist_ok=True)

src = np.array(Image.open('build/cutout.png').convert('RGBA'))
H, W = src.shape[:2]
rgb0 = src[..., :3].copy()
fg = src[..., 3] > 127

# canvas the browser draws on (crop of the original + headroom at the top)
CANVAS = dict(x=400, y=-60, w=900, h=1036)

# ---------------------------------------------------------------- polygons
def poly(pts):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in pts], fill=255)
    return np.array(m) > 0

def ellipse(cx, cy, rx, ry):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
    return np.array(m) > 0

def dil(m, r):
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return cv2.dilate(m.astype(np.uint8), k) > 0

def ero(m, r):
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return cv2.erode(m.astype(np.uint8), k) > 0

def fill(img, known, target, r=6):
    """inpaint `target` using only `known` pixels as the source"""
    mask = (target | (~known & dil(target, r + 3))) & ~(known & ~target)
    return cv2.inpaint(np.ascontiguousarray(img), mask.astype(np.uint8) * 255, r, cv2.INPAINT_TELEA)

def inpaint(img, mask, r=6):
    return cv2.inpaint(np.ascontiguousarray(img), mask.astype(np.uint8) * 255, r, cv2.INPAINT_TELEA)

P = {}
# whole head (front hair + face + ear), not twin tail / long locks below the cut
P['head'] = [(540, 335), (560, 270), (600, 205), (650, 155), (700, 125), (760, 112), (830, 108),
             (900, 118), (960, 140), (1000, 168), (1012, 240), (1030, 300), (1046, 360),
             (1050, 440), (1044, 490), (1036, 560), (1026, 610), (990, 625), (945, 615), (905, 590),
             (885, 560), (872, 546), (840, 570), (795, 586), (750, 582), (700, 562), (662, 530),
             (650, 560), (630, 600), (600, 622), (560, 612), (528, 590), (518, 500), (524, 420)]
P['body'] = [(380, 1000), (380, 590), (528, 592), (560, 614), (600, 624), (632, 602), (652, 560),
             (662, 532), (700, 563), (750, 583), (795, 587), (840, 571), (872, 547), (885, 562),
             (905, 592), (945, 617), (990, 627), (1030, 612), (1040, 600), (1320, 600), (1320, 1000)]
P['tail'] = [(1002, 110), (1040, 92), (1090, 100), (1130, 135), (1155, 200), (1165, 290),
             (1212, 340), (1248, 400), (1266, 470), (1264, 560), (1246, 625), (1232, 690),
             (1240, 762), (1198, 805), (1150, 795), (1104, 772), (1074, 724), (1056, 650),
             (1046, 570), (1046, 490), (1052, 440), (1048, 360), (1032, 300), (1014, 240), (1000, 170)]
P['headdress'] = [(545, 340), (515, 300), (512, 240), (530, 175), (565, 110), (610, 55), (675, 18), (740, 5),
                  (805, 5), (860, 30), (862, 62), (800, 70), (760, 85), (720, 105), (680, 125),
                  (640, 160), (610, 200), (585, 250), (568, 300), (555, 335)]
P['ahoge'] = [(458, 262), (470, 205), (500, 160), (540, 128), (590, 108), (640, 98), (700, 97),
              (700, 104), (645, 108), (595, 120), (552, 142), (514, 178), (486, 220), (468, 262)]
P['face'] = [(615, 300), (612, 430), (628, 478), (660, 528), (700, 560), (750, 580), (795, 584),
             (840, 568), (875, 542), (905, 505), (925, 455), (935, 380), (930, 300), (870, 280),
             (760, 270), (660, 280)]
P['temple'] = [(925, 330), (1000, 350), (1048, 380), (1046, 470), (1000, 490), (920, 500)]
P['ear'] = [(998, 370), (1012, 352), (1040, 356), (1050, 390), (1047, 432), (1032, 466),
            (1006, 472), (994, 420)]
P['earring'] = [(980, 462), (1008, 458), (1030, 480), (1034, 520), (1024, 545), (1016, 580),
                (996, 582), (984, 545), (978, 500)]
P['neck_ext'] = [(762, 500), (842, 500), (848, 560), (842, 620), (765, 620), (758, 560)]

# eyes (screen-left = L).  top = lash lower edge, bottom = lower rim, both left→right
EYES = {
    'L': dict(top=[(638, 432), (650, 422), (670, 412), (690, 407), (710, 408), (721, 416)],
              bot=[(638, 432), (645, 448), (660, 460), (676, 463), (692, 461), (710, 453), (721, 440), (721, 416)],
              seed=(690, 402), iris=(696, 434, 24, 28), lashbox=(598, 386, 728, 438), brow=[(646, 392), (676, 381), (712, 384)]),
    'R': dict(top=[(803, 392), (812, 380), (840, 372), (870, 369), (892, 374), (896, 384)],
              bot=[(803, 392), (812, 408), (830, 421), (856, 424), (880, 421), (893, 410), (896, 384)],
              seed=(860, 363), iris=(860, 398, 27, 28), lashbox=(782, 346, 936, 392), brow=[(800, 356), (845, 342), (892, 344)]),
}
MOUTH_BOX = (742, 496, 832, 536)
MOUTH_C = (787, 518)
NOSE = (750, 472)
BLUSH = {'L': (688, 492, 30, 15), 'R': (853, 452, 30, 16)}

M = {k: poly(v) & np.ones_like(fg) for k, v in P.items()}

# ------------------------------------------------- inpaint small overlays first
base = rgb0.copy()
earring = M['earring'] & fg & (np.array(Image.fromarray(rgb0).convert('L')) < 200) | (M['earring'] & fg & ~poly([(990,462),(1000,462),(1000,470),(990,470)]))
earring = M['earring'] & fg
# earring alpha: only the dark ribbon / beads, not the hair around them
hsv = cv2.cvtColor(rgb0, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
Hh, S, V = hsv[..., 0] / 255.0, hsv[..., 1] / 255.0, hsv[..., 2] / 255.0
lum = np.array(Image.fromarray(rgb0).convert('L')).astype(np.float32)
ear_ring_px = M['earring'] & fg & ((lum < 150) | ((S > 0.35) & (Hh > 0.02) & (Hh < 0.12)))
ear_ring_px = dil(ear_ring_px, 1) & M['earring']
base = inpaint(base, dil(ear_ring_px, 2), 5)
ahoge_px = dil(M['ahoge'], 3) & fg & poly([(440, 60), (652, 60), (652, 300), (440, 300)])
base_no_ahoge = inpaint(base, dil(ahoge_px, 2) & M['headdress'], 5)

# ------------------------------------------------------------ classification
tail = M['tail'] & fg & ~(M['head'] & ~poly([(1036, 80), (1300, 80), (1300, 900), (1036, 900)]))
head = fg & ~M['body'] & ~tail & ~M['headdress'] & ~ahoge_px
headdress = M['headdress'] & fg & ~head & ~ahoge_px
ahoge = ahoge_px & ~head

eye_open = {s: poly(e['top'] + e['bot'][::-1]) for s, e in EYES.items()}
lash_zone = {}
for s, e in EYES.items():
    x0, y0, x1, y1 = e['lashbox']
    box = np.zeros_like(fg); box[y0:y1, x0:x1] = True
    dark = box & ~eye_open[s] & (lum < 125)
    # the lash band is thick, crossing hair strands are thin: open, keep the seed blob, grow back
    core = cv2.morphologyEx(dark.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    n, lab = cv2.connectedComponents(core, connectivity=8)
    sx, sy = e['seed']
    cy_, cx_ = np.nonzero(core)
    k = np.argmin((cx_ - sx) ** 2 + (cy_ - sy) ** 2)
    blob = dil(lab == lab[cy_[k], cx_[k]], 3) & dark
    # the lash band has a lighter inside: close it and fill the holes so it is solid
    band = cv2.morphologyEx(blob.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    ff = band.copy(); h_, w_ = ff.shape
    cv2.floodFill(ff, np.zeros((h_ + 2, w_ + 2), np.uint8), (0, 0), 1)
    holes = (ff == 0)
    lash_zone[s] = (blob | holes | (band > 0) & (lum < 200)) & box & ~eye_open[s]

mouth_m = np.zeros_like(fg); x0, y0, x1, y1 = MOUTH_BOX; mouth_m[y0:y1, x0:x1] = True
brow_m = np.zeros_like(fg)
for s, e in EYES.items():
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).line(e['brow'], fill=255, width=9, joint='curve')
    brow_m |= np.array(m) > 0

skin = (Hh > 0.012) & (Hh < 0.11) & (V > 0.80) | ((S < 0.06) & (V > 0.96))
forced_face = dil(eye_open['L'] | eye_open['R'], 3) | lash_zone['L'] | lash_zone['R'] | mouth_m \
    | ellipse(*NOSE, 5, 5) | ellipse(*BLUSH['L']) | ellipse(*BLUSH['R'])
# jaw outline belongs to the face
jaw = Image.new('L', (W, H), 0)
ImageDraw.Draw(jaw).line([(632, 486), (662, 530), (700, 560), (750, 580), (795, 584), (840, 568), (872, 545)], fill=255, width=12)
forced_face |= (np.array(jaw) > 0) & (lum < 170)
# skin shading around the eyes is pinkish: force it to face
forced_face |= poly([(640, 452), (725, 440), (728, 488), (640, 492)]) | poly([(806, 412), (900, 405), (905, 448), (812, 450)])
forced_face |= dil(lash_zone['L'] | lash_zone['R'], 3) | brow_m
forced_face |= poly([(660, 545), (900, 545), (900, 600), (660, 600)])

face_area = M['face'] & fg
face_vis = face_area & (skin | forced_face)
# clean: tiny islands of "hair" inside skin are shading, tiny islands of skin inside hair are highlights
face_vis = cv2.morphologyEx(face_vis.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)) > 0
n, lab, st, _ = cv2.connectedComponentsWithStats(face_vis.astype(np.uint8), connectivity=4)
face_vis = np.isin(lab, [i for i in range(1, n) if st[i, 4] > 400]) | forced_face & face_area
hair_in_face = face_area & ~face_vis
n, lab, st, _ = cv2.connectedComponentsWithStats(hair_in_face.astype(np.uint8), connectivity=8)
small = np.isin(lab, [i for i in range(1, n) if st[i, 4] < 60])
face_vis |= small
face_vis &= face_area

front_hair = head & ~face_vis

# ------------------------------------------------------------------ layers
layers = []

def save_layer(name, rgb, alpha, z, extra=None):
    a = np.clip(alpha, 0, 1)
    ys, xs = np.nonzero(a > 0.004)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    pad = 2
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(W, x1 + pad), min(H, y1 + pad)
    rgba = np.dstack([rgb[y0:y1, x0:x1], (a[y0:y1, x0:x1] * 255).astype(np.uint8)])
    Image.fromarray(rgba).save(f'{OUT}/{name}.png', optimize=True)
    d = dict(name=name, file=f'{name}.png', x=int(x0 - CANVAS['x']), y=int(y0 - CANVAS['y']),
             w=int(x1 - x0), h=int(y1 - y0), z=z)
    if extra: d.update(extra)
    layers.append(d)

def soft(m, r=1.0):
    return cv2.GaussianBlur(m.astype(np.float32), (0, 0), r) if r > 0 else m.astype(np.float32)

alpha_src = src[..., 3].astype(np.float32) / 255.0

# back hair: silhouette of head + headdress, filled with shadowed hair colour
back = dil(M['head'] & fg | headdress, 6) & ~dil(M['face'], -1 if False else 0)
back = dil(head | headdress, 4)
back_rgb = np.zeros_like(rgb0); back_rgb[:] = (214, 150, 166)
edge = back & ~ero(back, 3)
back_rgb[edge] = (120, 70, 82)
save_layer('back_hair', back_rgb, soft(back, 0.8), 0)

# body: everything else, plus neck under the chin and the area hidden by the tail
body = fg & ~head & ~tail & ~headdress & ~ahoge
body_ext = body | (M['neck_ext']) | (M['tail'] & dil(body, 28) & ~dil(head, 0))
body_rgb = base.copy()
body_rgb[~body] = 0
body_rgb = fill(body_rgb, body, body_ext & ~body, 9)
neck_fill = M['neck_ext'] & ~body
ny = np.clip((np.arange(H)[:, None] - 500) / 100.0, 0, 1)
neck_col = np.array([206, 150, 160]) * (1 - ny[..., None]) + np.array([236, 200, 204]) * ny[..., None]
body_rgb = np.where(neck_fill[..., None], neck_col, body_rgb).astype(np.uint8)
body_rgb = inpaint(body_rgb, dil(neck_fill, 2) & ~ero(neck_fill, 2), 4)
save_layer('body', body_rgb, soft(body_ext, 0.6) * np.where(body, alpha_src, 1), 10)

# tail
save_layer('tail', base, soft(tail, 0.5) * alpha_src, 20, dict(pivot=[1030 - CANVAS['x'], 150 - CANVAS['y']]))

# headdress (extend under the hair so the head turn never shows a hole)
hd_ext = headdress | (dil(headdress, 18) & head)
hd_rgb = base_no_ahoge.copy(); hd_rgb[~headdress] = 0
hd_rgb = fill(hd_rgb, headdress, hd_ext & ~headdress, 7)
save_layer('headdress', hd_rgb, soft(hd_ext, 0.6) * np.where(headdress, alpha_src, 1), 25)

# face: skin with eyes, lashes, mouth, brows and hair painted over with skin
face_ext = M['face'] | M['temple']
remove = face_ext & ~face_vis | dil(eye_open['L'] | eye_open['R'], 3) | dil(lash_zone['L'] | lash_zone['R'], 3) \
    | dil(mouth_m & (lum < 190), 2) | brow_m
skin_tone = np.array([252, 233, 228], np.float32)
keep = face_vis & ~remove
fr = np.where(keep[..., None], base.astype(np.float32), skin_tone)
# soften the seam between kept skin and the painted skin
blur = cv2.GaussianBlur(fr, (0, 0), 2.0)
seam = (dil(keep, 2) & ~ero(keep, 2)) | ~keep
fr = np.where((seam & ~(keep & (lum < 170)))[..., None], blur, fr)
# a soft hair shadow on the forehead, like the original
shadow_y = np.clip((np.arange(H)[:, None] - 300) / 90.0, 0, 1)
painted = ~keep & face_ext
fr = np.where(painted[..., None], fr * (0.93 + 0.07 * shadow_y[..., None]) + np.array([4, -6, -2]) * (1 - shadow_y[..., None]), fr)
face_rgb = np.clip(fr, 0, 255).astype(np.uint8)
face_alpha = soft(face_ext, 0.6) * np.where(face_vis & ~M['face'], alpha_src, 1)
save_layer('face', face_rgb, face_alpha, 30)

# eyes ---------------------------------------------------------------------
rig_eyes = {}
for s, e in EYES.items():
    op = eye_open[s]
    # eye white: painted
    wrgb = np.zeros_like(rgb0); wrgb[:] = (255, 253, 253)
    ys, xs = np.nonzero(op)
    top_y = np.interp(np.arange(W), [p[0] for p in e['top']], [p[1] for p in e['top']])
    yy = np.arange(H)[:, None] - top_y[None, :]
    shade = np.clip(1 - yy / 14.0, 0, 1)[..., None]
    wrgb = (wrgb * (1 - shade * 0.25) + np.array([238, 190, 200]) * shade * 0.25).astype(np.uint8)
    walpha = soft(dil(op, 2), 0.7)
    save_layer(f'eye{s}_white', wrgb, walpha, 40, dict(eye=s))

    # iris: original pixels inside the ellipse, hidden part filled from the iris itself
    cx, cy, rx, ry = e['iris']
    ir = ellipse(cx, cy, rx, ry)
    known = ir & op & ~(lum > 246) | (ir & op & (S > 0.08))
    irgb = rgb0.copy(); irgb[~known] = 0
    irgb = fill(irgb, known, ir & ~known, 6)
    # white pixels inside the ellipse but in the opening are eye-white, keep them iris-pink
    ia = soft(ir, 0.8)
    save_layer(f'eye{s}_iris', irgb, ia, 41, dict(eye=s, center=[cx - CANVAS['x'], cy - CANVAS['y']]))

    # lash: dark pixels of the lash band
    lz = lash_zone[s]
    la = soft(lz, 0.6)
    save_layer(f'eye{s}_lash', rgb0, la, 43, dict(eye=s))

    rig_eyes[s] = dict(top=[[x - CANVAS['x'], y - CANVAS['y']] for x, y in e['top']],
                       bot=[[x - CANVAS['x'], y - CANVAS['y']] for x, y in e['bot']],
                       iris=[cx - CANVAS['x'], cy - CANVAS['y'], rx, ry])

# brows: painted thin arcs in the line colour
LINE = (122, 64, 74)
for s, e in EYES.items():
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pts = e['brow']
    # quadratic bezier through 3 points, tapered
    seg = []
    for i in range(41):
        t = i / 40
        x = (1 - t) ** 2 * pts[0][0] + 2 * (1 - t) * t * pts[1][0] + t * t * pts[2][0]
        y = (1 - t) ** 2 * pts[0][1] + 2 * (1 - t) * t * pts[1][1] + t * t * pts[2][1]
        seg.append((x, y))
    for i in range(40):
        t = i / 40
        wdt = 1.0 + 2.6 * math.sin(math.pi * min(1, t * 1.15))
        d.line([seg[i], seg[i + 1]], fill=LINE + (255,), width=max(1, int(round(wdt))))
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    a = np.array(im)
    save_layer(f'brow{s}', a[..., :3], a[..., 3] / 255.0, 45, dict(eye=s))

# mouth closed: original line
mx0, my0, mx1, my1 = MOUTH_BOX
ma = np.zeros((H, W), np.float32)
ma[my0:my1, mx0:mx1] = np.clip((215 - lum[my0:my1, mx0:mx1]) / 110.0, 0, 1)
save_layer('mouth_closed', rgb0, ma, 50)

# mouth open: painted in the same line style
S4 = 4  # supersample
mw, mh = 120, 90
im = Image.new('RGBA', (mw * S4, mh * S4), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
cxm, cym = mw * S4 / 2, 18 * S4
# shape: soft "D" — flat-ish top, round bottom
outline = []
for i in range(61):
    t = math.pi * i / 60
    outline.append((cxm - math.cos(t) * 30 * S4, cym + math.sin(t) * 46 * S4))
top = [(cxm + 30 * S4, cym), (cxm, cym - 3 * S4), (cxm - 30 * S4, cym)]
shape = outline + top
d.polygon(shape, fill=(150, 52, 70, 255))
# tongue
d.ellipse([cxm - 20 * S4, cym + 20 * S4, cxm + 20 * S4, cym + 52 * S4], fill=(232, 120, 132, 255))
# re-clip tongue to the mouth shape
mask = Image.new('L', im.size, 0); ImageDraw.Draw(mask).polygon(shape, fill=255)
im.putalpha(Image.fromarray(np.minimum(np.array(im)[..., 3], np.array(mask))))
d = ImageDraw.Draw(im)
d.line(shape + [shape[0]], fill=LINE + (255,), width=int(3.2 * S4), joint='curve')
im = im.resize((mw, mh), Image.LANCZOS)
mo = np.zeros((H, W, 4), np.uint8)
ox, oy = MOUTH_C[0] - mw // 2, MOUTH_C[1] - 18
mo[oy:oy + mh, ox:ox + mw] = np.array(im)
save_layer('mouth_open', mo[..., :3], mo[..., 3] / 255.0, 51, dict(anchor=[MOUTH_C[0] - CANVAS['x'], MOUTH_C[1] - 2 - CANVAS['y']]))

# blush overlay (for shy / puffed cheeks): soft ellipse + hatch strokes
im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
for s, (bx, by, brx, bry) in BLUSH.items():
    g = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse([bx - brx, by - bry, bx + brx, by + bry], fill=(244, 140, 156, 120))
    g = g.filter(ImageFilter.GaussianBlur(7))
    im = Image.alpha_composite(im, g)
    d = ImageDraw.Draw(im)
    for k in range(-2, 3):
        x = bx + k * 10
        d.line([(x + 4, by - 8), (x - 3, by + 8)], fill=(226, 92, 112, 200), width=2)
a = np.array(im)
save_layer('blush', a[..., :3], a[..., 3] / 255.0, 52)

# front hair (+ cheek-puff and everything else of the head)
fh_alpha = soft(front_hair, 0.5) * alpha_src
save_layer('front_hair', base, fh_alpha, 60)
save_layer('ahoge', rgb0, soft(ahoge, 0.5) * alpha_src, 65, dict(pivot=[700 - CANVAS['x'], 104 - CANVAS['y']]))
er_a = soft(ear_ring_px, 0.5) * alpha_src
save_layer('earring', rgb0, er_a, 70, dict(pivot=[1000 - CANVAS['x'], 462 - CANVAS['y']]))

def cv(p): return [p[0] - CANVAS['x'], p[1] - CANVAS['y']]
rig = dict(
    canvas=CANVAS,
    source='art/ref-main-flag.png',
    headCenter=cv((790, 380)), headRadius=240, neck=cv((800, 600)),
    bodyPivot=cv((800, 976)), mouth=cv(MOUTH_C),
    blush={s: cv(b[:2]) for s, b in BLUSH.items()},
    eyes=rig_eyes,
    layers=sorted(layers, key=lambda l: l['z']),
)
json.dump(rig, open('src/assets/rig.json', 'w'), indent=1)

# debug overlay ----------------------------------------------------------
dbg = Image.fromarray(np.dstack([rgb0, (fg * 255).astype(np.uint8)])).convert('RGBA')
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
cols = dict(head=(255, 0, 0), tail=(0, 160, 255), headdress=(160, 0, 255), ahoge=(255, 140, 0),
            face=(0, 200, 0), temple=(0, 120, 0), ear=(0, 255, 120), earring=(255, 0, 200), neck_ext=(0, 0, 0))
for k, pts in P.items():
    d.line(pts + [pts[0]], fill=cols.get(k, (0, 0, 0)) + (255,), width=2)
for s, e in EYES.items():
    d.line(e['top'], fill=(0, 0, 255, 255), width=1)
    d.line(e['bot'], fill=(0, 255, 255, 255), width=1)
    cx, cy, rx, ry = e['iris']; d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], outline=(255, 255, 0, 255))
dbg = Image.alpha_composite(dbg, ov)
dbg.crop((400, 0, 1300, 976)).save('build/debug/polygons.png')
fh = np.zeros((H, W, 3), np.uint8); fh[:] = (40, 160, 60)
fh[front_hair] = rgb0[front_hair]
Image.fromarray(fh).crop((400, 0, 1300, 976)).save('build/debug/front_hair.png')
print('layers', [l['name'] for l in rig['layers']])
cls = np.zeros((H, W, 3), np.uint8); cls[:] = (40, 160, 60)
cls[face_area] = (255, 0, 255)
cls[face_vis] = rgb0[face_vis]
Image.fromarray(cls).crop((590, 270, 960, 600)).resize((740, 660), Image.NEAREST).save('build/debug/face_cls.png')
def show(name, crop, sc=2):
    l = next(l for l in layers if l['name'] == name)
    im = Image.open(f"{OUT}/{l['file']}")
    can = Image.new('RGBA', (CANVAS['w'], CANVAS['h']), (40, 160, 60, 255))
    can.alpha_composite(im, (l['x'], l['y']))
    x0, y0, x1, y1 = [c - o for c, o in zip(crop, (CANVAS['x'], CANVAS['y'], CANVAS['x'], CANVAS['y']))]
    can.crop((x0, y0, x1, y1)).resize(((x1 - x0) * sc, (y1 - y0) * sc)).save(f'build/debug/L_{name}.png')
show('ahoge', (440, 60, 720, 280))
show('face', (590, 270, 1060, 620))
show('body', (400, 300, 1300, 976), 1)
show('headdress', (500, 0, 880, 360))
show('eyeL_iris', (660, 400, 730, 470), 4)
show('eyeR_iris', (825, 365, 895, 435), 4)
show('front_hair', (400, 0, 1300, 976), 1)
show('tail', (980, 80, 1280, 820), 1)
show('eyeL_lash', (595, 380, 730, 450), 3)
show('eyeR_lash', (780, 340, 940, 400), 3)
