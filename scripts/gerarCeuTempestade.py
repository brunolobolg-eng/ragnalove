#!/usr/bin/env python3
"""
Gera as imagens do Ato III (Cume das Cinzas, clima de tempestade). Rode a partir da raiz do projeto
(precisa de Pillow e numpy):

    python3 scripts/gerarCeuTempestade.py

Saída (public/textures/cenario/):
  ceu_tempestade.webp  céu em projeção equirretangular 2048x1024 (topo = zênite, meio = horizonte, base = abaixo
                       do chão). Render/scenery/tempestade.ts o põe numa esfera por dentro. Como a câmera do jogo
                       olha para baixo, o que aparece é a metade de baixo: o horizonte tem a mesma cor da névoa
                       (HORIZONTE = ATO3_TEMPESTADE.horizonte em config/visualConfig.ts). Mude nos dois lugares.
  sombra_contato.webp  mancha escura e suave (alfa radial) que fica no chão, sob cada ruína flutuante.
  nevoa_suave.webp     placa branca com alfa radial, para o nevoeiro frio (a cor vem do material).

Sementes fixas: rodar de novo gera os mesmos arquivos. Nada disso é gerado no navegador (regra 8 do CLAUDE.md).
"""

import os

import numpy as np
from PIL import Image

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SAIDA = os.path.join(RAIZ, 'public', 'textures', 'cenario')
QUALIDADE = 84
SEMENTE = 20260415

# Cores (mesmas do config: HORIZONTE == ATO3_TEMPESTADE.horizonte = 0x2a3340)
HORIZONTE = '#2a3340'
ZENITE = '#1b2230'
VAZIO_BAIXO = '#0b0f15'
NUVEM_SOMBRA = '#1a212c'
NUVEM_LUZ = '#5d6c82'
BRILHO_DISTANTE = '#9fb6d6'

LARGURA = 2048
ALTURA = 1024


def rgb(hexa):
    h = hexa.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def ruido_periodico(rng, gx, gy):
    """Ruído de valor com borda horizontal ligada: o céu é contínuo ao dar a volta na esfera."""
    grade = rng.random((gy + 1, gx)).astype(np.float32)
    xs = np.linspace(0, gx, LARGURA, endpoint=False)
    ys = np.linspace(0, gy, ALTURA, endpoint=False)
    x0 = np.floor(xs).astype(int)
    y0 = np.floor(ys).astype(int)
    fx = smoothstep(0.0, 1.0, xs - x0)
    fy = smoothstep(0.0, 1.0, ys - y0)
    xa = x0 % gx
    xb = (x0 + 1) % gx
    v00 = grade[np.ix_(y0, xa)]
    v01 = grade[np.ix_(y0, xb)]
    v10 = grade[np.ix_(y0 + 1, xa)]
    v11 = grade[np.ix_(y0 + 1, xb)]
    top = v00 * (1 - fx)[None, :] + v01 * fx[None, :]
    bot = v10 * (1 - fx)[None, :] + v11 * fx[None, :]
    return top * (1 - fy)[:, None] + bot * fy[:, None]


def fbm(rng, oitavas=5):
    """Soma de oitavas do ruído: nuvens com bordas cheias e detalhe fino. Estica o contraste pelos percentis
    (sem isso a soma fica perto de 0,5 e as nuvens somem). Vai de 0 a 1."""
    total = np.zeros((ALTURA, LARGURA), np.float32)
    peso = 0.0
    amp = 1.0
    for o in range(oitavas):
        gx = 4 * (2 ** o)
        gy = 2 * (2 ** o)
        total += amp * ruido_periodico(rng, gx, gy)
        peso += amp
        amp *= 0.5
    total /= peso
    p_baixo, p_alto = np.percentile(total, [8, 92])
    return np.clip((total - p_baixo) / (p_alto - p_baixo), 0.0, 1.0).astype(np.float32)


