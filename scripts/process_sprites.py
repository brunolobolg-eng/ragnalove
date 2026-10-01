"""
Ferramenta de assets (não faz parte do jogo): recebe uma folha gerada com N poses
lado a lado sobre fundo verde puro, remove o fundo (chroma key + despill),
separa as poses e salva PNGs com transparência em public/sprites/.

Uso: python scripts/process_sprites.py <folha.png> <prefixo> <pose1> <pose2> ...
Ex.: python scripts/process_sprites.py mage_sheet.png mage front back action

Folhas de animação (quadros de uma mesma ação) devem manter a escala dos sprites
já existentes: use --median=<px> para que a altura MEDIANA dos quadros vire <px>
(ex.: --median=310 para o monstro, igual à pose de frente atual).
Ex.: python scripts/process_sprites.py walk.png grunt walk0 walk1 walk2 walk3 --median=310
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "sprites"
TARGET_H = 320  # altura de saída da pose mais alta (px)


def key_green(img: Image.Image) -> np.ndarray:
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    dom = g - np.maximum(r, b)
    alpha = np.clip(1.0 - (dom - 40) / 60, 0, 1)  # verde forte -> transparente, suave na borda
    alpha[(g > 140) & (dom > 90)] = 0
    # despill: remove o halo verde nas bordas
    g2 = np.minimum(g, np.maximum(r, b) + 10)
    out = np.dstack([r, g2, b, alpha * 255]).astype(np.uint8)
    return out


def split_components(rgba: np.ndarray, n: int) -> list[np.ndarray]:
    """Separa as poses cortando nos "vales" de ocupação entre elas e, dentro de cada
    faixa, mantém só o maior bloco conectado (descarta pontas de espada/brilho vizinhas)."""
    from scipy import ndimage

    solid = rgba[..., 3] > 128
    h, w = solid.shape
    cols = np.convolve(solid.sum(axis=0), np.ones(9) / 9, mode="same")
    cuts = [0]
    for k in range(1, n):
        lo, hi = int(w * (k - 0.5) / n), int(w * (k + 0.5) / n)
        cuts.append(lo + int(np.argmin(cols[lo:hi])))
    cuts.append(w)
    masks = []
    for x0, x1 in zip(cuts[:-1], cuts[1:]):
        band = np.zeros_like(solid)
        band[:, x0:x1] = solid[:, x0:x1]
        labels, count = ndimage.label(band)
        sizes = ndimage.sum(band, labels, range(1, count + 1))
        main = int(np.argmax(sizes)) + 1
        masks.append(labels == main)
    return masks


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--"))
    sheet, prefix, poses = args[0], args[1], args[2:]
    rgba = key_green(Image.open(sheet))
    masks = split_components(rgba, len(poses))
    crops = []
    for m in masks:
        part = rgba.copy()
        part[~m, 3] = 0
        ys, xs = np.where(m)
        crops.append(Image.fromarray(part[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]))
    if "max" in opts:
        scale = float(opts["max"]) / float(max(c.height for c in crops))
    elif "median" in opts:
        scale = float(opts["median"]) / float(np.median([c.height for c in crops]))
    else:
        scale = TARGET_H / max(c.height for c in crops)
    OUT.mkdir(parents=True, exist_ok=True)
    meta_path = OUT / "meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    for pose, c in zip(poses, crops):
        c = c.resize((max(1, round(c.width * scale)), max(1, round(c.height * scale))), Image.LANCZOS)
        name = f"{prefix}_{pose}"
        c.save(OUT / f"{name}.png")
        # âncora = centro dos pés (15% inferiores), para a troca de pose não "pular"
        a = np.asarray(c)[..., 3] > 128
        feet = a[int(a.shape[0] * 0.85) :]
        xs = np.where(feet)[1]
        anchor_x = float(xs.mean() / a.shape[1]) if xs.size else 0.5
        meta[name] = {"w": c.width, "h": c.height, "anchorX": round(anchor_x, 4)}
        print(name, c.size, "anchorX", round(anchor_x, 3))
    meta_path.write_text(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
