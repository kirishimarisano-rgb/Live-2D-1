"""Pink girl, version 2: rig parts from the generated expression set in art/pink2/.

art/pink2/expression_01.png .. _12.png are the same 1254×1254 picture on a green screen
with only the face changed (01 = neutral, 02/03/06 = looking aside, 07 = ^ ^ smile,
08 = open smile, 10 = eyes closed, 11 = "ah" mouth ...).  Because they line up, eyes and
mouths are taken straight from the drawings instead of being painted by hand.

Optional extra pictures (same canvas, from the same base) make the hair cut exact:
  art/pink2/no_bangs.png    the face with all bangs removed
  art/pink2/hair_front.png  only the bangs + the locks in front of the shoulders
  art/pink2/hair_back.png   only the back hair
Without them the hair is cut with the polygons below.

Outputs src/chars/pink/parts/*.png and src/chars/pink/rig.json.
Run:  python3 tools/pink2_segment.py
"""
import json, os, math
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFilter

ART = 'art/pink2'
OUT = 'src/chars/pink/parts'
DBG = 'build/pink2'
os.makedirs(OUT, exist_ok=True)
os.makedirs(DBG, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

PAD_B = 40  # the picture is cut at the waist: repeat the bottom rows so breathing never shows the cut


def key(path):
    """green screen -> (rgb, alpha)"""
    a = np.array(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    gx = g - np.maximum(r, b)
    alpha = np.clip(1 - (gx - 15) / (120 - 15), 0, 1)
    a[..., 1] = np.where(gx > 0, np.minimum(g, np.maximum(r, b)), g)   # remove green spill
    rgb = np.pad(a.astype(np.uint8), ((0, PAD_B), (0, 0), (0, 0)), mode='edge')
    al = np.pad(alpha, ((0, PAD_B), (0, 0)), mode='edge')
    return rgb, al


def expr(i):
    return key(f'{ART}/expression_{i:02d}.png')


rgb0, alpha_src = expr(1)
H, W = rgb0.shape[:2]
fg = alpha_src > 0.5
EX = {i: expr(i)[0] for i in range(1, 13)}
lum = rgb0.astype(np.float32).mean(-1)
hsv = cv2.cvtColor(rgb0, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
S = hsv[..., 1] / 255.0
dark = lum < 150
CANVAS = dict(x=180, y=50, w=890, h=H - 50)


def has(name):
    return os.path.exists(f'{ART}/{name}.png')


# ---------------------------------------------------------------- helpers
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

def soft(m, r=1.0):
    return cv2.GaussianBlur(m.astype(np.float32), (0, 0), r) if r > 0 else m.astype(np.float32)

def biggest(m, min_size):
    n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
    return np.isin(lab, [i for i in range(1, n) if st[i, 4] >= min_size])

def fill(img, known, target, r=6):
    ys, xs = np.nonzero(target)
    if not len(xs):
        return img
    pad = 40
    x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad + 1)
    y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad + 1)
    sub = np.ascontiguousarray(img[y0:y1, x0:x1])
    kn = known[y0:y1, x0:x1] & ~target[y0:y1, x0:x1]
    if not kn.any():
        return img
    res = cv2.inpaint(sub, (~kn).astype(np.uint8) * 255, r, cv2.INPAINT_TELEA)
    out = img.copy()
    t = target[y0:y1, x0:x1]
    out[y0:y1, x0:x1][t] = res[t]
    return out

def interp_line(pts):
    return np.interp(np.arange(W), [p[0] for p in pts], [p[1] for p in pts])

# ---------------------------------------------------------------- measurements (pixels of expression_01)
EYES = {
    # opening = top (lower edge of the lash) + bot (lower lid); iris = (cx, cy, rx, ry)
    'L': dict(top=[(463, 468), (470, 457), (480, 452), (500, 449), (520, 450), (537, 455), (548, 465)],
              bot=[(463, 468), (470, 482), (480, 490), (500, 496), (520, 491), (540, 478), (548, 465), (548, 465)],
              iris=(512, 473, 26, 25), move=(12, 4)),
    'R': dict(top=[(641, 432), (645, 420), (660, 412), (680, 411), (700, 414), (708, 420), (713, 433)],
              bot=[(641, 432), (650, 455), (670, 461), (690, 460), (700, 457), (708, 450), (713, 433), (713, 433)],
              iris=(675, 436, 25, 27), move=(11, 4)),
}
MOUTH_BOX = (560, 528, 668, 590)
MOUTH_C = (612, 547)
BLUSH = {'L': (505, 520, 34, 16), 'R': (672, 482, 34, 16)}
HEAD_C, HEAD_R, NECK = (595, 420), 255, (600, 625)

P = {}
P['ahoge'] = [(286, 318), (292, 270), (310, 232), (345, 196), (390, 170), (430, 156), (436, 172), (398, 186),
              (360, 210), (330, 242), (310, 280), (300, 318)]
P['headdress'] = [(358, 372), (352, 330), (353, 290), (362, 255), (378, 222), (398, 188), (428, 150), (462, 112),
                  (500, 92), (545, 82), (590, 82), (630, 88), (660, 104), (668, 128), (640, 134), (600, 136),
                  (560, 142), (520, 152), (490, 166), (460, 182), (436, 200), (414, 222), (398, 248), (384, 275),
                  (374, 305), (366, 340), (363, 372)]
P['tail'] = [(790, 200), (815, 165), (860, 162), (900, 190), (925, 250), (935, 330), (950, 420), (990, 470),
             (1020, 530), (1035, 620), (1040, 720), (1030, 800), (1000, 840), (960, 830), (930, 760), (900, 680),
             (870, 600), (850, 520), (835, 430), (820, 340), (805, 270)]
P['earring'] = [(784, 490), (822, 488), (842, 515), (842, 560), (832, 614), (778, 614), (774, 560)]
P['ear'] = [(800, 400), (822, 398), (836, 420), (836, 456), (822, 476), (802, 474)]
# visible skin of the face (below / between the bangs); refined by no_bangs.png when present
P['face'] = [(452, 440), (470, 420), (520, 405), (600, 380), (700, 370), (740, 390), (745, 450), (735, 500),
             (712, 540), (690, 570), (660, 592), (620, 606), (580, 605), (540, 595), (505, 575), (480, 545),
             (462, 500)]
P['neck'] = [(545, 560), (655, 560), (670, 680), (530, 680)]
P['body'] = [(0, 620), (W, 620), (W, H), (0, H)]

M = {k: poly(v) for k, v in P.items()}

hue = hsv[..., 0] / 255.0
ys_, xs_ = np.mgrid[0:H, 0:W]


def opening(e):
    return poly(e['top'] + e['bot'][-2::-1])


def fill_holes(m):
    inv = (~m).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    border = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    return m | (np.isin(lab, [i for i in range(1, n) if i not in border]))


def unblend(pix, bg, a):
    """colour that gives `pix` when drawn with alpha `a` over `bg`"""
    a3 = np.maximum(a, 1e-3)[..., None]
    return np.clip((pix.astype(np.float32) - (1 - a3) * bg.astype(np.float32)) / a3, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------- simple parts
ahoge = M['ahoge'] & fg
tail = M['tail'] & fg & ~ahoge
earring = M['earring'] & fg & ((lum < 160) | (S > 0.38))
earring = biggest(cv2.morphologyEx(earring.astype(np.uint8), cv2.MORPH_CLOSE,
                                   cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))) > 0, 150)
