#!/usr/bin/env python3
"""
Gera as texturas do cenário que antes eram pintadas em canvas, na hora do carregamento do jogo.

Rode a partir da raiz do projeto (precisa de Pillow e numpy):

    python3 scripts/gerarTexturasCenario.py

Saída: public/textures/cenario/*.webp. Sementes fixas: rodar de novo gera os mesmos arquivos.

Por que existe: canvas feito na hora fica borrado de perto. Estes WebP saem com o dobro da
resolução do canvas antigo (128 px por tile em vez de 64), então ficam nítidos.

O desenho segue a lógica antiga, com as mesmas cores e as mesmas quantidades por tile:
  BiomeScenery.ts  (chão da planície e do lado de fora, raios de sol da floresta)
  sceneryTextures.ts (grama, pavimento de losangos, arenito, tufos, chão da vila)
  bridgeTextures.ts (blocos de muralha, lateral da ponte)
  BoardView.ts (runa do portal)

O que depende do mapa (rotas gastas, portão, buracos, sombra das paredes, grade) NÃO sai daqui:
o jogo monta essas camadas em máscaras por cima do chão (ver groundLayers.ts).

Para mudar uma cor ou uma quantidade, mude aqui e rode o script de novo.
"""

import math
import os
import random

import numpy as np
from PIL import Image

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SAIDA = os.path.join(RAIZ, 'public', 'textures', 'cenario')
QUALIDADE = 82

# Paleta (copiada das constantes de BiomeScenery.ts, sceneryTextures.ts e bridgeTextures.ts)
PLAN_GROUND = ['#6e9444', '#789c4a', '#66883e', '#84a452']
PLAN_DETAIL = ['#a8c860', '#5a7a34', '#b89a62', '#98bc58']
PLAN_OUTER = ['#5e843c', '#688e42', '#587c38']
PLAN_DRIFT = ('#f6f4d6', '#6a7a3a')
PLAN_FLOWERS = ['#fff6e0', '#ffe070', '#ff9ab8', '#b8a8ff', '#ffffff']
GRASS = ['#6f9a3c', '#7aa845', '#658e35', '#86b24e', '#5c8431']
GRASS_BLADE = ['#9cc75a', '#4f7a2a', '#a8d066']
GRASS_FLOWERS = ['#f2e25c', '#f4f0e6', '#e86a8a', '#b889e0']
PAVING = ['#e0d2b0', '#d8c8a3', '#e6d9ba', '#d2c29c', '#dccdaa']
GROUT = '#a9b27c'
SANDSTONE = ['#d9c7a0', '#cdb98f', '#e2d2ae']
STONE_COLS = ['#707279', '#686a71', '#76787e', '#61636a', '#6d6e73']
TUFT_COLS = ['#79a843', '#8fbe52', '#9fcc5e', '#6b9a3a']
GATE_STONE = '#8a8478'


def rgb(hexa):
    h = hexa.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def mistura(c0, c1, t):
    return c0 + (c1 - c0) * t


