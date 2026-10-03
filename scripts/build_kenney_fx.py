"""
Ferramenta de assets (não faz parte do jogo): monta as texturas de efeito a partir do
Kenney Particle Pack (pasta "PNG (Transparent)") e grava em public/fx/kenney/.

Uso: python scripts/build_kenney_fx.py "<pasta PNG (Transparent)>"

As imagens do pacote são brancas/cinza com transparência. Aqui tudo vira BRANCO com a
forma no canal alfa (normalizado para usar 0–255): a cor vem do efeito no jogo, como antes.
Fumaça e fogo viram atlas 4×4 (quadro = idade da partícula).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "kenyparticles/PNG (Transparent)")
OUT = Path(__file__).resolve().parent.parent / "public" / "fx" / "kenney"
OUT.mkdir(parents=True, exist_ok=True)


def load(name: str, crop: float = 0) -> np.ndarray:
    """Alfa da forma (0..1), combinando alfa e brilho para manter o detalhe interno.
    `crop` (limiar de alfa, 0 = não recorta): recorta pelo contorno (quadrado, com margem) — a forma ocupa a célula inteira."""
    im = np.asarray(Image.open(SRC / f"{name}.png").convert("RGBA")).astype(np.float32) / 255
    lum = im[..., :3].max(axis=2)
    a = im[..., 3] * np.sqrt(lum / max(1e-6, lum.max()))
    a = a / max(1e-6, a.max())
    if crop:
        ys, xs = np.where(a > crop)
        cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
        half = max(ys.max() - ys.min(), xs.max() - xs.min()) / 2 * 1.08 + 2
        n = a.shape[0]
        y0, y1, x0, x1 = int(cy - half), int(cy + half), int(cx - half), int(cx + half)
        pad = max(0, -y0, -x0, y1 - n, x1 - n)
        a = np.pad(a, pad)[y0 + pad:y1 + pad, x0 + pad:x1 + pad]
    return a


def fit(a: np.ndarray, size: int) -> np.ndarray:
    return np.asarray(Image.fromarray((a * 255).astype(np.uint8), "L").resize((size, size), Image.LANCZOS)).astype(np.float32) / 255


def save(name: str, a: np.ndarray, rgb=(255, 255, 255)) -> None:
    h, w = a.shape
    out = np.zeros((h, w, 4), np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = rgb
    out[..., 3] = np.clip(a * 255, 0, 255).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(OUT / f"{name}.png", optimize=True)


def single(name: str, src: str, size: int, gain: float = 1.0, crop: float = 0.008) -> None:
    save(name, np.clip(fit(load(src, crop), size) * gain, 0, 1))


def atlas(name: str, frames: list[str], cell: int, fade: float) -> None:
    """Atlas 4×4: quadro 0 no topo-esquerdo (o shader lê de cima para baixo). `fade` apaga com a idade."""
    out = np.zeros((cell * 4, cell * 4), np.float32)
    for i, f in enumerate(frames):
        life = i / (len(frames) - 1)
        a = fit(load(f, 0.06), cell) * (1 - fade * life)
        y, x = divmod(i, 4)
        out[y * cell:(y + 1) * cell, x * cell:(x + 1) * cell] = a
    save(name, out)


def mix(*parts: tuple[str, float], size: int = 256) -> np.ndarray:
    a = np.zeros((size, size), np.float32)
    for src, w in parts:
        a = np.maximum(a, fit(load(src), size) * w)
    return a


# Partículas (GPU): fogo nasce denso (labaredas) e termina em fiapos; fumaça cresce e se abre
atlas("flame_atlas", ["muzzle_02", "muzzle_03", "muzzle_05", "muzzle_04", "muzzle_01", "flame_05", "flame_06", "flame_05",
                      "fire_01", "fire_02", "fire_01", "flame_02", "flame_01", "flame_03", "flame_04", "flame_04"], 128, 0.35)
atlas("smoke_atlas", ["smoke_03", "smoke_05", "smoke_06", "smoke_02", "smoke_01", "smoke_04", "smoke_07", "smoke_08",
                      "smoke_07", "smoke_08", "smoke_10", "smoke_09", "smoke_10", "smoke_09", "smoke_04", "smoke_01"], 128, 0.45)
single("spark", "star_06", 128, crop=0.03)
single("impact", "scorch_01", 256)
single("glow", "circle_05", 128)
single("flash", "light_01", 256)
single("orb", "star_09", 128)
single("soul", "magic_05", 128)
single("halo", "magic_04", 128)
single("slash", "slash_04", 256)
single("twirl", "twirl_01", 256)
single("trace", "trace_06", 128)
# fita: o perfil do rastro (trace) atravessando a largura (eixo v)
tr = load("trace_06")
prof = tr[tr.shape[0] // 2]
prof = np.asarray(Image.fromarray((prof[None, :] * 255).astype(np.uint8), "L").resize((64, 1), Image.LANCZOS)).astype(np.float32)[0] / 255
save("ribbon", np.tile((prof / max(1e-6, prof.max()))[:, None], (1, 4)))
# chama vertical para a barreira de fogo: 4 quadros lado a lado (128×128 cada)
strip = np.concatenate([fit(load(n, 0.06), 128) for n in ["muzzle_04", "muzzle_01", "muzzle_03", "muzzle_02"]], axis=1)
save("flame_strip", strip)
# ruído para cortar/animar lâminas e chamas
single("noise", "smoke_07", 128)

# Decalques de chão (256): queimado e rachadura já escuros (o jogo usa cor branca neles)
save("decal_scorch", mix(("scorch_03", 1.0), ("smoke_09", 0.7)) * 0.92, rgb=(28, 22, 20))
save("decal_crack", mix(("dirt_03", 1.0), ("scorch_02", 0.5)) * 0.95, rgb=(16, 13, 12))
save("decal_frost", mix(("star_08", 1.0), ("light_03", 0.55), ("magic_04", 0.7)))
save("decal_runesFire", mix(("magic_01", 1.0), ("circle_02", 0.9), ("circle_04", 0.6)))
save("decal_runesFrost", mix(("magic_02", 1.0), ("circle_02", 0.9), ("circle_04", 0.6)))
save("decal_ring", mix(("circle_02", 1.0)))
save("decal_glow", mix(("circle_05", 1.0)))
save("decal_aoe", mix(("circle_03", 1.0), ("circle_05", 0.28), ("magic_02", 0.5)))
save("decal_disc", mix(("circle_05", 0.6), ("circle_04", 1.0)))
print("ok:", sorted(p.name for p in OUT.glob("*.png")))