earring = dil(earring, 1) & fg & M['earring']
ear = M['ear'] & fg & ~earring
hd = M['headdress'] & fg & ~ahoge

# ---------------------------------------------------------------- eyes: opening, lash, lower lid
OPEN, LASH, LOWER, EYEZONE = {}, {}, {}, {}
dark01 = lum < 140
for s, e in EYES.items():
    op = opening(e)
    top = interp_line(e['top']); bot = interp_line(e['bot'][:-1])
    x0, x1 = e['top'][0][0], e['top'][-1][0]
    band = (ys_ > top[None, :] - 26) & (ys_ < top[None, :] + 3) & (xs_ > x0 - 32) & (xs_ < x1 + 26)
    cand = band & dark01 & ~ero(op, 2)
    n, lab, st, _ = cv2.connectedComponentsWithStats(cand.astype(np.uint8), connectivity=8)
    near = dil(op, 3)
    keep = [i for i in range(1, n) if st[i, 4] > 25 and (near & (lab == i)).any()]
    lash = np.isin(lab, keep)
    lash = fill_holes(cv2.morphologyEx(lash.astype(np.uint8), cv2.MORPH_CLOSE,
                                       cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))) > 0)
    lash = (dil(lash, 1) & (lum < 205)) | lash
    lash &= ~ero(op, 2)
    low = (ys_ > bot[None, :] - 3) & (ys_ < bot[None, :] + 6) & (xs_ > x0 + 2) & (xs_ < x1 - 2) & (lum < 175) & ~ero(op, 1)
    low = dil(low, 1) & (lum < 215) & ~lash & (ys_ > bot[None, :] - 4)
    OPEN[s], LASH[s], LOWER[s] = op, lash, low
    EYEZONE[s] = dil(op, 2) | dil(lash, 2) | dil(low, 2)
