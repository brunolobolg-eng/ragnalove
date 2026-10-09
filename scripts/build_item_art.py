"""
Gera public/sprites/item_art.png a partir da folha de ícones de equipamentos (cartas com moldura por raridade).

Entrada: a folha (PNG/WebP). Layout esperado: 14 linhas (tipos, na ordem de ITEM_ART_KINDS) e 6 colunas
(raridades, na ordem Comum, Incomum, Raro, Épico, Lendário, Mítico). A coluna à esquerda da folha (rótulos
com nome e descrição) é ignorada.

Saída: atlas RGBA em WebP (com transparência), 6 colunas × 14 linhas, células de CELL px. Cada célula é um recorte quadrado centrado na
carta, com a borda esmaecida em círculo (some com a moldura de topo/base da carta). A moldura colorida e o
brilho são desenhados pelo código (ui/itemArt.ts), como nos outros itens.

Uso: python scripts/build_item_art.py <folha> [saida=public/sprites/item_art.png]
"""
import sys
from collections import deque

import numpy as np
from PIL import Image

# ordem das linhas do atlas (= ITEM_ART_KINDS em ui/itemArt.ts)
ITEM_ART_KINDS = ['sword', 'axe', 'staff', 'bow', 'dagger', 'book', 'plate', 'cloak', 'helm', 'ring', 'earring', 'amulet', 'belt', 'boots']
CELL = 128          # px do atlas
CROP = 84           # lado do recorte na folha (px)
FADE = (0.60, 0.92) # borda esmaecida: de 60% a 92% do raio do recorte
BRIGHT = 115        # brilho mínimo da moldura para detectar a carta
X_LABEL = 240       # colunas à esquerda disso são os rótulos


def label_components(mask):
    """Componentes conectados (8-vizinhança) de uma máscara booleana: (x0, y0, x1, y1, pixels)."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    boxes = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        seen[y0, x0] = True
        q = deque([(y0, x0)])
        mnx = mxx = x0
        mny = mxy = y0
        n = 0
        while q:
            y, x = q.popleft()
            n += 1
            mnx, mxx, mny, mxy = min(mnx, x), max(mxx, x), min(mny, y), max(mxy, y)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
        boxes.append((int(mnx), int(mny), int(mxx) + 1, int(mxy) + 1, n))
    return boxes


def find_cards(rgb):
    """Cartas da folha, agrupadas em linhas (de cima para baixo) e colunas (da esquerda para a direita)."""
    mx = rgb.max(axis=2)
    mask = mx > BRIGHT
    mask[:, :X_LABEL] = False
    cards = [b for b in label_components(mask) if 120 <= b[2] - b[0] <= 150 and 48 <= b[3] - b[1] <= 85 and b[4] > 200]
    rows = []
    for b in sorted(cards, key=lambda b: (b[1] + b[3]) / 2):
        cy = (b[1] + b[3]) / 2
        if rows and abs(rows[-1]['cy'] - cy) < 30:
            rows[-1]['items'].append(b)
            rows[-1]['cy'] = sum((x[1] + x[3]) / 2 for x in rows[-1]['items']) / len(rows[-1]['items'])
        else:
            rows.append({'cy': cy, 'items': [b]})
    return [sorted(r['items'], key=lambda b: b[0]) for r in rows]


def fade_mask(size):
    """Alfa circular: 1 no centro, cai a 0 na borda do quadrado."""
    yy, xx = np.mgrid[0:size, 0:size]
    r = np.hypot(xx + 0.5 - size / 2, yy + 0.5 - size / 2) / (size / 2)
    a = (FADE[1] - r) / (FADE[1] - FADE[0])
    return np.clip(a, 0, 1)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else 'public/sprites/item_art.webp'
    rgb = np.asarray(Image.open(src).convert('RGB')).astype(int)
    rows = find_cards(rgb)
    if len(rows) != len(ITEM_ART_KINDS) or any(len(r) != 6 for r in rows):
        sys.exit(f'layout inesperado: {len(rows)} linhas, colunas {[len(r) for r in rows]} (esperado 14 × 6)')
    base = Image.open(src).convert('RGB')
    alpha = fade_mask(CROP)
    atlas = Image.new('RGBA', (6 * CELL, len(rows) * CELL), (0, 0, 0, 0))
    for r, cards in enumerate(rows):
        for c, (x0, y0, x1, y1, _) in enumerate(cards):
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            box = (round(cx - CROP / 2), round(cy - CROP / 2), round(cx + CROP / 2), round(cy + CROP / 2))
            crop = base.crop(box).convert('RGBA')
            crop.putalpha(Image.fromarray((alpha * 255).astype(np.uint8)))
            atlas.paste(crop.resize((CELL, CELL), Image.LANCZOS), (c * CELL, r * CELL))
    atlas.save(out, 'WEBP', quality=92, method=6)
    print('ok', out, atlas.size, 'tipos:', ', '.join(ITEM_ART_KINDS))


if __name__ == '__main__':
    main()