class Tela:
    """Tela RGBA (cor reta + alfa) com pincel próprio. `k` = resolução: 2 quer dizer 2 px de textura por px de desenho."""

    def __init__(self, w, h, k=2, fundo=None, alfa=1.0, rng=None):
        self.k = k
        self.W = int(w * k)
        self.H = int(h * k)
        self.img = np.zeros((self.H, self.W, 4), np.float32)
        if fundo is not None:
            self.img[..., :3] = rgb(fundo)
            self.img[..., 3] = alfa

    def pintar(self, x0, y0, x1, y1, cobertura, cor, a=1.0):
        """Pinta a caixa (em unidades de desenho) com `cobertura(X, Y)` em 0..1 (X, Y em px de textura, sem fim).
        O índice é tomado com módulo: a forma que passa da borda aparece do outro lado (textura repete sem costura)."""
        k = self.k
        if isinstance(cor, str):
            cor = rgb(cor)
        xs = np.arange(math.floor(x0 * k), math.ceil(x1 * k)) + 0.5
        ys = np.arange(math.floor(y0 * k), math.ceil(y1 * k)) + 0.5
        if xs.size == 0 or ys.size == 0:
            return
        X, Y = np.meshgrid(xs, ys)
        sa = np.clip(cobertura(X, Y) * a, 0.0, 1.0).astype(np.float32)
        if not np.any(sa > 0.0005):
            return
        Yi = np.floor(Y).astype(int) % self.H
        Xi = np.floor(X).astype(int) % self.W
        cor_px = cor(X, Y) if callable(cor) else np.broadcast_to(cor, X.shape + (3,)).astype(np.float32)
        dst = self.img[Yi, Xi]
        da = dst[..., 3]
        oa = sa + da * (1.0 - sa)
        safe = np.maximum(oa, 1e-6)[..., None]
        out = (cor_px * sa[..., None] + dst[..., :3] * (da * (1.0 - sa))[..., None]) / safe
        self.img[Yi, Xi, :3] = out
        self.img[Yi, Xi, 3] = oa

    def elipse(self, cx, cy, rx, ry, rot, cor, a=1.0):
        k = self.k
        c, s = math.cos(rot), math.sin(rot)
        raio_min = min(rx, ry) * k

        def cob(X, Y):
            dx = X - cx * k
            dy = Y - cy * k
            u = (dx * c + dy * s) / (rx * k)
            v = (-dx * s + dy * c) / (ry * k)
            q = np.sqrt(u * u + v * v)
            return np.clip((1.0 - q) * raio_min + 0.5, 0.0, 1.0)

        m = max(rx, ry) + 2
        self.pintar(cx - m, cy - m, cx + m, cy + m, cob, cor, a)

    def disco(self, cx, cy, r, cor, a=1.0):
        self.elipse(cx, cy, r, r, 0.0, cor, a)

    def radial(self, cx, cy, r, c0, a0, c1=None, a1=0.0, a_mult=1.0, recorte=None):
        """Degradê radial: cor c0 com alfa a0 no centro, c1 com a1 na borda (r). `recorte` = (x,y,w,h) em desenho."""
        k = self.k
        c1 = c0 if c1 is None else c1
        c0v, c1v = rgb(c0) if isinstance(c0, str) else c0, rgb(c1) if isinstance(c1, str) else c1

        def cob(X, Y):
            t = np.hypot(X - cx * k, Y - cy * k) / (r * k)
            al = np.where(t < 1.0, a0 + (a1 - a0) * t, 0.0)
            if recorte is not None:
                rx, ry, rw, rh = recorte
                dentro = (X >= rx * k) & (X < (rx + rw) * k) & (Y >= ry * k) & (Y < (ry + rh) * k)
                al = np.where(dentro, al, 0.0)
            return al

        def cor(X, Y):
            t = np.clip(np.hypot(X - cx * k, Y - cy * k) / (r * k), 0.0, 1.0)[..., None]
            return mistura(c0v, c1v, t)

        m = r + 1
        self.pintar(cx - m, cy - m, cx + m, cy + m, cob, cor, a_mult)

    def retangulo(self, x, y, w, h, cor, a=1.0, raio=0.0):
        k = self.k

        def cob(X, Y):
            cx = (x + w / 2) * k
            cy = (y + h / 2) * k
            hw = (w / 2 - raio) * k
            hh = (h / 2 - raio) * k
            dx = np.abs(X - cx) - hw
            dy = np.abs(Y - cy) - hh
            fora = np.sqrt(np.maximum(dx, 0) ** 2 + np.maximum(dy, 0) ** 2)
            dentro = np.minimum(np.maximum(dx, dy), 0)
            d = fora + dentro - raio * k
            return np.clip(0.5 - d, 0.0, 1.0)

        self.pintar(x, y, x + w, y + h, cob, cor, a)

    def linha(self, pontos, largura, cor, a=1.0, fechada=False):
        """Traço com pontas redondas. `pontos` em desenho."""
        k = self.k
        P = np.array(pontos, float) * k
        if fechada:
            P = np.vstack([P, P[:1]])
        raio = largura * k / 2.0
        xmin, ymin = P.min(0) - raio - 2
        xmax, ymax = P.max(0) + raio + 2

        def cob(X, Y):
            d = np.full(X.shape, np.inf)
            for (ax, ay), (bx, by) in zip(P[:-1], P[1:]):
                vx, vy = bx - ax, by - ay
                l2 = vx * vx + vy * vy
                if l2 < 1e-9:
                    l2 = 1e-9
                t = np.clip(((X - ax) * vx + (Y - ay) * vy) / l2, 0.0, 1.0)
                px = ax + vx * t - X
                py = ay + vy * t - Y
                d = np.minimum(d, np.sqrt(px * px + py * py))
            return np.clip(raio - d + 0.5, 0.0, 1.0)

        self.pintar(xmin / k, ymin / k, xmax / k, ymax / k, cob, cor, a)

    def elipse_deriva(self, x, y, rad, sy, col, a0, a55):
        """paintDrifts: degradê de 3 paradas num círculo achatado (scale(1, sy)). Parada 0 e 0.55 na cor `col`
        (alfa a0 e a55); a última vai para preto transparente. O canvas interpola isso de forma reta (cor vai
        para preto junto com o alfa), então a borda escurece: é o que se reproduz aqui."""
        k = self.k
        cor_base = rgb(col)

        def dist(X, Y):
            dx = X - x * k
            dy = (Y - y * k) / sy
            return np.sqrt(dx * dx + dy * dy) / (rad * k)

        def cob(X, Y):
            d = dist(X, Y)
            return np.where(d < 0.55, a0 + (a55 - a0) * (d / 0.55), np.where(d < 1.0, a55 * (1.0 - d) / 0.45, 0.0))

        def cor(X, Y):
            d = dist(X, Y)
            fator = np.clip((1.0 - d) / 0.45, 0.0, 1.0)  # 1 até 0.55; cai a 0 na borda
            fator = np.where(d < 0.55, 1.0, fator)
            return cor_base * fator[..., None]

        m = rad + 1
        self.pintar(x - m, y - m, x + m, y + m, cob, cor, 1.0)

    def salvar(self, nome, q=QUALIDADE):
        arr = np.clip(self.img * 255.0 + 0.5, 0, 255).astype(np.uint8)
        im = Image.fromarray(arr)
        if self.img[..., 3].min() >= 0.999:
            im = im.convert('RGB')
        os.makedirs(SAIDA, exist_ok=True)
        caminho = os.path.join(SAIDA, nome)
        im.save(caminho, 'WEBP', quality=q, method=6)
        print(f'{nome}: {im.size[0]}x{im.size[1]}, {os.path.getsize(caminho) // 1024} KB')