eyes_all = EYEZONE['L'] | EYEZONE['R']

# ---------------------------------------------------------------- face: skin between the outlines
BIG = poly([(440, 430), (470, 400), (520, 380), (600, 350), (700, 340), (760, 380), (760, 450), (745, 500),
            (712, 545), (690, 575), (660, 598), (620, 612), (580, 610), (535, 598), (500, 578), (470, 545),
            (450, 500)])
bar = lum < 175
reg = BIG & ~dil(bar, 1)
n, lab, st, _ = cv2.connectedComponentsWithStats(reg.astype(np.uint8), connectivity=4)
face_core = np.zeros_like(fg)
for i in range(1, n):
    if st[i, 4] >= 200 and 0.02 <= np.median(hue[lab == i]) <= 0.09:
        face_core |= lab == i
NECKBOX = poly([(555, 598), (705, 585), (705, 640), (555, 640)])
hairish = fg & ~dil(bar, 1) & ~face_core
# outlines next to the skin belong to the face when there is no hair on the other side (or along the jaw)
lines = fg & dil(bar, 1) & ~face_core
# (a strand crossing the skin has skin on both sides, but it is still hair: only the jaw outline is
# taken even though hair lies right next to it)
JAW = BIG & ~ero(BIG, 16) & (ys_ > 470)
face_line = lines & dil(face_core, 4) & (~dil(hairish & ~NECKBOX, 3) | (JAW & dil(face_core, 3)))
face_line &= ~dil(hairish & ~NECKBOX & ~JAW, 2) | JAW
face_vis = fill_holes(face_core | face_line | (eyes_all & BIG))
face_vis = fill_holes(cv2.morphologyEx(face_vis.astype(np.uint8), cv2.MORPH_CLOSE,
                                       cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))) > 0) & fg
face_vis &= ~NECKBOX | (ys_ < 600)

# ---------------------------------------------------------------- hair / body split
HZ = (ys_ < 600) | ((xs_ < 485) & (ys_ < 690)) | ((xs_ > 775) & (ys_ < 690))
neck = fg & NECKBOX & ~face_vis
front_hair = fg & HZ & ~face_vis & ~tail & ~hd & ~ahoge & ~earring & ~ear & ~neck
front_hair &= ~dil(eyes_all & ~BIG, 0)
for s in EYES:
    front_hair &= ~dil(LASH[s], 1)
    # the white glints on the lash would float in the hair once the lash closes
    front_hair &= ~(dil(LASH[s], 7) & (lum > 215) & (S < 0.16))
# crumbs
front_hair = biggest(front_hair, 150)
# the body reaches up under the lower hair, so a turning head never opens a gap at the cut
body = fg & (~HZ | (ys_ >= 555)) | neck
body &= ~earring
# copy of the hair / tail kept under them: blurred and without outlines, so it never shows as a double line
# long locks hanging in front of the dress: light pink pixels connected to the hair above
hairlike = fg & (lum > 185) & (S > 0.08) & (S < 0.34) & ((hue < 0.03) | (hue > 0.95))
low = fg & (ys_ >= 585) & ~face_vis & ~neck & ~tail & ~earring
cand = cv2.morphologyEx((hairlike & low).astype(np.uint8), cv2.MORPH_OPEN,
                        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))) > 0
