"""Make the pictures used by RIG.md: every part on its own, and the pivots on the full figure.
Usage: python3 tools/rig_sheet.py [pink|maid]   (pink -> screenshots/rig-parts.png, maid -> screenshots/rig-maid-parts.png)"""
import json, sys
from PIL import Image, ImageDraw, ImageFont

CH = sys.argv[1] if len(sys.argv) > 1 else 'pink'
PARTS = f'src/chars/{CH}/parts'
TAG = '' if CH == 'pink' else f'-{CH}'
rig = json.load(open(f'src/chars/{CH}/rig.json'))
C = rig['canvas']
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 18)
except OSError:
    font = ImageFont.load_default()

# 1. contact sheet
cell = 220
cols = 5
rows = (len(rig['layers']) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cell, rows * (cell + 26)), (245, 240, 244))
d = ImageDraw.Draw(sheet)
for i, l in enumerate(rig['layers']):
    im = Image.open(f"{PARTS}/{l['file']}")
    im.thumbnail((cell - 16, cell - 16))
    x, y = (i % cols) * cell, (i // cols) * (cell + 26)
    chk = Image.new('RGBA', (cell - 8, cell - 8), (220, 236, 222, 255))
    sheet.paste(chk, (x + 4, y + 4))
    sheet.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2), im)
    d.text((x + 8, y + cell - 2), f"{l['z']:>2}  {l['name']}", fill=(90, 40, 60), font=font)
sheet.save(f'screenshots/rig{TAG}-parts.png')

# 2. assembled figure with pivots
can = Image.new('RGBA', (C['w'], C['h']), (250, 246, 248, 255))
for l in rig['layers']:
    if l['name'] in ('mouth_open', 'blush'):
        continue
    can.alpha_composite(Image.open(f"{PARTS}/{l['file']}"), (l['x'], l['y']))
d = ImageDraw.Draw(can)
def mark(p, label, col):
    x, y = p
    d.ellipse([x - 7, y - 7, x + 7, y + 7], outline=col, width=3)
    d.line([x - 11, y, x + 11, y], fill=col, width=2)
    d.line([x, y - 11, x, y + 11], fill=col, width=2)
    d.text((x + 10, y - 26), label, fill=col, font=font)
hc = rig['headCenter']; r = rig['headRadius']
d.ellipse([hc[0] - r, hc[1] - r, hc[0] + r, hc[1] + r], outline=(80, 120, 255), width=2)
mark(hc, '頭部中心', (40, 80, 230))
mark(rig['neck'], '脖子（歪頭樞紐）', (200, 40, 120))
mark([rig['bodyPivot'][0], rig['bodyPivot'][1] - 14], '身體樞紐', (200, 40, 120))
for l in rig['layers']:
    if 'pivot' in l:
        mark(l['pivot'], f"{l['name']} 樞紐", (230, 110, 0))
for s, e in rig['eyes'].items():
    d.line([tuple(p) for p in e['top']], fill=(0, 90, 255), width=2)
    d.line([tuple(p) for p in e['bot'][:-1]], fill=(0, 190, 200), width=2)
mark(rig['mouth'], '嘴', (200, 40, 120))
can.convert('RGB').save(f'screenshots/rig{TAG}-pivots.png')
print('ok')