# ---------------- Helpers em comum (as funções antigas de BiomeScenery.ts / sceneryTextures.ts) ----------------

def pick(r, lista):
    return lista[int(r.random() * len(lista))]


def ruido_manchas(t, r, w, h, cols, n):
    """paintNoise: manchas radiais de cor (alfa 0.35..0.8), raio 14..66."""
    for _ in range(n):
        x = r.random() * w
        y = r.random() * h
        rad = 14 + r.random() * 52
        col = pick(r, cols)
        ga = 0.35 + r.random() * 0.45
        t.radial(x, y, rad, col, ga, col, 0.0)


def ruido_deriva(t, r, w, h, n, deriva):
    """paintDrifts: acúmulos claros ou vales escuros, esticados (scale(1, 0.5..0.9))."""
    for _ in range(n):
        x = r.random() * w
        y = r.random() * h
        rad = 40 + r.random() * 110
        lit = r.random() < 0.6
        col = deriva[0] if lit else deriva[1]
        a0 = 0.22 if lit else 0.2
        a55 = 0.1 if lit else 0.09
        sy = 0.5 + r.random() * 0.4
        t.elipse_deriva(x, y, rad, sy, col, a0, a55)


def luz_filtrada(t, r, w, h, n):
    """paintSunDapple: manchas quentes (60%) ou frescas, alfa 0.12."""
    for _ in range(n):
        x = r.random() * w
        y = r.random() * h
        rad = 30 + r.random() * 90
        cor = '#fff096' if r.random() < 0.6 else '#14321e'
        t.radial(x, y, rad, cor, 0.12, cor, 0.0)


def pontinhos(t, r, w, h, n, paleta):
    """paintFlowers do gramado (sceneryTextures.ts): pontinhos simples, raio 1.6..2.8."""
    for _ in range(n):
        t.disco(r.random() * w, r.random() * h, 1.6 + r.random() * 1.2, pick(r, paleta), 1.0)