def ceu():
    rng = np.random.default_rng(SEMENTE)
    # latitude de cada linha: +90° (zênite) no topo, -90° (abaixo do chão) na base
    linhas = np.arange(ALTURA, dtype=np.float32)
    elev = 90.0 - 180.0 * (linhas + 0.5) / ALTURA
    e = elev[:, None] * np.ones((1, LARGURA), np.float32)

    h, z, v, s, luz, brilho = rgb(HORIZONTE), rgb(ZENITE), rgb(VAZIO_BAIXO), rgb(NUVEM_SOMBRA), rgb(NUVEM_LUZ), rgb(BRILHO_DISTANTE)

    # céu acima do horizonte: do azul-acinzentado escuro (zênite) até o horizonte
    k_cima = smoothstep(0.0, 0.9, e / 90.0)[..., None]
    # vazio abaixo do horizonte: escurece para baixo (é o que aparece além da borda do chão)
    k_baixo = smoothstep(0.0, 0.6, -e / 90.0)[..., None]
    cor = np.where(e[..., None] >= 0, h * (1 - k_cima) + z * k_cima, h * (1 - k_baixo) + v * k_baixo).astype(np.float32)

    # nuvens densas: mais espessas perto do horizonte, com bordas duras só nas partes cheias
    n = fbm(rng, 5)
    detalhe = fbm(rng, 3)
    peso_horizonte = np.exp(-((e / 38.0) ** 2)) * 0.6 + 0.45
    mascara = smoothstep(0.40, 0.74, n) * peso_horizonte
    # lado iluminado: o topo das nuvens (detalhe) pega mais luz; a base fica na sombra
    lado_luz = smoothstep(0.30, 0.75, detalhe)[..., None]
    nuvem = s * (1 - lado_luz) + luz * lado_luz
    cor = cor * (1 - 0.92 * mascara[..., None]) + nuvem * (0.92 * mascara[..., None])

    # faixa de névoa no horizonte: a mesma cor da névoa do jogo, para a borda não aparecer
    faixa = np.exp(-((e / 4.5) ** 2))[..., None] * 0.85
    cor = cor * (1 - faixa) + h * faixa

    # brilho distante: uma luz pálida, atrás das nuvens, à direita do centro
    u = (np.arange(LARGURA, dtype=np.float32) / LARGURA)[None, :]
    halo = np.exp(-(((u - 0.62) / 0.07) ** 2) - (((e + 4.0) / 9.0) ** 2))[..., None]
    cor = cor + brilho * halo * 0.32

    arr = np.clip(cor * 255.0, 0, 255).astype(np.uint8)
    Image.fromarray(arr, 'RGB').save(os.path.join(SAIDA, 'ceu_tempestade.webp'), 'WEBP', quality=QUALIDADE, method=6)


def radial(tam):
    """Coordenada radial 0..1 (centro = 0, borda = 1) para as manchas de alfa."""
    c = (np.arange(tam, dtype=np.float32) + 0.5) / tam * 2 - 1
    xx, yy = np.meshgrid(c, c)
    return np.sqrt(xx * xx + yy * yy)


def manchas():
    r = radial(256)
    # sombra de contato: escura, forte no centro e sumindo na borda
    alfa = (1 - smoothstep(0.15, 1.0, r)) ** 1.6 * 0.95
    cor = np.zeros((256, 256, 3), np.uint8) + np.array([4, 6, 9], np.uint8)
    rgba = np.dstack([cor, np.clip(alfa * 255, 0, 255).astype(np.uint8)])
    Image.fromarray(rgba, 'RGBA').save(os.path.join(SAIDA, 'sombra_contato.webp'), 'WEBP', quality=QUALIDADE, method=6)

    # névoa: branca e muito suave, a cor fica por conta do material no jogo
    alfa = (1 - smoothstep(0.0, 1.0, r)) ** 2.2
    cor = np.full((256, 256, 3), 240, np.uint8)
    rgba = np.dstack([cor, np.clip(alfa * 255, 0, 255).astype(np.uint8)])
    Image.fromarray(rgba, 'RGBA').save(os.path.join(SAIDA, 'nevoa_suave.webp'), 'WEBP', quality=QUALIDADE, method=6)


def main():
    os.makedirs(SAIDA, exist_ok=True)
    ceu()
    manchas()
    for nome in ['ceu_tempestade.webp', 'sombra_contato.webp', 'nevoa_suave.webp']:
        caminho = os.path.join(SAIDA, nome)
        print(f'{nome}: {os.path.getsize(caminho) // 1024} KB')


if __name__ == '__main__':
    main()
