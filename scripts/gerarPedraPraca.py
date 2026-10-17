#!/usr/bin/env python3
"""
Pedra clara da praça e do tabuleiro da Ponte de Valdrec (zona 'bridge').

Rode a partir da raiz do projeto (precisa de Pillow e numpy):

    python3 scripts/gerarPedraPraca.py

Saída: public/textures/cenario/pedra_praca.webp (1024 px, repete sem costura, 4×4 tiles por cópia).
Sementes fixas: rodar de novo gera o mesmo arquivo.

Por que existe: a praça usava pedra_cinza.webp (97 px, marrom-acinzentada, com filtro azul),
e à noite ela ficava escura demais. O tabuleiro apontava para pedra_lousa.webp, que já não existia.
Esta textura é calcário claro em lajes irregulares, com juntas, bisel, desgaste, grão e trincas.

Receita:
  1. Voronoi com peso aditivo e borda periódica: lajes poligonais de tamanhos variados.
  2. Juntas finas e claras (nunca pretas); bisel das bordas com luz de cima-esquerda.
  3. Tom quente por laje, desgaste (centro mais claro), cavidades, lascas, trincas finas e grão.
Todo ruído é filtrado no domínio da frequência (FFT periódica), por isso não há costura.

Para mudar o tom ou a quantidade de detalhe, mude as constantes abaixo e rode de novo.
"""

import math
import os

import numpy as np
from PIL import Image

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SAIDA = os.path.join(RAIZ, 'public', 'textures', 'cenario', 'pedra_praca.webp')
QUALIDADE = 88

SEMENTE = 20261017
N = 1024                       # lado da textura (px)
G = 10                         # lajes-base por lado
CS = N / G                     # tamanho médio da laje (px)
PESO_MAX = 0.20                # variação de tamanho das lajes (fração de CS)

# Cores sRGB
BASE = np.array([206.0, 196.0, 178.0])     # calcário claro e quente
VAR_TOM = np.array([6.0, 6.0, 5.5])        # variação de tom por laje
VAR_MATIZ = np.array([2.0, 0.0, -3.0])     # deriva quente/fria por laje
JUNTA = np.array([132.0, 123.0, 108.0])    # rejunte claro-quente (antes 120,111,97: escuro demais)
PISO = np.array([110.0, 102.0, 92.0])      # nenhum pixel abaixo disso

# Relevo e desgaste
BISEL = 6.0           # largura do bisel (px, aprox.)
AMP_BISEL = 50.0      # intensidade da luz no bisel
AMP_DESGASTE = 5.0    # centro mais claro que a borda
AMP_CAVIDADE = 22.0   # cavidades pequenas (antes 16)
AMP_TRINCA = 40.0     # trincas finas
PROB_TRINCA = 0.30    # fração de lajes com trinca (antes 0,22)
AMP_LASCA = 14.0      # lascas claras nas bordas das lajes

rs = np.random.default_rng(SEMENTE)
jit = rs.uniform(0.15, 0.85, size=(G, G, 2))             # semente dentro da célula
peso = rs.uniform(-PESO_MAX, PESO_MAX, size=(G, G)) * CS  # lajes maiores/menores
tom = rs.standard_normal(G * G)
matiz = rs.standard_normal(G * G)
tem_trinca = rs.uniform(size=G * G) < PROB_TRINCA

rn = np.random.default_rng(SEMENTE + 1)
rl = np.random.default_rng(SEMENTE + 2)     # lascas: semente própria, para não mudar os ruídos acima


def ruido():
    return rn.standard_normal((N, N))


FR = np.fft.fftfreq(N)
FR2 = FR[:, None] ** 2 + FR[None, :] ** 2


def suaviza(a, sigma):
    """Gaussiana periódica por FFT: o campo não tem borda, repete sem costura."""
    H = np.exp(-2.0 * np.pi ** 2 * sigma ** 2 * FR2)
    return np.real(np.fft.ifft2(np.fft.fft2(a) * H))


def z(a):
    return (a - a.mean()) / (a.std() + 1e-12)


def grad_x(h):
    return 0.5 * (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1))


def grad_y(h):
    return 0.5 * (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0))


# ---------- 1. Voronoi periódico (F1, F2 e id da laje) ----------
ys, xs = np.mgrid[0:N, 0:N].astype(np.float64)
xs += 0.5
ys += 0.5
cxi = np.floor(xs / CS).astype(np.int64)
cyi = np.floor(ys / CS).astype(np.int64)

