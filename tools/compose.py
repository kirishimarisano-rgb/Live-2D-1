"""Composite a character's rig layers (rest pose) for a quick look: python3 tools/compose.py maid out.png [hide,...] [scale]"""
import json, sys
from PIL import Image
ch, out = sys.argv[1], sys.argv[2]
hide = sys.argv[3].split(',') if len(sys.argv) > 3 and sys.argv[3] else []
rig = json.load(open(f'src/chars/{ch}/rig.json'))
c = rig['canvas']
im = Image.new('RGBA', (c['w'], c['h']), (60, 170, 90, 255))
skip_default = {'eyeL_closed', 'eyeR_closed', 'eyeL_smile', 'eyeR_smile', 'mouth_open', 'blush'}
for l in rig['layers']:
    if l['name'] in hide or (l['name'] in skip_default and l['name'] not in sys.argv[3:4]):
        continue
    im.alpha_composite(Image.open(f"src/chars/{ch}/parts/{l['file']}").convert('RGBA'), (l['x'], l['y']))
sc = float(sys.argv[4]) if len(sys.argv) > 4 else 1
if sc != 1:
    im = im.resize((int(c['w'] * sc), int(c['h'] * sc)))
im.save(out)
