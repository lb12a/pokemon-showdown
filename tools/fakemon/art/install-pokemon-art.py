"""Copy the designer's artwork into assets/ under the project's ID naming rule."""
import json, os, re, sys, unicodedata
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else None
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
if not SRC:
    raise SystemExit('usage: python3 tools/fakemon/art/install-pokemon-art.py <folder of PNGs>')
ART = os.path.join(ROOT, 'assets', 'pokemon')
ICONS = os.path.join(ROOT, 'assets', 'pokemon-icons')

def toID(name):
    return re.sub(r'[^a-z0-9]+', '', name.lower())

def unescape(stem):
    """The zip escaped non-ASCII as #U00f6."""
    return re.sub(r'#U([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), stem)

os.makedirs(ART, exist_ok=True)
os.makedirs(ICONS, exist_ok=True)

manifest = json.load(open(os.path.join(ROOT, 'assets', 'manifest.json')))
wanted = {}          # id -> display name
for name in manifest['pokemon']:
    wanted[toID(name)] = name

done, unknown = {}, []
for fname in sorted(os.listdir(SRC)):
    if not fname.lower().endswith('.png'):
        continue
    display = unescape(fname[:-4])
    sid = toID(unicodedata.normalize('NFC', display))
    if sid not in wanted:
        unknown.append(display)
        continue
    im = Image.open(os.path.join(SRC, fname)).convert('RGBA')

    # Trim the transparent border so every Pokemon fills its box the same way,
    # whatever the artwork's own margins happen to be.
    box = im.getbbox()
    if box:
        im = im.crop(box)

    # Battle sprite: fit inside a square, keep the aspect ratio, nearest
    # neighbour so the pixel art stays crisp.
    def fit(img, size):
        w, h = img.size
        scale = min(size / w, size / h)
        out = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.NEAREST)
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        canvas.paste(out, ((size - out.size[0]) // 2, (size - out.size[1]) // 2))
        return canvas

    fit(im, 320).save(os.path.join(ART, f'{sid}.png'), optimize=True)
    fit(im, 64).save(os.path.join(ICONS, f'{sid}.png'), optimize=True)
    done[sid] = display

missing = [wanted[i] for i in wanted if i not in done]
print(f'installed {len(done)} sprites + icons')
print('missing artwork:', missing or 'none')
print('files with no matching species:', unknown or 'none')
