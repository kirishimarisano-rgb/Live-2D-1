"""Maid step 2: cut build/maid/cutout.png into rig parts.

Every coordinate below is in the pixel space of art/ref-maid.jpg (988×988).
The picture is cropped at the right and bottom edge, so the girl peeks in from a corner.
We pad those two cut edges (repeat the last pixels) so a head turn never shows a hard cut,
and mirror everything (FLIP) so she peeks in from the bottom-LEFT corner of the screen.

Outputs src/chars/maid/parts/*.png and src/chars/maid/rig.json.
Run:  python3 tools/maid_cutout.py && python3 tools/maid_segment.py
"""
import json, os, math
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFilter

OUT = 'src/chars/maid/parts'
DBG = 'build/maid/debug'
os.makedirs(OUT, exist_ok=True)
os.makedirs(DBG, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

FLIP = True
PAD_R, PAD_B = 96, 40          # padding added on the cut edges (right, bottom)

src0 = np.array(Image.open('build/maid/cutout.png').convert('RGBA'))
src = np.pad(src0, ((0, PAD_B), (0, PAD_R), (0, 0)), mode='edge')
H, W = src.shape[:2]
# the padding on the cut side would show a dead-straight top edge when the head tilts:
# bend it downwards like the rest of the head outline, with the outline drawn along it
W0 = src0.shape[1]
top0 = np.nonzero(src0[:, -1, 3] > 128)[0].min()
for d in range(1, PAD_R + 1):
    x = W0 - 1 + d
    cut = int(top0 + 0.9 * d + 0.004 * d * d)
    src[:cut, x, 3] = 0
    src[cut:cut + 14, x, :3] = (22, 40, 88)
rgb0 = src[..., :3].copy()
alpha_src = src[..., 3].astype(np.float32) / 255.0
fg = alpha_src > 0.5

# canvas = crop of the (padded) original; 10px headroom above the ahoge
CANVAS = dict(x=300, y=250, w=W - 300, h=H - 250)

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

def fill(img, known, target, r=6):
    """inpaint `target` using only `known` pixels as the source (works on a crop around the target)"""
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

def biggest(m, min_size):
    n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
    return np.isin(lab, [i for i in range(1, n) if st[i, 4] >= min_size])

# ---------------------------------------------------------------- regions (original pixels)
P = {}
P['body'] = [(546, 846), (600, 850), (660, 863), (720, 869), (800, 862), (806, H), (546, H)]
P['ahoge'] = [(546, 370), (551, 345), (585, 309), (630, 290), (680, 284), (724, 289), (752, 304), (762, 330),
              (762, 376), (733, 378), (731, 345), (716, 326), (690, 319), (640, 321), (600, 334), (570, 356), (560, 374)]
P['headdress'] = [(458, 525), (464, 474), (492, 448), (502, 422), (532, 402), (553, 385), (598, 372), (630, 358),
                  (670, 349), (722, 355), (764, 363), (802, 372), (838, 389), (877, 399), (901, 430), (938, 450),
                  (953, 476), (958, 498), (972, 535), (972, 600), (968, 632), (905, 640), (888, 560), (868, 500),
                  (828, 458), (760, 424), (700, 414), (640, 418), (578, 433), (518, 468), (488, 520)]
P['bow'] = [(903, 630), (925, 622), (945, 638), (962, 624), (984, 630), (986, 668), (972, 692), (950, 684),
            (930, 692), (906, 682)]
P['earL'] = [(320, 738), (345, 721), (380, 704), (420, 687), (446, 675), (446, 700), (446, 786), (430, 787),
             (400, 779), (365, 769), (333, 756)]
P['earR'] = [(897, 684), (940, 678), (W, 672), (W, 862), (930, 852), (899, 838), (894, 760)]
P['face'] = [(498, 690), (518, 618), (580, 578), (700, 566), (800, 586), (852, 636), (864, 720), (850, 800),
             (822, 846), (782, 866), (700, 871), (640, 864), (580, 840), (530, 812), (503, 772)]
P['neck_ext'] = [(622, 800), (740, 800), (744, 892), (618, 892)]

# eyes, original screen-left = 'L'.  top = lid lower edge, bot = outer edge of the eye ring, left→right
EYES = {
    'L': dict(top=[(537, 693), (548, 683), (575, 680), (600, 679), (625, 678), (636, 690)],
              bot=[(537, 693), (539, 725), (553, 755), (585, 771), (615, 762), (632, 737), (636, 690), (636, 678)],
              oval=(586, 724, 50, 47), upper=[(512, 668), (530, 663), (560, 660), (600, 659), (630, 660), (645, 666)], lashbox=(512, 652, 642, 688), seed=(575, 670),
              brow=(596, 627, 628, 642), move=(9, 6)),
    'R': dict(top=[(718, 702), (726, 688), (760, 690), (790, 697), (815, 704), (832, 714)],
              bot=[(718, 702), (720, 740), (735, 772), (772, 790), (805, 783), (825, 760), (832, 726), (832, 714)],
              oval=(775, 738, 57, 52), upper=[(712, 674), (730, 667), (760, 670), (790, 677), (820, 688), (850, 700), (866, 712)], lashbox=(712, 660, 866, 726), seed=(790, 686),
              brow=(745, 640, 782, 664), move=(10, 6)),
}
MOUTH_C = (676, 812)
BLUSH = {'L': (538, 780, 30, 15), 'R': (815, 802, 24, 14)}
OUTLINE = (34, 48, 92)

M = {k: poly(v) for k, v in P.items()}
hsv = cv2.cvtColor(rgb0, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
Hh, S, V = hsv[..., 0] / 255.0, hsv[..., 1] / 255.0, hsv[..., 2] / 255.0
lum = np.array(Image.fromarray(rgb0).convert('L')).astype(np.float32)

skin = (Hh < 0.12) | (Hh > 0.9)
skin &= (V > 0.8) & (S > 0.03) & (S < 0.35)
dark = lum < 95
hairblue = (Hh > 0.56) & (Hh < 0.72) & (S > 0.3) & (V > 0.42) & (V < 0.9)
hair_cc = biggest(hairblue & fg, 1500)

# ---------------------------------------------------------------- classification
jaw = Image.new('L', (W, H), 0)
ImageDraw.Draw(jaw).line([(512, 700), (500, 740), (506, 776), (522, 802), (560, 828), (600, 846), (640, 858),
                          (700, 866), (760, 866), (792, 860)], fill=255, width=12)
jaw_px = (np.array(jaw) > 0) & dark & M['face']
# the chin outline belongs to the face, hair strands poking into the collar box belong to the hair
body = M['body'] & fg & ~jaw_px & ~(dil(hair_cc, 5) & (dark | hairblue) & ~ero(M['body'], 16))
head = fg & ~body
ahoge = head & (M['ahoge'] | (dil(M['ahoge'], 9) & poly([(540, 280), (770, 280), (770, 372), (540, 372)])))
# headdress: frills + their outer outline; the outline shared with the hair stays with the hair
hd = M['headdress'] & head & ~ahoge & ~(dil(hair_cc, 7) & (dark | hairblue))
hd = biggest(hd, 400) | (M['bow'] & head)
earL = M['earL'] & head & ~hd
earR = M['earR'] & head & ~hd

# eyes
oval = {s: ellipse(*e['oval']) for s, e in EYES.items()}
eye_open = {s: poly(e['top'] + e['bot'][::-1]) for s, e in EYES.items()}
lash_zone = {}
for s, e in EYES.items():
    x0, y0, x1, y1 = e['lashbox']
    box = np.zeros_like(fg); box[y0:y1, x0:x1] = True
    d = box & (lum < 110) & ~ero(oval[s], 3)
    # the lid is a thick bar, hair outlines crossing it are thin: open, keep the blob at the seed
    core = cv2.morphologyEx(d.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    n, lab = cv2.connectedComponents(core, connectivity=8)
    sx, sy = e['seed']
    cy_, cx_ = np.nonzero(core)
    k = np.argmin((cx_ - sx) ** 2 + (cy_ - sy) ** 2)
    blob = dil(lab == lab[cy_[k], cx_[k]], 4) & d
    # hair strand outlines poking up out of the bar are not part of the lid
    up = np.interp(np.arange(W), [p[0] for p in e['upper']], [p[1] for p in e['upper']])
    above = np.arange(H)[:, None] < up[None, :] - 1
    lash_zone[s] = blob & ~above

brow_px = {}
for s, e in EYES.items():
    x0, y0, x1, y1 = e['brow']
    box = np.zeros_like(fg); box[y0:y1, x0:x1] = True
    brow_px[s] = box & ((Hh < 0.06) | (Hh > 0.9)) & (S > 0.25)
blush_marks = poly([(505, 752), (562, 752), (562, 802), (505, 802)]) & ((Hh < 0.04) | (Hh > 0.9)) & (S > 0.18) & (V > 0.6)

face_area = M['face'] & head & ~earL & ~earR & ~hd
forced = (np.array(jaw) > 0) & dark & M['face']
for s in EYES:
    forced |= oval[s] | lash_zone[s] | brow_px[s]
face_vis = face_area & (skin | forced | blush_marks)
face_vis = cv2.morphologyEx(face_vis.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)) > 0
face_vis = (biggest(face_vis, 300) | forced) & face_area
# tiny "hair" islands inside the skin are shading, keep them with the face
holes = face_area & ~face_vis
face_vis |= holes & ~biggest(holes, 60)

front_hair = head & ~face_vis & ~hd & ~ahoge & ~earL & ~earR
for s in EYES:
    front_hair &= ~dil(lash_zone[s], 1)
# stray outline crumbs left right above the lids look like dashes when the eye closes
near = dil(lash_zone['L'] | lash_zone['R'], 10) & front_hair
n, lab, st, _ = cv2.connectedComponentsWithStats(near.astype(np.uint8), connectivity=8)
front_hair &= ~np.isin(lab, [i for i in range(1, n) if st[i, 4] < 80])

# ---------------------------------------------------------------- layer writer (mirrors on save)
layers = []
CX0, CY0 = CANVAS['x'], CANVAS['y']

def fx(x):
    """original x -> canvas x"""
    return (CX0 + CANVAS['w'] - 1 - x) if FLIP else (x - CX0)

def cpt(p):
    return [round(float(fx(p[0])), 1), round(float(p[1] - CY0), 1)]

def side(s):
    return {'L': 'R', 'R': 'L'}[s] if FLIP else s

def save_layer(name, rgb, alpha, z, extra=None):
    a = np.clip(alpha, 0, 1)
    a[:CY0] = 0
    a[:, :CX0] = 0
    ys, xs = np.nonzero(a > 0.004)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    pad = 2
    x0, y0 = max(CX0, x0 - pad), max(CY0, y0 - pad)
    x1, y1 = min(W, x1 + pad), min(H, y1 + pad)
    rgba = np.dstack([rgb[y0:y1, x0:x1], (a[y0:y1, x0:x1] * 255).astype(np.uint8)])
    if FLIP:
        rgba = rgba[:, ::-1]
    Image.fromarray(np.ascontiguousarray(rgba)).save(f'{OUT}/{name}.png', optimize=True)
    cx = fx(x1 - 1) if FLIP else x0 - CX0
    d = dict(name=name, file=f'{name}.png', x=int(cx), y=int(y0 - CY0), w=int(x1 - x0), h=int(y1 - y0), z=z)
    if extra:
        for k, v in extra.items():
            d[k] = cpt(v) if k in ('pivot', 'anchor', 'center') else v
    layers.append(d)

def eye_name(s, part):
    return f'eye{side(s)}_{part}'

# ---------------------------------------------------------------- back hair
silhouette = front_hair | hd | ahoge
back = dil(silhouette, 3) & ~dil(M['body'] & ~dil(front_hair, 6), 0)
back |= dil(front_hair, 3)
bh_src = front_hair & hairblue
back_rgb = fill(rgb0.copy(), bh_src, back & ~bh_src, 8).astype(np.float32)
back_rgb = cv2.blur(back_rgb, (3, 25)) * np.array([0.72, 0.74, 0.82])
edge = back & ~ero(back, 3)
back_rgb[edge] = OUTLINE
save_layer('back_hair', np.clip(back_rgb, 0, 255).astype(np.uint8), soft(back, 0.8), 0)

# ---------------------------------------------------------------- ears (behind the hair)
for nm, em, piv in (('earL', earL, (446, 722)), ('earR', earR, (902, 712))):
    ext = em | (dil(em, 22) & front_hair & ~face_vis)
    ext &= poly([(0, 0), (W, 0), (W, H), (0, H)])
    e_rgb = rgb0.copy(); e_rgb[~em] = 0
    e_known = em & (lum > 60)
    e_rgb = fill(e_rgb, e_known, ext & ~em, 7)
    e_rgb[em] = rgb0[em]
    sn = nm if not FLIP else {'earL': 'earR', 'earR': 'earL'}[nm]
    save_layer(sn, e_rgb, soft(ext, 0.6) * np.where(em, alpha_src, 1), 5, dict(pivot=piv))

# ---------------------------------------------------------------- body (+ neck under the chin)
body_ext = body | M['neck_ext']
body_rgb = rgb0.copy()
neck_fill = M['neck_ext'] & ~body
ny = np.clip((np.arange(H)[:, None] - 800) / 80.0, 0, 1)
neck_col = np.array([236, 196, 190]) * (1 - ny[..., None]) + np.array([226, 180, 178]) * ny[..., None]
body_rgb = np.where(neck_fill[..., None], neck_col, body_rgb).astype(np.uint8)
save_layer('body', body_rgb, soft(body_ext, 0.5) * np.where(body, alpha_src, 1), 10)

# ---------------------------------------------------------------- headdress (extends under the hair)
hd_ext = hd | (dil(hd, 16) & front_hair)
hd_rgb = rgb0.copy(); hd_rgb[~hd] = 0
hd_rgb = fill(hd_rgb, hd & (lum > 150), hd_ext & ~hd, 7)
hd_rgb[hd] = rgb0[hd]
save_layer('headdress', hd_rgb, soft(hd_ext, 0.6) * np.where(hd, alpha_src, 1), 25)

# ---------------------------------------------------------------- face
face_ext = M['face'] & ~earL & ~earR & ~(hd & ~dil(front_hair, 4))
eye_zone = np.zeros_like(fg)
for s in EYES:
    eye_zone |= dil(oval[s], 5) | dil(lash_zone[s], 5)
face_ext |= eye_zone & head
remove = face_ext & ~face_vis
for s in EYES:
    remove |= dil(oval[s], 2) | dil(lash_zone[s], 3) | dil(brow_px[s], 3)
keep = face_vis & ~remove
painted = face_ext & ~keep
skin_src = keep & skin & ~dil(remove, 2)
fr = fill(rgb0.copy(), skin_src, painted, 8).astype(np.float32)
fr = np.where(painted[..., None], cv2.GaussianBlur(fr, (0, 0), 3), fr)
# the ends of the lid bars lie over hair, not skin: behind them paint hair, so a closing eye
# does not leave a blob of skin sticking out into the hair
hair_ref = front_hair & ~eye_zone
hair_side = np.zeros_like(fg)
for s_ in EYES:
    lz = dil(lash_zone[s_], 4) & ~dil(oval[s_], 1) & painted
    # column by column: the upper half of the bar continues whatever is right above it (bangs or skin),
    # the lower half continues what is below (skin)
    for x in np.nonzero(lz.any(0))[0]:
        ys = np.nonzero(lz[:, x])[0]
        y0, y1 = ys.min(), ys.max()
        above = front_hair[max(0, y0 - 3):y0, x].any()
        below = front_hair[y1 + 1:y1 + 4, x].any()
        mid = (y0 + y1) // 2
        if above:
            hair_side[y0:mid + 1, x] = lz[y0:mid + 1, x]
        if below:
            hair_side[mid:y1 + 1, x] = lz[mid:y1 + 1, x]
hair_side = cv2.morphologyEx(hair_side.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) > 0
hair_side = (soft(hair_side, 2.0) > 0.5) & painted
hfill = fill(rgb0.copy(), front_hair & hairblue & ~dil(eye_zone, 2), hair_side, 5).astype(np.float32)
hw = soft(hair_side, 1.0)[..., None]
fr = fr * (1 - hw) + hfill * hw
blur = cv2.GaussianBlur(fr, (0, 0), 2.0)
seam = (dil(keep, 2) & ~ero(keep, 2)) | ~keep
fr = np.where((seam & ~(keep & dark) & ~hair_side)[..., None], blur, fr)
# soft hair shadow on the forehead under the bangs
shadow_y = np.clip((np.arange(H)[:, None] - 600) / 70.0, 0, 1)
fr = np.where((painted & ~hair_side & ~dil(oval['L'] | oval['R'], 6))[..., None],
              fr * (0.94 + 0.06 * shadow_y[..., None]), fr)
save_layer('face', np.clip(fr, 0, 255).astype(np.uint8),
           soft(face_ext, 0.6) * np.where(face_vis & ~M['face'], alpha_src, 1), 30)

# ---------------------------------------------------------------- strokes
def draw_line(pts, width, color=OUTLINE, taper=0.35, SS=4):
    """round-capped stroke, thinner at both ends"""
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    x0, y0 = int(min(xs)) - 20, int(min(ys)) - 20
    x1, y1 = int(max(xs)) + 20, int(max(ys)) + 20
    big = Image.new('RGBA', ((x1 - x0) * SS, (y1 - y0) * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    n = len(pts)
    for i in range(n):
        t = i / (n - 1)
        w = width * (taper + (1 - taper) * math.sin(math.pi * t) ** 0.5)
        r = w * SS / 2
        q = ((pts[i][0] - x0) * SS, (pts[i][1] - y0) * SS)
        d.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=color + (255,))
    big = big.resize((x1 - x0, y1 - y0), Image.LANCZOS)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    im.paste(big, (x0, y0))
    return np.array(im)

# ---------------------------------------------------------------- eyes
rig_eyes = {}
for s, e in EYES.items():
    ov = oval[s]
    cx, cy, rx, ry = e['oval']
    inner = ellipse(cx, cy, rx - 7, ry - 7)
    hl = inner & (lum > 150)
    hl = dil(hl, 1) & inner
    # "white": the whole eye (ring + blue), highlights painted out, lid area painted as ring
    wrgb = fill(rgb0.copy(), inner & ~hl & ~lash_zone[s], hl, 6)
    wrgb[ov & lash_zone[s]] = OUTLINE
    wrgb[ov & ~inner & ~(lum < 120)] = OUTLINE
    # the ring top hidden under the lid: draw it in so a wide-open eye shows a closed ring
    ring = ov & ~ellipse(cx, cy, rx - 6, ry - 6)
    wrgb[ring & (dil(lash_zone[s], 3))] = OUTLINE
    save_layer(eye_name(s, 'white'), wrgb, soft(ov, 0.6), 40, dict(eye=side(s)))
    # "iris": just the highlights, they slide around inside the eye when she looks around
    save_layer(eye_name(s, 'iris'), rgb0, soft(hl, 0.6), 41, dict(eye=side(s), center=(cx, cy)))
    # lid bar
    save_layer(eye_name(s, 'lash'), rgb0, soft(lash_zone[s], 0.6) * alpha_src, 43, dict(eye=side(s)))
    # closed (shallow ∪, a little lower than the lid) and happy (∩)
    ys_, xs_ = np.nonzero(lash_zone[s])
    lx0, lx1 = xs_.min() + 3, xs_.max() - 3
    xs = np.linspace(lx0, lx1, 40)
    # a straight base line through the eye's lower half (same slant as the lid), plus a smooth sag / arch
    t = np.linspace(0, 1, 40)
    l0, l1 = e['top'][0], e['top'][-1]
    base = np.interp(xs, [l0[0], l1[0]], [l0[1], l1[1]]) + (e['oval'][3] * 2) * 0.5
    closed = list(zip(xs, base + 12 * 4 * t * (1 - t) - 8))
    smile = list(zip(xs, base - 14 * 4 * t * (1 - t) + 4))
    for nm, pts in (('closed', closed), ('smile', smile)):
        a_ = draw_line(pts, 11)
        save_layer(eye_name(s, nm), a_[..., :3], a_[..., 3] / 255.0, 44, dict(eye=side(s)))
    top = [cpt(p) for p in e['top']]
    botc = [cpt(p) for p in e['bot'][:-1]]
    if FLIP:
        top = top[::-1]
        botc = sorted(botc)
        botc.append(top[-1])
    else:
        botc.append(cpt(e['bot'][-1]))
    c = cpt((cx, cy))
    rig_eyes[side(s)] = dict(top=top, bot=botc, iris=[c[0], c[1], rx, ry], move=list(e['move']), rest=[0, 0])

# brows: the original pink dashes
for s, e in EYES.items():
    save_layer(f'brow{side(s)}', rgb0, soft(dil(brow_px[s], 1), 0.6), 45, dict(eye=side(s)))

# ---------------------------------------------------------------- mouth (she has none: paint a small one)
S4 = 4
mw, mh = 60, 50
im = Image.new('RGBA', (mw * S4, mh * S4), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
cxm, cym = mw * S4 / 2, 8 * S4
shape = [(cxm - math.cos(math.pi * i / 40) * 12 * S4, cym + math.sin(math.pi * i / 40) * 16 * S4) for i in range(41)]
shape += [(cxm + 12 * S4, cym), (cxm, cym - 2 * S4), (cxm - 12 * S4, cym)]
d.polygon(shape, fill=(150, 56, 82, 255))
d.ellipse([cxm - 8 * S4, cym + 7 * S4, cxm + 8 * S4, cym + 19 * S4], fill=(236, 128, 146, 255))
mask = Image.new('L', im.size, 0); ImageDraw.Draw(mask).polygon(shape, fill=255)
im.putalpha(Image.fromarray(np.minimum(np.array(im)[..., 3], np.array(mask))))
ImageDraw.Draw(im).line(shape + [shape[0]], fill=OUTLINE + (255,), width=int(2.6 * S4), joint='curve')
im = im.resize((mw, mh), Image.LANCZOS)
mo = np.zeros((H, W, 4), np.uint8)
ox, oy = MOUTH_C[0] - mw // 2, MOUTH_C[1] - 8
mo[oy:oy + mh, ox:ox + mw] = np.array(im)
save_layer('mouth_open', mo[..., :3], mo[..., 3] / 255.0, 51, dict(anchor=(MOUTH_C[0], MOUTH_C[1] - 1)))
# closed: she has no mouth in the art, so there is no closed-mouth layer at all

# ---------------------------------------------------------------- blush overlay
ga = Image.new('L', (W, H), 0)
for s_, (bx, by, brx, bry) in BLUSH.items():
    ImageDraw.Draw(ga).ellipse([bx - brx, by - bry, bx + brx, by + bry], fill=120)
ga = ga.filter(ImageFilter.GaussianBlur(8))
im = Image.new('RGBA', (W, H), (244, 150, 168, 0))
im.putalpha(ga)
hatch = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(hatch)
for s_, (bx, by, brx, bry) in BLUSH.items():
    for k in range(-1, 2):
        x = bx + k * 10
        d.line([(x + 4, by - 7), (x - 3, by + 7)], fill=(232, 110, 130, 200), width=3)
im = Image.alpha_composite(im, hatch)
a_ = np.array(im)
save_layer('blush', a_[..., :3], a_[..., 3] / 255.0, 52)

# ---------------------------------------------------------------- front hair, ahoge
save_layer('front_hair', rgb0, soft(front_hair, 0.5) * alpha_src, 60)
save_layer('ahoge', rgb0, soft(ahoge, 0.5) * alpha_src, 65, dict(pivot=(748, 376)))

rig = dict(
    canvas=dict(CANVAS, flip=FLIP, bleed=dict(left=PAD_R if FLIP else 0, right=0 if FLIP else PAD_R, bottom=PAD_B)),
    source='art/ref-maid.jpg',
    headCenter=cpt((690, 690)), headRadius=260, neck=cpt((690, 868)),
    bodyPivot=cpt((690, H)), mouth=cpt(MOUTH_C),
    blush={side(s): cpt(b[:2]) for s, b in BLUSH.items()},
    eyes=rig_eyes,
    layers=sorted(layers, key=lambda l: l['z']),
)
json.dump(rig, open('src/chars/maid/rig.json', 'w'), indent=1)

# ---------------------------------------------------------------- debug
dbg = Image.fromarray(np.dstack([rgb0, (fg * 255).astype(np.uint8)])).convert('RGBA')
ov_ = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov_)
for k, pts in P.items():
    d.line(pts + [pts[0]], fill=(255, 0, 0, 255), width=2)
for s, e in EYES.items():
    d.line(e['top'], fill=(0, 0, 255, 255), width=1)
    d.line(e['bot'], fill=(0, 255, 255, 255), width=1)
dbg = Image.alpha_composite(dbg, ov_)
dbg.crop((300, 250, W, H)).save(f'{DBG}/polygons.png')
cls = np.zeros((H, W, 3), np.uint8); cls[:] = (40, 160, 60)
for m, c in ((front_hair, (80, 110, 200)), (face_vis, (250, 210, 190)), (hd, (255, 255, 255)), (ahoge, (255, 140, 0)),
             (earL, (200, 0, 200)), (earR, (200, 0, 200)), (body, (120, 60, 30)),
             (lash_zone['L'] | lash_zone['R'], (0, 0, 0)), (brow_px['L'] | brow_px['R'], (255, 0, 0))):
    cls[m] = c
Image.fromarray(cls).crop((300, 250, W, H)).save(f'{DBG}/classes.png')
print('layers', [l['name'] for l in rig['layers']])
