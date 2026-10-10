"""
Sprites da subida de nível, recortados da arte de referência do dono ("LEVEL UP", 1254 × 1254).

Cada recorte vira uma máscara branca (RGB = 255) com a forma no alfa, igual às texturas do Kenney
(ver build_kenney_fx.py): a cor vem do efeito, então cada classe sobe com a sua cor.

Uso:
    python scripts/build_levelup_fx.py caminho/para/referencia.webp

A referência não entra no repositório (arte pesada do dono). As caixas abaixo apontam para os trechos
dela, em pixels da imagem original. Saída: public/fx/levelup/*.png
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps

OUT = Path(__file__).resolve().parent.parent / "public" / "fx" / "levelup"
OUT.mkdir(parents=True, exist_ok=True)

# nome: (caixa x0, y0, x1, y1), escala de ampliação, limiar do fundo, limiar do núcleo, só a peça principal
# - miniatura "ASAS DIVINAS" (painel Composição): asa esquerda; a direita é o espelho (gerado abaixo)
# - "LUZ PRINCIPAL": feixe vertical com a base em anel (painel Rastros e feixes)
# - "RUNAS / CÍRCULOS": círculo mágico redondo (vai no chão)
# - "RASTROS E FEIXES": auréola inclinada (vai acima da cabeça)
# - "PARTÍCULAS": penas e estrela de brilho (a peça principal sem a estrela vizinha)
# - "OVERLAYS / LENTES": estrela de clarão e risco horizontal de lente
SPRITES = {
    "lu_wing": ((916, 168, 972, 246), 3.0, 60, 235, False),
    "lu_beam": ((708, 964, 768, 1096), 2.0, 40, 235, False),
    "lu_ring": ((277, 983, 335, 1044), 4.0, 50, 240, False),
    "lu_halo": ((784, 978, 844, 1016), 4.0, 40, 240, False),
    "lu_feather_a": ((156, 1090, 222, 1156), 3.0, 40, 235, True),
    "lu_feather_b": ((156, 1016, 210, 1046), 3.5, 40, 235, True),
    "lu_feather_c": ((50, 988, 96, 1032), 3.5, 40, 235, True),
    "lu_feather_d": ((102, 1086, 140, 1126), 3.5, 40, 235, True),
    "lu_star": ((46, 1110, 86, 1150), 4.0, 40, 255, False),
    "lu_flare": ((898, 976, 952, 1040), 4.0, 40, 255, False),
    "lu_streak": ((880, 1060, 1010, 1090), 2.0, 40, 255, False),
}


def alpha_of(crop: Image.Image, lo: int, hi: int) -> np.ndarray:
    """Luminância vira alfa: o fundo escuro some e o brilho fica. A cor não entra (o efeito pinta)."""
    L = np.asarray(crop.convert("L"), dtype=np.float32)
    return np.clip((L - lo) / float(hi - lo), 0.0, 1.0)


def main_piece(a: np.ndarray, thr: float = 0.08) -> np.ndarray:
    """Zera tudo que não está ligado ao pico de brilho (estrelas e brasas vizinhas dentro da caixa)."""
    h, w = a.shape
    seen = np.zeros((h, w), dtype=bool)
    keep = np.zeros((h, w), dtype=bool)
    y0, x0 = np.unravel_index(int(np.argmax(a)), a.shape)
    stack = [(int(y0), int(x0))]
    seen[y0, x0] = True
    while stack:
        y, x = stack.pop()
        keep[y, x] = True
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and a[ny, nx] > thr:
                seen[ny, nx] = True
                stack.append((ny, nx))
    return np.where(keep, a, 0.0)


def build(src: Image.Image, name: str, box, scale: float, lo: int, hi: int, main_only: bool) -> Image.Image:
    a = alpha_of(src.crop(box), lo, hi)
    if main_only:
        a = main_piece(a)
    alpha = Image.fromarray((a * 255).astype(np.uint8), "L")
    w, h = alpha.size
    alpha = alpha.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    alpha = alpha.filter(ImageFilter.UnsharpMask(radius=1.5, percent=60, threshold=1))
    out = Image.new("LA", alpha.size, (255, 0))
    out.putalpha(alpha)
    out.save(OUT / f"{name}.png", optimize=True)
    return out


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("uso: python scripts/build_levelup_fx.py caminho/para/referencia.webp")
    src = Image.open(sys.argv[1]).convert("RGB")
    if src.size != (1254, 1254):
        sys.exit(f"a referência precisa ser 1254 × 1254 (veio {src.size}): as caixas são desta arte")
    for name, (box, scale, lo, hi, main_only) in SPRITES.items():
        img = build(src, name, box, scale, lo, hi, main_only)
        print(name, img.size)
        if name == "lu_wing":
            ImageOps.mirror(img).save(OUT / "lu_wing_r.png", optimize=True)
            print("lu_wing_r", img.size)
    print("ok:", sorted(p.name for p in OUT.glob("*.png")))


if __name__ == "__main__":
    main()