seed = dil(front_hair, 3) & low
n, lab, st, _ = cv2.connectedComponentsWithStats((cand | seed).astype(np.uint8), connectivity=8)
long_hair = np.isin(lab, list(set(np.unique(lab[seed])) - {0})) & low
long_hair = fill_holes(cv2.morphologyEx(long_hair.astype(np.uint8), cv2.MORPH_CLOSE,
                                        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) > 0) & low
long_hair = dil(long_hair, 1) & low   # take the outline along the edge too
under = body & (front_hair | tail | long_hair | (HZ & ~neck))
# where the hair is cut straight (beside the neck) fade it out over the last rows
side = np.maximum(np.clip((xs_ - 775) / 22.0, 0, 1), np.clip((485 - xs_) / 22.0, 0, 1))
hair_fade = np.where(ys_ < 600, 1.0, side * np.clip((690 - ys_) / 25.0, 0, 1))
hair_fade = np.minimum(hair_fade, np.maximum(np.clip((600 - ys_) / 18.0, 0, 1), side)).astype(np.float32)

face_vis |= ear

# ---------------------------------------------------------------- layer writer
OUTLINE = (104, 46, 58)
layers = []
CX0, CY0 = CANVAS['x'], CANVAS['y']

def cpt(p):
    return [round(float(p[0] - CX0), 1), round(float(p[1] - CY0), 1)]

def save_layer(name, rgb, alpha, z, extra=None):
    a = np.clip(alpha, 0, 1).astype(np.float32)
    a[:CY0] = 0
    a[:, :CX0] = 0
    a[:, CX0 + CANVAS['w']:] = 0
    ys, xs = np.nonzero(a > 0.004)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    pad = 2
    x0, y0 = max(CX0, x0 - pad), max(CY0, y0 - pad)
    x1, y1 = min(CX0 + CANVAS['w'], x1 + pad), min(H, y1 + pad)
    rgba = np.dstack([rgb[y0:y1, x0:x1], (a[y0:y1, x0:x1] * 255).astype(np.uint8)])
    Image.fromarray(np.ascontiguousarray(rgba)).save(f'{OUT}/{name}.png', optimize=True)
    d = dict(name=name, file=f'{name}.png', x=int(x0 - CX0), y=int(y0 - CY0), w=int(x1 - x0), h=int(y1 - y0), z=z)
    if extra:
        for k, v in extra.items():
            d[k] = cpt(v) if k in ('pivot', 'anchor', 'center') else v
    layers.append(d)

# ---------------------------------------------------------------- back hair (dark copy behind everything)
silhouette = (front_hair | hd | ahoge | tail) & (ys_ < 700)
# kept a little inside the outline so it never peeks out around the figure
back = ero(fill_holes(silhouette), 3) & ~(body & ~dil(front_hair | tail, 8))
bh_src = front_hair & ~dil(bar, 1)
back_rgb = fill(rgb0.copy(), bh_src, back & ~bh_src, 8).astype(np.float32)
back_rgb = cv2.blur(back_rgb, (3, 25)) * np.array([0.84, 0.78, 0.82])
save_layer('back_hair', np.clip(back_rgb, 0, 255).astype(np.uint8), soft(back, 1.2), 0)

# ---------------------------------------------------------------- body (+ neck under the chin)
NECK_EXT = poly([(566, 540), (672, 530), (690, 640), (556, 640)])
neck_fill = NECK_EXT & ~body
body_ext = body | neck_fill
neck_src = neck & ~dil(bar, 1) & (lum > 170)
body_rgb = fill(rgb0.copy(), neck_src, neck_fill, 8)
ub = fill(body_rgb, under & ~dil(bar, 2), under & dil(bar, 2), 5)
ub = cv2.GaussianBlur(ub, (0, 0), 4)
uw = soft(under, 2.0)[..., None]
body_rgb = (body_rgb * (1 - uw) + ub * uw).astype(np.uint8)
body_rgb = np.where(neck_fill[..., None], cv2.GaussianBlur(body_rgb, (0, 0), 3), body_rgb)
save_layer('body', body_rgb, soft(body_ext, 0.5) * np.where(body, alpha_src, 1), 10)