F1 = np.full((N, N), np.inf)
F2 = np.full((N, N), np.inf)
IDX = np.zeros((N, N), dtype=np.int64)
for oy in range(-2, 3):
    for ox in range(-2, 3):
        ux = cxi + ox                 # célula sem dobrar (posição real no plano)
        uy = cyi + oy
        gx = ux % G                    # célula dobrada (índice real)
        gy = uy % G
        sx = (ux + jit[gy, gx, 0]) * CS
        sy = (uy + jit[gy, gx, 1]) * CS
        # deslocamento constante PESO_MAX*CS só para manter d >= 0 (não muda a ordem)
        d = np.hypot(xs - sx, ys - sy) - peso[gy, gx] + PESO_MAX * CS
        cid = gy * G + gx
        perto = d < F1
        F2 = np.where(perto, F1, np.minimum(F2, d))
        IDX = np.where(perto, cid, IDX)
        F1 = np.where(perto, d, F1)

E = F2 - F1                            # ~0 na junta, cresce para dentro da laje

# ---------- 2. Juntas e bisel ----------
var_junta = 0.6 * np.clip(z(suaviza(ruido(), 14.0)), -2.5, 2.5)
t = np.clip((4.2 + var_junta - E) / 3.0, 0.0, 1.0)
J = t * t * (3.0 - 2.0 * t)            # 1 = rejunte, 0 = pedra

s = np.clip((E - 2.0) / (2.0 * BISEL), 0.0, 1.0)
h = s * s * (3.0 - 2.0 * s)            # altura do bisel (0 na junta, 1 no miolo)
bisel = AMP_BISEL * (grad_x(h) + grad_y(h))   # luz de cima-esquerda

# ---------- 3. Desgaste, manchas, grão, cavidades, trincas, lascas ----------
desgaste = AMP_DESGASTE * np.clip((E - 4.0) / 24.0, 0.0, 1.0)
mancha = 2.6 * z(suaviza(ruido(), 7.0))
grao_m = 1.8 * z(suaviza(ruido(), 1.6))
grao_f = 2.6 * z(suaviza(ruido(), 0.55))      # grão fino mais visível de perto (antes 1,8)

cz = z(suaviza(ruido(), 0.9))
cavidade = AMP_CAVIDADE * np.clip((cz - 2.2) / 0.6, 0.0, 1.0)

tz = z(suaviza(ruido(), 22.0))
faixa = np.clip(1.0 - np.abs(tz) / 0.025, 0.0, 1.0)
trinca = AMP_TRINCA * faixa * tem_trinca[IDX] * (E > 6.0)

lz = z(suaviza(rl.standard_normal((N, N)), 1.2))
lasca = AMP_LASCA * np.clip((lz - 2.3) / 0.5, 0.0, 1.0) * (E < 7.0)   # só perto da junta

# ---------- 4. Composição ----------
cor_laje = (BASE[None, :]
            + tom[:, None] * VAR_TOM[None, :]
            + matiz[:, None] * VAR_MATIZ[None, :])
C = cor_laje[IDX]                                  # (N, N, 3)

luz = bisel + desgaste + mancha + grao_m + grao_f - cavidade - trinca + lasca
C = C + luz[..., None]

junta_cor = JUNTA[None, None, :] + (5.0 * z(suaviza(ruido(), 1.0)))[..., None]
C = C * (1.0 - J[..., None]) + junta_cor * J[..., None]

C = np.clip(C, PISO, 255.0)
img = np.clip(np.round(C), 0, 255).astype(np.uint8)

# ---------- 5. Verificações (falham alto se a textura sair do combinado) ----------
f = img.astype(np.float64)
lum = 0.299 * f[..., 0] + 0.587 * f[..., 1] + 0.114 * f[..., 2]
media = f.reshape(-1, 3).mean(axis=0)
desvio_L = lum.std()
costura_h = np.abs(f[:, -1, :] - f[:, 0, :]).mean()     # coluna da direita x esquerda
costura_v = np.abs(f[-1, :, :] - f[0, :, :]).mean()     # linha de baixo x de cima
loc = np.stack([suaviza(f[..., c], 1.0) for c in range(3)], axis=-1)
min_local = loc.reshape(-1, 3).min(axis=0)

print('média RGB:', np.round(media, 1).tolist())
print('desvio padrão da luminância:', round(float(desvio_L), 2))
print('costura horizontal:', round(float(costura_h), 2), '· vertical:', round(float(costura_v), 2))
print('mínimo da média local (σ 1):', np.round(min_local, 1).tolist())
print('fração de rejunte:', round(float((J > 0.5).mean()), 4))

assert 190 <= media[0] <= 208 and 180 <= media[1] <= 200 and 162 <= media[2] <= 186, 'média fora da faixa'
assert 18 <= desvio_L <= 28, 'contraste fora da faixa'
assert costura_h < 6 and costura_v < 6, 'costura visível'
assert np.all(min_local >= PISO + 2), 'mancha escura abaixo do piso'

# ---------- 6. Arquivo ----------
os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
Image.fromarray(img).save(SAIDA, 'WEBP', quality=QUALIDADE, method=6)
print(f'{os.path.relpath(SAIDA, RAIZ)}: {N}x{N}, {os.path.getsize(SAIDA) // 1024} KB')
