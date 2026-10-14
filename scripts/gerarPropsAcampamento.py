#!/usr/bin/env python3
"""
Gera os GLB procedurais dos acampamentos dos monstros (public/models/props/camp/), sem Blender.

Peças (unidade = 1 tile do jogo, base em y = 0):
  totem_caveira.glb   haste de madeira com crânio (órbitas e focinho pintados na textura)
  pilha_ossos.glb     ossos com pontas e 3 crânios por cima
  buraco_toca.glb     disco de terra escura com borda de monte (toca no chão, decalque com transparência)
  marca_queimado.glb  disco de queimado (carvão e cinza, borda suave; 0,01 acima do chão para não brigar com o chão)
  estandarte_orc.glb  haste de madeira com tecido vermelho e emblema dourado

Cada GLB tem uma malha, um material e uma textura PNG 256x256 embutida (gerada aqui por cor e ruído).
A textura é um atlas: metade esquerda e metade direita (ou a imagem toda) para as peças de cada parte.

Uso (na raiz do projeto):  python3 scripts/gerarPropsAcampamento.py
Precisa de PIL e numpy (já instalados no ambiente). Depois, confira com: node scripts/auditar_glb.cjs <arquivo>.
"""
import io
import json
import math
import os
import struct
import sys

import numpy as np
from PIL import Image

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SAIDA = os.path.join(RAIZ, 'public', 'models', 'props', 'camp')
TEX = 256  # lado da textura (px)

# retângulos do atlas em coordenadas 0..1 (u0, v0, largura, altura); v = 0 é o topo da imagem (glTF)
ESQ = (0.0, 0.0, 0.5, 1.0)
DIR = (0.5, 0.0, 0.5, 1.0)
TUDO = (0.0, 0.0, 1.0, 1.0)


# ---------------------------------------------------------------- geometria
class Parte:
    """Vértices (pos, nor, uv local 0..1) e triângulos de uma peça."""

    def __init__(self, pos, nor, uv, tris):
        self.pos = np.asarray(pos, float).reshape(-1, 3)
        self.nor = np.asarray(nor, float).reshape(-1, 3)
        self.uv = np.asarray(uv, float).reshape(-1, 2)
        self.tris = np.asarray(tris, int).reshape(-1, 3)


def lathe(perfil, seg=14, suave=True):
    """Superfície de revolução em torno de Y. `perfil`: lista de (raio, y, v) do fundo ao topo.
    suave=True: normais médias nos pontos do perfil (curvas lisas). suave=False: aresta viva (cilindros, caixas)."""
    segs = list(zip(perfil[:-1], perfil[1:]))
    segn = []
    for (r0, y0, _), (r1, y1, _) in segs:
        dr, dy = r1 - r0, y1 - y0
        L = math.hypot(dr, dy) or 1.0
        segn.append((dy / L, -dr / L))  # normal 2D para fora (ordem fundo → topo)
    pos, nor, uv, tris = [], [], [], []

    def anel(r, y, v, n2):
        base = len(pos)
        for j in range(seg + 1):
            a = 2 * math.pi * j / seg
            ca, sa = math.cos(a), math.sin(a)
            pos.append((r * ca, y, r * sa))
            nor.append((n2[0] * ca, n2[1], n2[0] * sa))
            uv.append((j / seg, v))
        return base

    if suave:
        linhas = []
        for i, (r, y, v) in enumerate(perfil):
            ns = []
            if i > 0:
                ns.append(segn[i - 1])
            if i < len(segn):
                ns.append(segn[i])
            nx = sum(n[0] for n in ns)
            ny = sum(n[1] for n in ns)
            L = math.hypot(nx, ny) or 1.0
            linhas.append(anel(r, y, v, (nx / L, ny / L)))
        for i in range(len(segs)):
            for j in range(seg):
                a0, a1 = linhas[i] + j, linhas[i] + j + 1
                b0, b1 = linhas[i + 1] + j, linhas[i + 1] + j + 1
                tris += [(a0, b0, b1), (a0, b1, a1)]
    else:
        for i, ((r0, y0, v0), (r1, y1, v1)) in enumerate(segs):
            ra = anel(r0, y0, v0, segn[i])
            rb = anel(r1, y1, v1, segn[i])
            for j in range(seg):
                a0, a1 = ra + j, ra + j + 1
                b0, b1 = rb + j, rb + j + 1
                tris += [(a0, b0, b1), (a0, b1, a1)]
    return Parte(pos, nor, uv, tris)