# ---------------------------------------------------------------- tail, headdress (extend under the hair)
def under_hair(name, m, z, r, extra=None):
    ext = m | (dil(m, r) & (front_hair | face_vis) & ~dil(face_vis, 2))
    c = rgb0.copy(); c[~m] = 0
    c = fill(c, m & (lum > 150), ext & ~m, 7)
    c[m] = rgb0[m]
    # inside the picture the cut runs through hair: keep it hard so the blurred copy below never shows as a seam
    al = np.where(ero(fg, 2), ext.astype(np.float32), soft(ext, 0.6))
    save_layer(name, c, al * np.where(m, alpha_src, 1), z, extra)

under_hair('tail', tail, 20, 18, dict(pivot=(880, 210)))
under_hair('headdress', hd, 25, 16)

# ---------------------------------------------------------------- face
HEAD_OVAL = ellipse(HEAD_C[0] + 10, HEAD_C[1] + 20, HEAD_R - 20, HEAD_R - 25)
# skin painted only where the bangs / headdress cover it (never over the neck or the background)
face_ext = face_vis | (dil(face_vis, 18) & HEAD_OVAL & (front_hair | hd) & ~(ys_ > 568))
for s_ in EYES:
    face_ext |= dil(LASH[s_], 9) & fg & ~front_hair & ~tail & ~hd   # lash wings reaching over the hair
mouth_px = poly([(560, 520), (668, 520), (668, 575), (560, 575)]) & (lum < 190) & face_vis
remove = face_ext & ~face_vis
for s in EYES:
    remove |= dil(OPEN[s], 2) | dil(LASH[s], 3) | dil(LOWER[s], 2)
remove |= dil(mouth_px, 3)
# white of the eye that pokes out past the measured opening
glint = dil(eyes_all, 6) & (lum > 228) & (S < 0.14)
remove |= dil(glint, 2) & face_ext
keep = face_vis & ~remove
painted = face_ext & ~keep
skin_src = keep & face_core & ~dil(remove, 2) & ~dil(bar, 1) & ~dil(eyes_all, 4) & (lum < 242) & (S > 0.07)
fr = fill(rgb0.copy(), skin_src, painted, 8).astype(np.float32)
fr = np.where(painted[..., None], cv2.GaussianBlur(fr, (0, 0), 3), fr)
blur = cv2.GaussianBlur(fr, (0, 0), 1.5)
seam = (dil(keep, 2) & ~ero(keep, 2)) & ~(keep & dark)
fr = np.where(seam[..., None], blur, fr)
# skin painted where the lashes were: match the skin right around that eye (it is in the shade of the bangs,
# darker than the cheeks the fill borrows from), so a closed eye shows no pale patch
for s_ in EYES:
    ring = dil(EYEZONE[s_], 16) & ~dil(EYEZONE[s_], 6) & keep & face_core & ~dil(bar, 1)
    tgt = painted & dil(EYEZONE[s_], 10)
    if ring.sum() > 50 and tgt.any():
        gain = np.median(rgb0[ring].astype(np.float32), 0) / np.maximum(np.median(fr[tgt], 0), 1)
        w = soft(tgt, 3)[..., None]
        fr = fr * (1 - w) + fr * gain * w
face_rgb = np.clip(fr, 0, 255).astype(np.uint8)
save_layer('face', face_rgb, soft(face_ext, 0.6) * np.where(face_vis, alpha_src, 1), 30)
face_lum = face_rgb.astype(np.float32).mean(-1)

# ---------------------------------------------------------------- eyes
def line_layer(img, m, lum_line=80):
    """dark strokes drawn over the (painted) face: alpha from how much darker than the skin they are"""
    l = img.astype(np.float32).mean(-1)
    a = np.clip((face_lum - l) / np.maximum(face_lum - lum_line, 1), 0, 1) * soft(m, 0.5)
    return unblend(img, face_rgb, a), a