def detalhe(t, r, w, h, paleta, n, relva_se_verde=True):
    """paintDetail (planície): 55% tufos de grama com ponta clara, o resto pedrinhas."""
    for _ in range(n):
        x = r.random() * w
        y = r.random() * h
        col = pick(r, paleta)
        alfa = 0.35 + r.random() * 0.4
        k = r.random()
        if k < 0.55 and relva_se_verde:
            ponta = '#b8dc6a' if r.random() < 0.35 else col
            for s in range(4):
                tx = x + s * 2
                topo = (tx + (r.random() - 0.5) * 5, y - 4 - r.random() * 6)
                t.linha([(tx, y), topo], 1.4, ponta, alfa)
        else:
            t.disco(x, y, 1 + r.random() * 2.5, col, alfa)


def flores(t, r, w, h, n, paleta=PLAN_FLOWERS):
    """paintFlowers: pequenos grupos de 2 a 6 florzinhas com sombra."""
    for _ in range(n):
        cx = r.random() * w
        cy = r.random() * h
        col = pick(r, paleta)
        for _ in range(2 + int(r.random() * 5)):
            x = cx + (r.random() - 0.5) * 18
            y = cy + (r.random() - 0.5) * 12
            t.disco(x + 0.8, y + 1, 2.2, '#1e3c14', 0.35)
            t.disco(x, y, 1.8 + r.random() * 0.8, col, 1.0)


# ---------------- Texturas ----------------

def chao_planicie():
    """Chão da planície (board e pátio): 8 x 8 tiles (64 px de desenho por tile, saída 2x). Repete sem costura."""
    r = random.Random(101)
    t = Tela(512, 512, k=2, fundo=PLAN_GROUND[0])
    ruido_manchas(t, r, 512, 512, PLAN_GROUND, 138)
    ruido_deriva(t, r, 512, 512, 30, PLAN_DRIFT)
    luz_filtrada(t, r, 512, 512, 4)
    detalhe(t, r, 512, 512, PLAN_DETAIL, 295)
    flores(t, r, 512, 512, 23)
    t.salvar('chao_planicie.webp')


def chao_fora():
    """Chão de fora do tabuleiro (planície): 4 x 4 tiles, saída 2x."""
    r = random.Random(102)
    t = Tela(256, 256, k=2, fundo=PLAN_OUTER[0])
    ruido_manchas(t, r, 256, 256, PLAN_OUTER, 90)
    ruido_deriva(t, r, 256, 256, 60, PLAN_DRIFT)
    luz_filtrada(t, r, 256, 256, 10)
    detalhe(t, r, 256, 256, PLAN_DETAIL, 160)
    flores(t, r, 256, 256, 8)
    t.salvar('chao_fora.webp')


def grama_vila():
    """Grama repetível (4 x 4 tiles): manchas, folhinhas e florzinhas. Usada na vila e no terreno em volta."""
    r = random.Random(11)
    w = h = 256
    t = Tela(w, h, k=2, fundo=GRASS[0])
    for _ in range(int(w * h / 900)):
        x = r.random() * w
        y = r.random() * h
        rad = 8 + r.random() * 26
        c1 = pick(r, GRASS)
        c2 = pick(r, GRASS)
        t.radial(x, y, rad, c1, 0.8, c2, 0.0)
    for _ in range(int(w * h / 40)):
        x = r.random() * w
        y = r.random() * h
        cor = pick(r, GRASS_BLADE)
        t.linha([(x, y), (x + (r.random() - 0.5) * 3, y - 2 - r.random() * 4)], 1.2, cor, 0.6)
    pontinhos(t, r, w, h, 10, GRASS_FLOWERS)
    t.salvar('grama_vila.webp')