def elipsoide(centro, raios, seg=14, aneis=10):
    """Elipsoide (crânio, cabeça de osso): perfil de esfera unitária esticado pelos raios."""
    perfil = [(math.sin(math.pi * k / aneis), -math.cos(math.pi * k / aneis), 1 - k / aneis) for k in range(aneis + 1)]
    p = lathe(perfil, seg, suave=True)
    return transforma(p, S=raios, T=centro)


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], float)


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], float)


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], float)


def transforma(p, S=(1, 1, 1), R=None, T=(0, 0, 0)):
    """Escala (S), gira (R) e move (T) uma parte. A normal usa a transposta inversa (S^-1, depois R)."""
    S = np.asarray(S, float)
    pos = p.pos * S
    nor = p.nor / S
    nor = nor / (np.linalg.norm(nor, axis=1, keepdims=True) + 1e-12)
    if R is not None:
        pos = pos @ R.T
        nor = nor @ R.T
    pos = pos + np.asarray(T, float)
    return Parte(pos, nor, p.uv, p.tris)


def grade_plana(larg, z, nx, ny, y_topo, y_base):
    """Tecido plano em z: topo reto em y_topo e borda de baixo y_base(x) (entalhe em V para o estandarte)."""
    pos, nor, uv, tris = [], [], [], []
    for j in range(ny + 1):
        t = j / ny
        for i in range(nx + 1):
            s = i / nx
            x = -larg / 2 + larg * s
            y = y_topo - t * (y_topo - y_base(x))
            pos.append((x, y, z))
            nor.append((0, 0, 1))
            uv.append((s, t))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            b = a + nx + 1
            tris += [(a, b, b + 1), (a, b + 1, a + 1)]
    return Parte(pos, nor, uv, tris)


def disco_plano(perfil, R=0.5, seg=24):
    """Disco de decalque: perfil de fora para dentro (normais para cima); UV planar (0..1 pelo diâmetro)."""
    p = lathe(perfil, seg, suave=True)
    uv = np.stack([0.5 + p.pos[:, 0] / (2 * R), 0.5 + p.pos[:, 2] / (2 * R)], axis=1)
    return Parte(p.pos, p.nor, uv, p.tris)


def concatena(itens):
    """Junta (parte, retângulo do atlas) numa malha só. Corrige o sentido dos triângulos pela normal."""
    pos, nor, uv, tris = [], [], [], []
    for p, (u0, v0, w, h) in itens:
        base = sum(len(a) for a in pos)  # deslocamento = vértices já juntados (não o número de partes)
        pos.append(p.pos)
        nor.append(p.nor)
        uv.append(np.stack([u0 + w * p.uv[:, 0], v0 + h * p.uv[:, 1]], axis=1))
        tris.append(p.tris + base)
    P = np.concatenate(pos)
    N = np.concatenate(nor)
    U = np.concatenate(uv)
    T = np.concatenate(tris)
    a, b, c = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    fn = np.cross(b - a, c - a)
    vn = N[T[:, 0]] + N[T[:, 1]] + N[T[:, 2]]
    troca = (np.sum(fn * vn, axis=1) < 0)
    T[troca] = T[troca][:, [0, 2, 1]]
    return P, N, U, T


