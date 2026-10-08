"""Crop the hand-drawn story sketches and turn them into clean ink-on-transparent PNGs."""
import sys, numpy as np
import pillow_heif
from PIL import Image, ImageOps, ImageFilter, ImageDraw
pillow_heif.register_heif_opener()
UP = '/root/.claude/uploads/9a16e9a2-6544-5608-b3b5-b96a464ae683/'
OUT = sys.argv[1]
S = 4284 / 1050  # crop boxes below are in 1050px-wide preview coordinates
JOBS = [  # name, file, crop box, erase boxes (handwritten captions)
    ('01-indoors', '7f5171eb-IMG_9573', (150, 830, 900, 1240), []),
    ('02-feed', '1cff70ff-IMG_9574', (160, 55, 1015, 625), [(195, 75, 660, 170)]),
    ('03-room', '574f29d2-IMG_9575', (195, 300, 805, 690), [(150, 230, 640, 352)]),
    ('04-noise', '9ae98d82-IMG_9576', (180, 240, 1010, 1060), []),
    ('05-burst', '4e96d850-IMG_9577', (35, 405, 965, 1255), []),
    ('06-sumi', '5cf5ad44-IMG_9578', (712, 880, 898, 1112), []),
]
for name, f, box, erase in JOBS:
    im = ImageOps.exif_transpose(Image.open(UP + f + '.HEIC')).convert('L')
    d = ImageDraw.Draw(im)
    for e in erase:
        d.rectangle([int(v * S) for v in e], fill=255)
    im = im.crop([int(v * S) for v in box])
    g = np.asarray(im, np.float32) / 255
    paper = np.asarray(im.filter(ImageFilter.GaussianBlur(60)), np.float32) / 255  # uneven lighting
    rel = np.clip(g / np.maximum(paper, 0.2), 0, 1.2)
    ink = np.clip((0.80 - rel) / 0.32, 0, 1) ** 0.9   # faint show-through drops out
    a = Image.fromarray((ink * 255).astype(np.uint8))
    a = a.filter(ImageFilter.MedianFilter(3))
    w = 1100 if name != '06-sumi' else 520
    a = a.resize((w, int(a.height * w / a.width)), Image.LANCZOS)
    rgba = Image.new('RGBA', a.size, (30, 29, 27, 0)); rgba.putalpha(a)
    rgba.save(f'{OUT}/{name}.png', optimize=True)
    print(name, a.size)