def losango_vila():
    """Pavimento em losangos com rejunte musgoso (4 x 4 tiles, repetível)."""
    r = random.Random(5)
    w = h = 256
    t = Tela(w, h, k=2, fundo=GROUT)
    s = 32.0  # meia-diagonal do losango, em desenho
    inset = 1.3
    for j in range(-1, 10):
        for i in range(-1, 10):
            if (i + j) % 2 != 0:
                continue
            cx = i * s
            cy = j * s
            cor = pick(r, PAVING)
            e = s - inset
            t.pintar(cx - e - 1, cy - e - 1, cx + e + 1, cy + e + 1,
                     _losango_cob(cx, cy, s - inset), cor, 1.0)
            # luz no canto de cima, sombra no de baixo
            t.linha([(cx - s + inset + 1, cy), (cx, cy - s + inset + 1), (cx + s - inset - 1, cy)], 1.2, '#fffaeb', 0.45)
            t.linha([(cx - s + inset + 1, cy), (cx, cy + s - inset - 1), (cx + s - inset - 1, cy)], 1.2, '#5a5037', 0.25)
    for _ in range(int(w * h / 2500)):
        x = r.random() * w
        y = r.random() * h
        rad = 4 + r.random() * 14
        if r.random() < 0.5:
            t.radial(x, y, rad, '#96875f', 0.07, '#000000', 0.0)
        else:
            t.radial(x, y, rad, '#fffaeb', 0.10, '#000000', 0.0)
    t.salvar('losango_vila.webp')


def _losango_cob(cx, cy, e, k=2):
    """Losango de meia-diagonal e (em desenho): |dx| + |dy| <= e, com borda de 1 px."""
    def cob(X, Y):
        d = np.abs(X - cx * k) + np.abs(Y - cy * k)
        return np.clip((e * k - d) / math.sqrt(2) + 0.5, 0.0, 1.0)

    return cob