# ---------------------------------------------------------------- texturas (cor e ruído)
def ruido_suave(rng, forma, celula=24):
    h, w = forma
    pequeno = rng.random((max(2, h // celula), max(2, w // celula)))
    img = Image.fromarray((pequeno * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return np.asarray(img).astype(float) / 255.0


def pinta_madeira(U, V, rng):
    n1 = ruido_suave(rng, U.shape, 20)
    g = rng.random(U.shape)
    faixas = 0.5 + 0.5 * np.sin(U * 2 * math.pi * 4 + 3 * np.sin(V * 2 * math.pi * 1.2) + 4 * n1)
    t = np.clip(0.6 * faixas + 0.25 * n1 + 0.15 * g, 0, 1)
    escuro = np.array([70, 44, 26.0])
    claro = np.array([152, 104, 62.0])
    rgb = escuro + (claro - escuro) * t[..., None]
    return rgb, np.ones(U.shape)


def pinta_osso(U, V, rng):
    n1 = ruido_suave(rng, U.shape, 18)
    g = rng.random(U.shape)
    base = np.array([226, 216, 188.0])
    mancha = np.clip((n1 - 0.62) * 3, 0, 1)[..., None]
    rgb = base * (0.93 + 0.07 * g[..., None]) * (1 - 0.18 * mancha) + np.array([0, -10, -30.0]) * mancha
    return rgb, np.ones(U.shape)


def pinta_cranio(U, V, rng):
    """Osso com órbitas, focinho escuro. Olhos em U=0,25 ± 0,1 (frente do crânio), V=0,46 (um pouco acima do meio)."""
    rgb, _ = pinta_osso(U, V, rng)
    escuro = np.array([36, 26, 20.0])
    for cu in (0.25 - 0.1, 0.25 + 0.1):
        olho = ((U - cu) / 0.035) ** 2 + ((V - 0.46) / 0.085) ** 2 < 1
        rgb[olho] = escuro
    foc = ((U - 0.25) / 0.02) ** 2 + ((V - 0.6) / 0.04) ** 2 < 1
    rgb[foc] = escuro
    return rgb, np.ones(U.shape)


def pinta_queimado(U, V, rng):
    rn = np.clip(2 * np.sqrt((U - 0.5) ** 2 + (V - 0.5) ** 2), 0, 1.2)
    n1 = ruido_suave(rng, U.shape, 16)
    rnn = rn + 0.09 * (n1 - 0.5)
    xs = [0.0, 0.3, 0.55, 0.85, 1.0]
    cor = [[22, 18, 16], [30, 24, 20], [64, 50, 42], [128, 120, 110], [150, 142, 132]]
    rgb = np.stack([np.interp(rnn, xs, [c[k] for c in cor]) for k in range(3)], axis=-1)
    brasa = (rnn > 0.2) & (rnn < 0.36) & (n1 > 0.55)
    rgb[brasa] = rgb[brasa] * 0.5 + np.array([150, 70, 30.0]) * 0.5
    alfa = np.clip((0.98 - rnn) / 0.12, 0, 1)
    return rgb, alfa


def pinta_terra(U, V, rng):
    rn = np.clip(2 * np.sqrt((U - 0.5) ** 2 + (V - 0.5) ** 2), 0, 1.2)
    n1 = ruido_suave(rng, U.shape, 14)
    g = rng.random(U.shape)
    rgb = np.zeros(U.shape + (3,))
    buraco = rn < 0.44
    borda = (rn >= 0.44) & (rn < 0.7)
    fora = rn >= 0.7
    rgb[buraco] = np.array([16, 11, 8.0]) * (0.8 + 0.4 * g[buraco])[..., None]
    rgb[borda] = np.array([102, 76, 52.0]) * (0.85 + 0.25 * n1[borda])[..., None]
    pedra = borda & (n1 > 0.8)
    rgb[pedra] = np.array([150, 128, 104.0])
    rgb[fora] = np.array([80, 60, 42.0]) * (0.85 + 0.25 * n1[fora])[..., None]
    alfa = np.clip((0.99 - rn) / 0.1, 0, 1)
    return rgb, alfa


def pinta_estandarte(U, V, rng):
    """Tecido vermelho com dobras e emblema (anel dourado e disco escuro). U, V na área do tecido."""
    n1 = ruido_suave(rng, U.shape, 20)
    dobra = 0.5 + 0.5 * np.sin(U * 2 * math.pi * 3 + 0.8 * np.sin(V * 4))
    rgb = np.array([150, 28, 28.0]) * (0.8 + 0.2 * dobra[..., None] + 0.12 * (n1[..., None] - 0.5))
    du = (U - 0.5) * 0.52
    dv = (0.33 - V) * 0.72
    r = np.sqrt(du ** 2 + dv ** 2)
    ouro = np.array([206, 156, 62.0])
    rgb[(r > 0.105) & (r < 0.13)] = ouro
    rgb[r <= 0.105] = np.array([34, 26, 22.0])
    rgb[(np.abs(dv) < 0.012) & (np.abs(du) < 0.07)] = ouro
    return rgb, np.ones(U.shape)


def atlas(itens, rng):
    """Monta a textura 256x256 (PNG em bytes). itens: [(retângulo, função de pintura)]. Devolve (png, tem_alfa)."""
    img = np.zeros((TEX, TEX, 4))  # canais 0..255
    img[..., 3] = 255.0
    for (u0, v0, w, h), fn in itens:
        x0, y0 = int(round(u0 * TEX)), int(round(v0 * TEX))
        W, H = int(round(w * TEX)), int(round(h * TEX))
        U = (np.arange(W) + 0.5) / W
        V = (np.arange(H) + 0.5) / H
        UU, VV = np.meshgrid(U, V)
        rgb, alfa = fn(UU, VV, rng)
        img[y0:y0 + H, x0:x0 + W, :3] = rgb
        img[y0:y0 + H, x0:x0 + W, 3] = alfa * 255.0
    usa_alfa = bool(np.any(img[..., 3] < 255))
    arr = np.clip(img, 0, 255).astype(np.uint8)
    im = Image.fromarray(arr if usa_alfa else arr[..., :3], 'RGBA' if usa_alfa else 'RGB')
    # paleta de 64 cores sem pontilhado: o ruído fica pequeno no PNG (o GLB cabe no alvo de peso)
    im = im.quantize(colors=64, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return buf.getvalue(), usa_alfa


# ---------------------------------------------------------------- GLB (binário, sem dependências)
def escreve_glb(caminho, nome, P, N, U, T, png, com_alfa):
    buf = bytearray()
    vistas = []

    def vista(dados, alvo=None):
        while len(buf) % 4:
            buf.append(0)
        off = len(buf)
        buf.extend(dados)
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(dados)}
        if alvo:
            v['target'] = alvo
        vistas.append(v)
        return len(vistas) - 1

    acessos = []

    def acesso(v, tipo_comp, n, tipo, mn=None, mx=None):
        a = {'bufferView': v, 'componentType': tipo_comp, 'count': n, 'type': tipo}
        if mn is not None:
            a['min'] = mn
            a['max'] = mx
        acessos.append(a)
        return len(acessos) - 1

    P32 = P.astype('<f4')
    v_pos = vista(P32.tobytes(), 34962)
    a_pos = acesso(v_pos, 5126, len(P32), 'VEC3', P32.min(axis=0).tolist(), P32.max(axis=0).tolist())
    v_nor = vista(N.astype('<f4').tobytes(), 34962)
    a_nor = acesso(v_nor, 5126, len(N), 'VEC3')
    v_uv = vista(U.astype('<f4').tobytes(), 34962)
    a_uv = acesso(v_uv, 5126, len(U), 'VEC2')
    if len(P) < 65536:
        idx = T.astype('<u2')
        ct = 5123
    else:
        idx = T.astype('<u4')
        ct = 5125
    v_idx = vista(idx.tobytes(), 34963)
    a_idx = acesso(v_idx, ct, idx.size, 'SCALAR')
    v_img = vista(png)

    material = {
        'name': nome,
        'pbrMetallicRoughness': {
            'baseColorTexture': {'index': 0},
            'metallicFactor': 0.0,
            'roughnessFactor': 0.95,
        },
        'doubleSided': True,
    }
    if com_alfa:
        material['alphaMode'] = 'BLEND'
    gltf = {
        'asset': {'version': '2.0', 'generator': 'scripts/gerarPropsAcampamento.py'},
        'scene': 0,
        'scenes': [{'nodes': [0], 'name': nome}],
        'nodes': [{'mesh': 0, 'name': nome}],
        'meshes': [{'name': nome, 'primitives': [{
            'attributes': {'POSITION': a_pos, 'NORMAL': a_nor, 'TEXCOORD_0': a_uv},
            'indices': a_idx, 'material': 0, 'mode': 4,
        }]}],
        'materials': [material],
        'textures': [{'sampler': 0, 'source': 0}],
        'images': [{'bufferView': v_img, 'mimeType': 'image/png', 'name': nome}],
        'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
        'buffers': [{'byteLength': len(buf)}],
        'bufferViews': vistas,
        'accessors': acessos,
    }
    js = json.dumps(gltf, separators=(',', ':')).encode('utf8')
    js += b' ' * ((-len(js)) % 4)
    while len(buf) % 4:
        buf.append(0)
    total = 12 + 8 + len(js) + 8 + len(buf)
    dados = struct.pack('<4sII', b'glTF', 2, total)
    dados += struct.pack('<I', len(js)) + struct.pack('<I', 0x4E4F534A) + js
    dados += struct.pack('<I', len(buf)) + struct.pack('<I', 0x004E4942) + bytes(buf)
    with open(caminho, 'wb') as f:
        f.write(dados)
    return len(dados)


def finaliza(itens_geo, nome, atlas_itens, semente):
    """Junta as partes, põe a base em y = 0, gera a textura e escreve o GLB."""
    rng = np.random.default_rng(semente)
    P, N, U, T = concatena(itens_geo)
    P = P.copy()
    P[:, 1] -= P[:, 1].min()  # base no chão: menor ponto em y = 0
    png, com_alfa = atlas(atlas_itens, rng)
    caminho = os.path.join(SAIDA, nome + '.glb')
    tam = escreve_glb(caminho, nome, P, N, U, T, png, com_alfa)
    altura = P[:, 1].max()
    larg = P[:, 0].max() - P[:, 0].min()
    prof = P[:, 2].max() - P[:, 2].min()
    print(f'{nome:18s} {tam/1024:6.1f} KB  tris {len(T):5d}  tamanho x={larg:.2f} y={altura:.2f} z={prof:.2f}  textura {len(png)/1024:.1f} KB  alfa={com_alfa}')
    return caminho


# ---------------------------------------------------------------- peças
def totem_caveira():
    # haste afunilada (madeira, lado A do atlas) e travessa com fita
    perfil = [(0.0, 0.0, 1.0), (0.05, 0.0, 1.0), (0.046, 0.06, 0.94), (0.038, 0.6, 0.4), (0.034, 1.0, 0.0), (0.0, 1.0, 0.0)]
    haste = lathe(perfil, 12, suave=True)
    trave = transforma(lathe([(0.0, -0.15, 0.5), (0.026, -0.15, 0.5), (0.026, 0.15, 0.5), (0.0, 0.15, 0.5)], 10, suave=False),
                       R=rot_z(math.pi / 2), T=(0, 0.78, 0))
    # crânio (lado B): elipsoide com frente em +Z (olhos e focinho pintados na textura)
    cranio = elipsoide((0, 1.13, 0), (0.125, 0.115, 0.13), 14, 10)
    itens = [(haste, ESQ), (trave, ESQ), (cranio, DIR)]
    return itens, [(ESQ, pinta_madeira), (DIR, pinta_cranio)], 101


def pilha_ossos():
    rnd = np.random.default_rng(7)
    itens = []

    def osso(comprimento=0.30):
        meio = lathe([(0.0, -comprimento / 2, 0.5), (0.02, -comprimento / 2, 0.5), (0.02, comprimento / 2, 0.5), (0.0, comprimento / 2, 0.5)], 8, suave=False)
        pontas = [elipsoide((0, comprimento / 2 + 0.005, 0), (0.038, 0.036, 0.038), 10, 6),
                  elipsoide((0, -comprimento / 2 - 0.005, 0), (0.038, 0.036, 0.038), 10, 6)]
        return [meio] + pontas

    posicoes = [(-0.1, 0.035, -0.06), (0.08, 0.035, -0.08), (0.02, 0.035, 0.1), (-0.09, 0.09, 0.03), (0.07, 0.085, 0.07)]
    for i, (x, y, z) in enumerate(posicoes):
        yaw = float(rnd.uniform(0, 2 * math.pi))
        tomba = float(rnd.uniform(-0.25, 0.25))
        R = rot_y(yaw) @ rot_x(tomba) @ rot_z(math.pi / 2)
        for p in osso():
            itens.append((transforma(p, R=R, T=(x, y, z)), ESQ))
    crania = [((-0.02, 0.2, 0.02), 0.07), ((0.1, 0.16, -0.04), 0.065), ((-0.1, 0.13, -0.09), 0.062)]
    for c, r in crania:
        cab = elipsoide(c, (r, r * 0.95, r * 1.05), 12, 8)
        cab = transforma(cab, R=rot_y(float(rnd.uniform(0, 2 * math.pi))))
        itens.append((cab, DIR))
    return itens, [(ESQ, pinta_osso), (DIR, pinta_cranio)], 202


def buraco_toca():
    perfil = [(0.5, 0.0, 0), (0.46, 0.012, 0), (0.40, 0.04, 0), (0.33, 0.058, 0), (0.27, 0.03, 0), (0.22, 0.004, 0), (0.0, 0.002, 0)]
    disco = disco_plano(perfil, 0.5, 24)
    return [(disco, TUDO)], [(TUDO, pinta_terra)], 303


def marca_queimado():
    perfil = [(0.5, 0.0, 0), (0.44, 0.008, 0), (0.25, 0.01, 0), (0.0, 0.01, 0)]
    disco = disco_plano(perfil, 0.5, 24)
    return [(disco, TUDO)], [(TUDO, pinta_queimado)], 404


def estandarte_orc():
    haste = lathe([(0.0, 0.0, 1.0), (0.036, 0.0, 1.0), (0.032, 1.6, 0.0), (0.0, 1.6, 0.0)], 10, suave=True)
    pe = lathe([(0.0, 0.0, 0.9), (0.07, 0.0, 0.9), (0.07, 0.07, 0.8), (0.0, 0.07, 0.8)], 10, suave=False)
    trave = transforma(lathe([(0.0, -0.3, 0.5), (0.022, -0.3, 0.5), (0.022, 0.3, 0.5), (0.0, 0.3, 0.5)], 8, suave=False),
                       R=rot_z(math.pi / 2), T=(0, 1.52, 0))
    # tecido 0,52 de largo; a borda de baixo tem entalhe em V no meio (rabo de andorinha)
    tecido = grade_plana(0.52, 0.05, 10, 14, 1.5, lambda x: 0.78 + 0.14 * (1 - abs(x) / 0.26))
    itens = [(haste, DIR), (pe, DIR), (trave, DIR), (tecido, ESQ)]
    return itens, [(ESQ, pinta_estandarte), (DIR, pinta_madeira)], 505


def main():
    os.makedirs(SAIDA, exist_ok=True)
    for fn in (totem_caveira, pilha_ossos, buraco_toca, marca_queimado, estandarte_orc):
        itens, pinturas, semente = fn()
        finaliza(itens, fn.__name__, pinturas, semente)
    return 0


if __name__ == '__main__':
    sys.exit(main())
