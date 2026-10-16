"""Gera as versões cinza dos ícones da Árvore de Aurenthal (nós bloqueados).

Antes, cada ícone de nó bloqueado recebia `filter: grayscale(1) brightness(0.6)` no navegador: são ~90 filtros
por desenho da roda, e cada passagem do cursor refaz tudo. Assim o filtro vira arquivo: o mesmo resultado, gravado
uma vez. Rode de novo se mudar algum ícone em src/config/arvoreVisual.ts.

Uso: python3 scripts/gerarIconesArvoreCinza.py
Saída: public/ui/kit/<nome>-cinza.webp e public/ui/arvore/<nome>-cinza.webp (ao lado de cada original).
"""
import re
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
CONFIG = RAIZ / 'src' / 'config' / 'arvoreVisual.ts'
PUBLIC = RAIZ / 'public'

# Mesmos efeitos que o CSS aplicava: grayscale(1) pelos coeficientes do filtro (Filter Effects) e brightness(0.6).
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
BRILHO = 0.6


def cinza(origem: Path, destino: Path) -> None:
    imagem = Image.open(origem).convert('RGBA')
    pixels = np.asarray(imagem).astype(np.float32)
    lum = pixels[..., :3] @ LUMA * BRILHO
    saida = np.dstack([lum, lum, lum, pixels[..., 3]]).clip(0, 255).astype(np.uint8)
    destino.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(saida, 'RGBA').save(destino, 'WEBP', quality=92, method=6)


def main() -> None:
    texto = CONFIG.read_text(encoding='utf-8')
    caminhos = sorted(set(re.findall(r"'(ui/(?:kit|arvore)/[^']+?)\.webp'", texto)))
    for relativo in caminhos:
        origem = PUBLIC / f'{relativo}.webp'
        if not origem.exists():
            raise SystemExit(f'ícone não encontrado: {origem}')
        destino = origem.with_name(origem.stem + '-cinza.webp')
        cinza(origem, destino)
        print(f'{relativo}.webp -> {destino.relative_to(PUBLIC)}')
    print(f'{len(caminhos)} ícones cinza gerados')


if __name__ == '__main__':
    main()