def arenito():
    """Blocos de arenito (muros e casas): 128 px de desenho, saída 4x, repete."""
    r = random.Random(3)
    t = Tela(128, 128, k=4, fundo='#b8a47c')
    bh = 16
    for row in range(128 // bh):
        off = 16 if row % 2 else 0
        x = -32
        while x < 128:
            cor = pick(r, SANDSTONE)
            t.retangulo(x + off + 1, row * bh + 1, 30, bh - 2, cor)
            t.retangulo(x + off + 1, row * bh + 1, 30, 2, '#fffaeb', 0.35)
            x += 32
    t.salvar('arenito.webp')


def tufo():
    """Tufo de grama em billboard (64 px de desenho, fundo transparente)."""
    r = random.Random(21)
    t = Tela(64, 64, k=2)
    for _ in range(22):
        x = 10 + r.random() * 44
        hgt = 20 + r.random() * 38
        cor = pick(r, TUFT_COLS)
        largura = 2 + r.random() * 2
        cx, cy = x + (r.random() - 0.5) * 10, 64 - hgt * 0.6
        fx, fy = x + (r.random() - 0.5) * 16, 64 - hgt
        pts = []
        for i in range(17):
            u = i / 16
            pts.append(((1 - u) ** 2 * x + 2 * (1 - u) * u * cx + u * u * fx, (1 - u) ** 2 * 64 + 2 * (1 - u) * u * cy + u * u * fy))
        t.linha(pts, largura, cor, 1.0)
    t.salvar('tufo_grama.webp')


def raio_floresta():
    """Raio de luz da floresta: faixa vertical de degradê (64 x 256 de desenho, saída 2x, com alfa)."""
    t = Tela(64, 256, k=2)

    def cob(X, Y):
        u = X / (64 * 2)
        v = Y / (256 * 2)
        ax = 1.0 - np.abs(u - 0.5) * 2.0
        ay = np.where(v < 0.25, 0.9 * v / 0.25, 0.9 - (v - 0.25) / 0.75 * 0.85)
        return np.clip(ax * ay, 0.0, 1.0)

    t.pintar(0, 0, 64, 256, cob, '#ffffff', 1.0)
    t.salvar('raio_floresta.webp')


def muralha(seed, nome):
    """Blocos grandes de muralha (cinza frio), 256 de desenho, saída 2x: uma variante por seed (ponte)."""
    r = random.Random(seed)
    S = 256
    t = Tela(S, S, k=2, fundo='#3a3c42')
    rowH = 42
    for row in range(int(math.ceil(S / rowH))):
        x = -36 if row % 2 else 0
        while x < S:
            w = 60 + int(r.random() * 3) * 14
            _pedra(t, x + 2, row * rowH + 2, w - 4, rowH - 4, pick(r, STONE_COLS), r, 2)
            if x + w > S:
                _pedra(t, x + 2 - S, row * rowH + 2, w - 4, rowH - 4, pick(r, STONE_COLS), r, 2)
            x += w
    for _ in range(5):
        _trinca(t, r.random() * S, r.random() * S, 14 + r.random() * 24, r)
    for _ in range(6):
        _musgo(t, r.random() * S, S * (0.6 + r.random() * 0.4), 8 + r.random() * 18)
    t.salvar(nome)


def _pedra(t, x, y, w, h, base, r, rnd_):
    """stone(): base arredondada, 4 manchas claras/escuras, bisel claro em cima e escuro embaixo."""
    t.retangulo(x, y, w, h, base, 1.0, raio=rnd_)
    for _ in range(4):
        cx = x + r.random() * w
        cy = y + r.random() * h
        rad = min(w, h) * (0.3 + r.random() * 0.5)
        claro = r.random() > 0.5
        t.radial(cx, cy, rad, '#ffffff' if claro else '#000000', 0.07 if claro else 0.09, '#000000', 0.0, recorte=(x, y, w, h))
    t.retangulo(x + 2, y + 1, w - 4, 2, '#ffffff', 0.10)
    t.retangulo(x + 2, y + h - 3, w - 4, 2, '#000000', 0.22)


def _trinca(t, x, y, comp, r):
    pts = [(x, y)]
    cx, cy = x, y
    a = r.random() * math.pi * 2
    for _ in range(5):
        a += (r.random() - 0.5) * 1.2
        cx += math.cos(a) * comp / 5
        cy += math.sin(a) * comp / 5
        pts.append((cx, cy))
    t.linha(pts, 1.2, '#14161c', 0.55)


def _musgo(t, x, y, rad):
    t.radial(x, y, rad, '#4e603a', 0.55, '#4e603a', 0.0)


def ponte_lateral():
    """Lateral da ponte: blocos + arco escuro + aduelas + escorrido de umidade. Desenho 512 x 256, saída 2x."""
    r = random.Random(51)
    t = Tela(512, 256, k=2)
    # duas muralhas lado a lado (a textura de blocos da seed 51 repete na lateral)
    for x0 in (0, 256):
        base = Tela(256, 256, k=2, fundo='#3a3c42')
        rr = random.Random(51)
        rowH = 42
        for row in range(6):
            x = -36 if row % 2 else 0
            while x < 256:
                w = 60 + int(rr.random() * 3) * 14
                _pedra(base, x + 2, row * rowH + 2, w - 4, rowH - 4, pick(rr, STONE_COLS), rr, 2)
                if x + w > 256:
                    _pedra(base, x + 2 - 256, row * rowH + 2, w - 4, rowH - 4, pick(rr, STONE_COLS), rr, 2)
                x += w
        for _ in range(5):
            _trinca(base, rr.random() * 256, rr.random() * 256, 14 + rr.random() * 24, rr)
        for _ in range(6):
            _musgo(base, rr.random() * 256, 256 * (0.6 + rr.random() * 0.4), 8 + rr.random() * 18)
        t.img[:, x0 * 2:(x0 + 256) * 2] = base.img
    cx, top = 256, 70
    yarco = top + 120
    # arco escuro: retângulo para baixo + meia elipse em cima (desenho em unidades; X, Y vêm em px de textura)
    def arco(X, Y):
        Xd, Yd = X / 2, Y / 2
        dentro_pilar = (np.abs(Xd - cx) <= 150) & (Yd >= yarco)
        q = np.sqrt(((Xd - cx) / 150.0) ** 2 + ((Yd - yarco) / 120.0) ** 2)
        meia = (Yd < yarco) & (q <= 1.0)
        return np.where(dentro_pilar | meia, 1.0, 0.0)

    t.pintar(0, 0, 512, 256, arco, '#0b0e16', 1.0)
    # aduelas: anel da meia elipse (rx 158, ry 128, espessura 10), e 13 tacos radiais
    def aduela(X, Y):
        Xd, Yd = X / 2, Y / 2
        q = np.sqrt(((Xd - cx) / 158.0) ** 2 + ((Yd - yarco) / 128.0) ** 2)
        dist = np.abs(q - 1.0) * 158.0
        return np.where(Yd <= yarco, np.clip(5.0 - dist + 0.5, 0.0, 1.0), 0.0)

    t.pintar(0, 0, 512, 256, aduela, '#8a8c92', 1.0)
    for i in range(13):
        a = math.pi + (i / 12) * math.pi
        t.linha([(cx + math.cos(a) * 150, yarco + math.sin(a) * 120), (cx + math.cos(a) * 166, yarco + math.sin(a) * 136)], 2, '#3a3c42', 1.0)
    # escorrido de umidade: degradê linear de 55% da altura até o chão
    def escorrido(X, Y):
        v = np.clip((Y / 2 - 256 * 0.55) / (256 * 0.45), 0.0, 1.0)
        return v * 0.55

    t.pintar(0, 0, 512, 256, escorrido, '#0a141e', 1.0)
    for _ in range(6):
        _musgo(t, r.random() * 512, 256 * (0.7 + r.random() * 0.3), 14 + r.random() * 20)
    t.salvar('ponte_lateral.webp')


def runa_portal():
    """Círculo rúnico do portal do spawn: 128 de desenho com centro em (64, 64), saída 2x com alfa."""
    t = Tela(128, 128, k=2)
    c = (64, 64)
    t.linha([(c[0] + math.cos(a) * 56, c[1] + math.sin(a) * 56) for a in np.linspace(0, math.pi * 2, 97)], 3, '#ffffff', 0.95, fechada=True)
    t.linha([(c[0] + math.cos(a) * 44, c[1] + math.sin(a) * 44) for a in np.linspace(0, math.pi * 2, 97)], 1.5, '#ffffff', 0.95, fechada=True)
    for i in range(12):
        ang = (i / 12) * math.pi * 2
        ca, sa = math.cos(ang), math.sin(ang)

        def gira(px, py):
            return (c[0] + px * ca - py * sa, c[1] + px * sa + py * ca)

        # tracinho radial (x -2..2, y -54..-45) girado e a ponta em chevron
        pts = [gira(-2, -54), gira(2, -54), gira(2, -45), gira(-2, -45)]
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        t.pintar(min(xs) - 1, min(ys) - 1, max(xs) + 1, max(ys) + 1, _poligono_cob(pts, 2), '#ffffff', 0.9)
        t.linha([gira(-5, -38), gira(0, -30), gira(5, -38)], 1.5, '#ffffff', 0.95)
    t.radial(c[0], c[1], 40, '#ffffff', 0.5, '#ffffff', 0.0)
    t.salvar('runa_portal.webp')


def _poligono_cob(pts, k):
    """Cobertura de um quadrilátero convexo (em desenho), por semiplanos."""
    P = [(x * k, y * k) for x, y in pts]

    def cob(X, Y):
        # convexo: dentro quando todos os lados dão o mesmo sinal (vale para qualquer orientação)
        pos = np.ones(X.shape, bool)
        neg = np.ones(X.shape, bool)
        for i in range(len(P)):
            ax, ay = P[i]
            bx, by = P[(i + 1) % len(P)]
            cross = (bx - ax) * (Y - ay) - (by - ay) * (X - ax)
            pos &= cross >= 0
            neg &= cross <= 0
        return (pos | neg).astype(np.float32)

    return cob


def grade_casa():
    """Grade sutil de uma casa (64 de desenho, transparente, repete tile a tile): linha no topo e na esquerda."""
    t = Tela(64, 64, k=2)
    cor = '#3c3219'
    t.retangulo(0, 0, 0.5, 64, cor, 0.16)
    t.retangulo(0, 0, 64, 0.5, cor, 0.16)
    t.salvar('grade_casa.webp')


def laje_portao():
    """Laje do portão: uma casa (64 de desenho) com duas placas de pedra contornadas."""
    t = Tela(64, 64, k=2, fundo=GATE_STONE)
    for k_ in range(2):
        x = 3 + k_ * 30
        t.linha([(x, 4), (x + 28, 4), (x + 28, 4 + 56), (x, 4 + 56)], 2, '#28241e', 0.7, fechada=True)
    t.salvar('laje_portao.webp')


def main():
    chao_planicie()
    chao_fora()
    grama_vila()
    losango_vila()
    arenito()
    tufo()
    raio_floresta()
    for seed, nome in ((12, 'bloco_ponte_12.webp'), (21, 'bloco_ponte_21.webp'), (57, 'bloco_ponte_57.webp')):
        muralha(seed, nome)
    ponte_lateral()
    runa_portal()
    grade_casa()
    laje_portao()


if __name__ == '__main__':
    main()