rig_eyes = {}
for s, e in EYES.items():
    op = OPEN[s]
    cx, cy, rx, ry = e['iris']
    # white: brightest of the drawings that look forward / aside, rest painted in from the white
    stack = np.stack([EX[i] for i in (1, 2, 3, 6)])
    best = stack.astype(np.float32).mean(-1).argmax(0)
    comp = np.take_along_axis(stack, best[None, ..., None].repeat(3, -1), 0)[0]
    cl = comp.astype(np.float32).mean(-1)
    cs = cv2.cvtColor(comp, cv2.COLOR_RGB2HSV_FULL)[..., 1] / 255.0
    wk = op & (cl > 222) & (cs < 0.14)
    wrgb = fill(comp, wk, dil(op, 2) & ~wk, 4)
    # a soft shadow under the lash
    top = interp_line(e['top'])
    sh = np.clip(1 - (ys_ - top[None, :]) / 9.0, 0, 1)[..., None]
    wrgb = np.clip(wrgb * (1 - 0.12 * sh), 0, 255).astype(np.uint8)
    save_layer(f'eye{s}_white', wrgb, soft(dil(op, 1), 0.6), 40, dict(eye=s))
    # iris: drawn part inside the opening, the part hidden by the lash painted in
    ell = ellipse(cx, cy, rx + 1, ry + 1)
    whiteish = op & (lum > 222) & (S < 0.12)
    known = ell & op & ~LASH[s] & ~LOWER[s] & ~(whiteish & ~ero(ell, 5))
    irgb = fill(rgb0.copy(), known, ell & ~known, 5)
    ia = ell & ~(whiteish & ~ero(ell, 5))
    save_layer(f'eye{s}_iris', irgb, soft(ia, 0.6), 41, dict(eye=s, center=(cx, cy)))
    save_layer(f'eye{s}_lower', rgb0, soft(LOWER[s], 0.5), 42, dict(eye=s))
    save_layer(f'eye{s}_lash', rgb0, soft(LASH[s], 0.5) * alpha_src, 43, dict(eye=s))
    # closed (expression 10) and ^ ^ (expression 07)
    bot = interp_line(e['bot'][:-1])
    x0, x1 = e['top'][0][0], e['top'][-1][0]
    ytop = min(p[1] for p in e['top'])
    ybot = max(p[1] for p in e['bot'])
    box = (xs_ > x0 - 34) & (xs_ < x1 + 26) & (ys_ > ytop - 22) & (ys_ < ybot + 10)
    old_lines = dil(dark01 & ~dil(op, 3) & ~dil(LASH[s], 2), 1)
    # the whole eye area of that drawing (skin, crease and lashes), feathered at the edge:
    # no guessing which dark pixels are the new line, and the skin around it is the drawn one
    for nm, i in (('closed', 10), ('smile', 7)):
        l = EX[i].astype(np.float32).mean(-1)
        line = box & (l < 150) & dil(EYEZONE[s], 12)
        region = (dil(EYEZONE[s], 5) | dil(biggest(line, 20), 4)) & box & fg
        if nm == 'closed':   # expression 10 has a pale smudge above the right eye: start just above the lid
            region &= ys_ > top[None, :] - 4
        a_ = np.clip(soft(ero(region, 2), 2.5) * 1.15, 0, 1)
        # strands of hair inside the patch stay with the hair layer, or they double up when the head moves
        a_ *= 1 - soft(dil(front_hair, 1), 0.8)
        # the generated drawing paints the lids a shade paler than the face: bring its skin tone to the face layer's
        sk = (l > 170) & region
        def lowpass(img):
            num = cv2.GaussianBlur(img * sk[..., None], (0, 0), 7)
            den = cv2.GaussianBlur(sk.astype(np.float32), (0, 0), 7)[..., None]
            return num / np.maximum(den, 1e-3)
        gain = lowpass(face_rgb.astype(np.float32)) / np.maximum(lowpass(EX[i].astype(np.float32)), 1)
        patch = np.clip(EX[i].astype(np.float32) * np.clip(gain, 0.7, 1.3), 0, 255).astype(np.uint8)
        save_layer(f'eye{s}_{nm}', patch, a_, 44, dict(eye=s))
    rig_eyes[s] = dict(top=[cpt(p) for p in e['top']], bot=[cpt(p) for p in e['bot']],
                       iris=cpt((cx, cy)) + [rx, ry], move=list(e['move']), rest=[0, 0])

# ---------------------------------------------------------------- mouth
c, a = line_layer(rgb0, dil(mouth_px, 1))
save_layer('mouth_closed', c, a, 50)
mb = poly([(548, 515), (680, 515), (680, 610), (548, 610)])
ex11 = EX[11]
l11 = ex11.astype(np.float32).mean(-1)
s11 = cv2.cvtColor(ex11, cv2.COLOR_RGB2HSV_FULL)[..., 1] / 255.0
diff = np.abs(ex11.astype(np.int16) - rgb0.astype(np.int16)).max(-1) > 35
mo = mb & diff & ((l11 < 200) | (s11 > 0.35))
mo = biggest(cv2.morphologyEx(mo.astype(np.uint8), cv2.MORPH_CLOSE,
                              cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))) > 0, 80)
