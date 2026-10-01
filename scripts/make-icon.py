"""Gera os ícones do ROguard a partir de uma arte quadrada com fundo preto.

Uso:  python scripts/make-icon.py icone.png
Saídas: public/emblem.png (fundo transparente, para o menu), public/icon.png (favicon),
        electron/icon.png (512) e electron/icon.ico (16..256, ícone do .exe/atalho).
"""
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
src = Image.open(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'icone.png').convert('RGB')

# fundo preto -> transparente (chave por luminância, bordas suaves)
lum = src.convert('L')
alpha = lum.point(lambda v: 0 if v < 10 else 255 if v > 42 else int((v - 10) * 255 / 32))
alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))
rgba = src.copy()
rgba.putalpha(alpha)
bbox = alpha.point(lambda v: 255 if v > 24 else 0).getbbox() or (0, 0, *src.size)
x0, y0, x1, y1 = bbox
side = max(x1 - x0, y1 - y0)
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
pad = int(side * 0.03)
half = side // 2 + pad
rgba = rgba.crop((cx - half, cy - half, cx + half, cy + half))

rgba.resize((512, 512), Image.LANCZOS).save(ROOT / 'public' / 'emblem.png')
rgba.resize((256, 256), Image.LANCZOS).save(ROOT / 'public' / 'icon.png')
rgba.resize((512, 512), Image.LANCZOS).save(ROOT / 'electron' / 'icon.png')
rgba.resize((256, 256), Image.LANCZOS).save(
    ROOT / 'electron' / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
)
print('ok', rgba.size)
