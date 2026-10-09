"""
Recorta os ícones de habilidade da folha do dono (Pacote 01) em public/icons/skills/pacote-01/<id>.webp.

Como funciona:
  - O centro de cada quadro é o centro do nome embaixo dele (texto claro, uma sequência por habilidade).
  - Topo e base de cada quadro são as bordas horizontais mais fortes na coluna do centro.
  - Cada recorte é um quadrado de lado = altura do quadro (no assassino, os quadros são largos: recorte
    quadrado no centro), redimensionado para 128 px.

Os ids seguem a ordem visual da folha (esquerda → direita, cima → baixo) de cada painel; o mapa para os ids
do jogo (SKILLS em core/progression/skills.ts) está em ROWS. Se a folha mudar, ajuste as faixas e os centros.

Uso: python scripts/build_skill_icons.py <folha> [pasta_saida=public/icons/skills/pacote-01]
"""
import os
import sys

import numpy as np
from PIL import Image

OUT_SIZE = 128
# (faixa de texto y, ids na ordem visual, centros x dos rótulos detectados na folha)
ROWS = [
    (266, ['frostBolt', 'fireBarrier', 'meditation', 'frostNova', 'doubleBarrier', 'arcaneShield', 'thunderstorm'],
          [96, 217, 331, 442, 556, 677, 798]),
    (405, ['combustion', 'judgment', 'heal', 'sanctuary', 'holyShield', 'blessing', 'healGift'],
          [95, 217, 331, 442, 557, 678, 798]),
    (270, ['bash', 'cleave', 'ironSkin', 'fury', 'battleBreath'], [979, 1108, 1228, 1341, 1453]),
    (412, ['shatter', 'taunt', 'shockwave', 'shieldWall'], [973, 1109, 1244, 1383]),
    (614, ['preciseShot', 'arrowRain', 'eagleEye', 'piercing', 'volley', 'doubleShot', 'hunterFocus'],
          [91, 199, 298, 397, 488, 573, 658]),
    (758, ['fireRain', 'snareTrap', 'landMine', 'freezingTrap', 'claymore', 'trapMaster'],
          [92, 203, 310, 419, 531, 645]),
    (626, ['arcaneOrb', 'meteorStrike', 'arcaneFlow'], [806, 925, 1041]),
    (770, ['chainLightning', 'meteorShower'], [808, 947]),
    (621, ['lifeDrain', 'curse', 'darkPact'], [1217, 1334, 1449]),
    (766, ['shadowSwarm', 'soulHarvest'], [1230, 1381]),
    (956, ['backstab', 'bladeFan', 'shadowStep', 'poisonBlades', 'execute'], [152, 326, 505, 678, 844]),
]


def tile_box(gy, gx, cx, label_top):
    """(x, y, lado) do quadro com centro em cx, a partir da borda da base e do topo."""
    col = gy[:, cx - 28:cx + 28].mean(axis=1)
    lo, hi = label_top - 22, label_top + 2
    bottom = lo + int(np.argmax(col[lo:hi]))
    top = (bottom - 118) + int(np.argmax(col[bottom - 118:bottom - 82]))
    side = bottom - top
    return int(cx - side / 2), int(top), side


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else 'public/icons/skills/pacote-01'
    os.makedirs(out_dir, exist_ok=True)
    img = Image.open(src).convert('RGB')
    lum = np.asarray(img.convert('L')).astype(float)
    gy = np.abs(np.diff(lum, axis=0, prepend=lum[:1, :]))
    count = 0
    for label_top, ids, centers in ROWS:
        if len(ids) != len(centers):
            sys.exit(f'faixa y={label_top}: {len(ids)} ids e {len(centers)} rótulos')
        for skill_id, cx in zip(ids, centers):
            x, y, side = tile_box(gy, None, cx, label_top)
            crop = img.crop((x, y, x + side, y + side)).resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
            crop.save(os.path.join(out_dir, f'{skill_id}.webp'), 'WEBP', quality=92, method=6)
            count += 1
    print('ok', count, 'ícones em', out_dir)


if __name__ == '__main__':
    main()