mo = fill_holes(mo)
ys_m, xs_m = np.nonzero(mo)
anchor = ((xs_m.min() + xs_m.max()) / 2, ys_m.min() + 1)
save_layer('mouth_open', ex11, soft(dil(mo, 1), 0.6), 51, dict(anchor=anchor))

# ---------------------------------------------------------------- blush: how much redder expression 07 is
BL_C = np.array([236, 112, 136], np.float32)
g1 = rgb0[..., 1].astype(np.float32); g7 = EX[7][..., 1].astype(np.float32)
cheeks = np.zeros_like(fg)
for s_, (bx, by, brx, bry) in BLUSH.items():
    cheeks |= ellipse(bx, by + 2, brx + 22, bry + 16)
r1 = rgb0[..., 0].astype(np.float32); r7 = EX[7][..., 0].astype(np.float32)
ba = np.clip((g1 - g7 - 3) / np.maximum(g1 - BL_C[1], 1), 0, 0.85) * soft(cheeks & face_vis & ~eyes_all, 6)
ba *= np.clip(1 - (r1 - r7 - 6) / 14, 0, 1)   # red going down too = a shifted outline, not blush
ba = cv2.GaussianBlur(ba, (0, 0), 0.8)
brgb = np.zeros_like(rgb0); brgb[:] = BL_C.astype(np.uint8)
brgb = np.where((ba > 0.02)[..., None], unblend(EX[7], rgb0, np.maximum(ba, 0.02)), brgb)
save_layer('blush', brgb, ba, 52)

# ---------------------------------------------------------------- front hair, ahoge, earring
# hard edges inside the figure (the neighbouring layer starts right there), soft only on the outline
fh_a = np.where(ero(fg, 2), front_hair.astype(np.float32), soft(front_hair, 0.5))
save_layer('front_hair', rgb0, fh_a * alpha_src * hair_fade, 60)
# long hair: starts under the faded end of the bangs and swings at the tips
lh_top = np.clip((ys_ - 585) / 10.0, 0, 1)
lh_a = np.where(ero(fg, 2), long_hair.astype(np.float32), soft(long_hair, 0.5)) * lh_top
save_layer('hair_long', rgb0, lh_a * alpha_src, 56)
save_layer('ahoge', rgb0, soft(ahoge, 0.5) * alpha_src, 65, dict(pivot=(440, 166)))
save_layer('earring', rgb0, soft(earring, 0.5) * alpha_src, 70, dict(pivot=(812, 490)))

rig = dict(
    canvas=dict(CANVAS, bleed=dict(left=0, right=0, bottom=PAD_B)),
    source='art/pink2/expression_01.png',
    headCenter=cpt(HEAD_C), headRadius=HEAD_R, neck=cpt(NECK),
    bodyPivot=cpt((600, H)), mouth=cpt(MOUTH_C),
    blush={s_: cpt(b[:2]) for s_, b in BLUSH.items()},
    eyes=rig_eyes,
    layers=sorted(layers, key=lambda l: l['z']),
)
json.dump(rig, open('src/chars/pink/rig.json', 'w'), indent=1)

# ---------------------------------------------------------------- debug
cls = np.zeros((H, W, 3), np.uint8); cls[:] = (40, 160, 60)
for m, c in ((front_hair, (80, 110, 200)), (face_vis, (250, 210, 190)), (hd, (255, 255, 255)), (ahoge, (255, 140, 0)),
             (tail, (130, 60, 200)), (earring, (255, 255, 0)), (body, (120, 60, 30)),
             (LASH['L'] | LASH['R'], (0, 0, 0)), (OPEN['L'] | OPEN['R'], (0, 255, 255)),
             (LOWER['L'] | LOWER['R'], (255, 0, 0))):
    cls[m] = c
Image.fromarray((cls * 0.6 + rgb0 * 0.4).astype(np.uint8)[CY0:, CX0:CX0 + CANVAS['w']]).save(f'{DBG}/classes.png')
print('layers', [l['name'] for l in rig['layers']])
