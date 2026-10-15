#!/usr/bin/env python3
"""
Recorta a folha de arte do kit de ilhas celestes (Ato 4) em texturas e peças do jogo.

A folha é do dono (1536x1024, fundo azul-marinho escuro). Ela NÃO vai para o repositório:
o script recebe o caminho da folha como argumento e grava só os recortes pequenos.

Uso (de qualquer pasta):

    python3 scripts/recortarAto4.py /caminho/da/folha/13.webp

Saída:
    public/textures/ato4/*.webp          texturas para o chão e o fundo (RGB, 256x256, ladrilháveis)
    public/textures/ato4/pecas/*.webp    peças com alpha (fundo azul-marinho removido)
    public/textures/ato4/manifesto.json  lista de tudo: nome, tipo, tamanho e uso previsto

Tudo é determinístico (sem sorteio, sem data): rodar de novo com a mesma folha gera os mesmos arquivos.

Como ajustar um recorte:
  - Cada entrada tem 'caixa' = (x0, y0, x1, y1) em pixels da folha, com x1 e y1 NÃO incluídos.
  - Para ver as coordenadas, abra a folha e desenhe uma grade. Aumente ou diminua a caixa
    e rode o script de novo. A caixa das peças já tem uma pequena margem: o fundo é removido
    pela cor, então não precisa encostar exatamente na borda do desenho.
  - Se uma peça pegar pedaço de vizinha, encolha a caixa até o vizinho sair.
  - Se sobrar fundo azul no meio de uma peça (buraco fechado), suba LIMIAR_INTERNO um pouco.
  - Se a peça perder pedaços claros, baixe LIMIAR_FUNDO.
"""

import json
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SAIDA = os.path.join(RAIZ, 'public', 'textures', 'ato4')
SAIDA_PECAS = os.path.join(SAIDA, 'pecas')

FOLHA_ESPERADA = (1536, 1024)
QUALIDADE = 90           # WebP com qualidade alta (regra 8 do projeto)
TAMANHO_TEXTURA = 256    # lado das texturas seamless, em px
LADO_MAXIMO_PECA = 512   # teto por lado das peças, em px

# Chave de cor para tirar o fundo azul-marinho das peças.
LIMIAR_FUNDO = 24        # diferença máxima da cor do fundo para contar como fundo, ligado à borda
LIMIAR_INTERNO = 12      # buracos fechados mais parecidos com o fundo também saem (mais estrito)
FRACAO_MINIMA_PEDACO = 0.10  # pedaço solto com menos de 10% da maior parte é descartado (fragmento de vizinha)

# Pontos das faixas da costura (texturas seamless). Mexa só se a costura aparecer.
FAIXA_CENTRO = 0.06      # até essa fração da metade da largura: usa o miolo original
FAIXA_BORDA = 0.30       # a partir daqui: usa o deslocado (bordas continuam iguais)


# ---------------------------------------------------------------------------
# TEXTURAS: amostras da linha "TEXTURAS (REFERÊNCIA)" da folha.
# Cada uma vira um quadrado 256x256 (corte central) e depois fica ladrilhável.
# ---------------------------------------------------------------------------
TEXTURAS = {
    # linha de cima, 1ª amostra: pedra clara com juntas (chão de salão e caminhos)
    'pedra_clara.webp': {
        'caixa': (762, 861, 833, 913),
        'uso': 'chão de pedra clara com juntas: salões, caminhos e áreas de passagem do Ato 4',
    },
    # linha de cima, 2ª amostra: mosaico dourado com azul (chão cerimonial)
    'azulejo_dourado.webp': {
        'caixa': (852, 859, 925, 914),
        'uso': 'chão de azulejo dourado com azul: centros cerimoniais e praças',
    },
    # azulejo de PISOS/TERRENO: a face de cima do bloco dourado, desenrolada para virar textura.
    # 'losango' = 4 vértices da face de cima do bloco, em pixels da folha, na ordem:
    # topo, esquerda, base, direita. A caixa é só a área de recorte ao redor.
    'azulejo_piso.webp': {
        'caixa': (823, 56, 907, 127),
        'losango': [(864, 65), (828, 85), (865, 105), (902, 86)],
        'uso': 'chão de azulejo dourado tirado do bloco isométrico (face de cima desenrolada)',
    },
    # linha de cima, 3ª amostra: grama (topo das ilhas)
    'grama_ilha.webp': {
        'caixa': (945, 861, 1015, 913),
        'uso': 'grama para o topo das ilhas flutuantes e áreas verdes',
    },
    # linha de baixo, 4ª amostra: rocha escura (laterais e bordas de ilha)
    'rocha_ilha.webp': {
        'caixa': (1034, 919, 1104, 971),
        'uso': 'rocha escura para as laterais e as bordas das ilhas flutuantes',
    },
    # linha de cima, 5ª amostra: nuvem branca
    'nuvem.webp': {
        'caixa': (1140, 861, 1210, 914),
        'uso': 'nuvem para o fundo e o mar de nuvens',
    },
    # linha de baixo, 5ª amostra: brilho azul (runas, portais, fundo de magia)
    'brilho_azul.webp': {
        'caixa': (1140, 918, 1210, 972),
        'uso': 'brilho azul para runas, portais e fundo de magia',
    },
}


# ---------------------------------------------------------------------------
# PEÇAS: recortes com fundo removido (PNG com alpha em WebP).
# Os nomes seguem snake_case e ficam em public/textures/ato4/pecas/.
# ---------------------------------------------------------------------------
PECAS = {
    # ARQUITETURA (linha do meio)
    'arco_ruina.webp': {'caixa': (752, 478, 846, 618), 'uso': 'arco de ruína com pilar, para borda ou entrada quebrada'},
    'pilar_ruina.webp': {'caixa': (852, 472, 892, 617), 'uso': 'pilar alto com topo quebrado, decoração de ruína'},
    'arco_ruina_2.webp': {'caixa': (904, 476, 1005, 618), 'uso': 'arco quebrado entre dois pilares, passagem em ruína'},
    'pilar_baixo.webp': {'caixa': (1008, 560, 1046, 614), 'uso': 'pedestal pequeno de ruína, decoração de chão'},
    'arco_dourado.webp': {'caixa': (1054, 452, 1192, 621), 'uso': 'arco dourado com bandeira azul, portal de cidade'},
    'pavilhao_dourado.webp': {'caixa': (1240, 460, 1339, 618), 'uso': 'pavilhão dourado com telhado, santuário ou portal'},
    'pilar_dourado.webp': {'caixa': (1342, 478, 1386, 592), 'uso': 'pilar dourado e branco, colunas de templo'},
    'pilar_ruina_baixo.webp': {'caixa': (1196, 508, 1239, 614), 'uso': 'pilar curto de ruína'},
    'estatua_anjo.webp': {'caixa': (1388, 436, 1506, 622), 'uso': 'estátua de anjo em pedestal, marco de praça'},

    # PONTES E CONEXÕES (linha do meio)
    'ponte_corrimao.webp': {'caixa': (750, 274, 879, 395), 'uso': 'ponte de pedra com corrimão e pilares dourados'},
    'ponte_arco.webp': {'caixa': (881, 273, 968, 395), 'uso': 'ponte em arco, travessia sobre o vazio'},
    'ponte_reta.webp': {'caixa': (964, 272, 1080, 392), 'uso': 'ponte reta de pedra entre duas ilhas'},
    'plataforma_circular.webp': {'caixa': (1060, 325, 1158, 404), 'uso': 'plataforma circular com mandala, ponto de encontro'},

    # ESCADAS
    'escada_pedra_1.webp': {'caixa': (1188, 280, 1266, 360), 'uso': 'escada curta de pedra, ligação entre níveis'},
    'escada_pedra_2.webp': {'caixa': (1278, 281, 1344, 350), 'uso': 'escada curta de pedra, ligação entre níveis'},
    'escada_pedra_3.webp': {'caixa': (1345, 285, 1404, 339), 'uso': 'escada curta de pedra, ligação entre níveis'},
    'escada_pedra_4.webp': {'caixa': (1391, 277, 1505, 385), 'uso': 'escada longa de pedra, subida principal'},

    # DECORAÇÕES
    'tocheiro.webp': {'caixa': (750, 663, 796, 804), 'uso': 'tocheiro de pedra com fogo, iluminação de rua'},
    'tocheiro_baixo.webp': {'caixa': (805, 748, 839, 804), 'uso': 'tocheiro pequeno de pedra'},
    'cerca_dourada_1.webp': {'caixa': (797, 674, 848, 746), 'uso': 'cerca de pedra dourada, divisória de caminho'},
    'cerca_dourada_2.webp': {'caixa': (852, 694, 903, 748), 'uso': 'cerca de pedra dourada, divisória de caminho'},
    'bandeira_azul_1.webp': {'caixa': (904, 672, 936, 736), 'uso': 'bandeira azul com brasão dourado, presa em mastro'},
    'bandeira_azul_2.webp': {'caixa': (944, 673, 979, 774), 'uso': 'bandeira azul pendurada, decoração de muro'},
    'altar_cristal.webp': {'caixa': (989, 662, 1065, 781), 'uso': 'altar com cristal azul, marco de magia'},
    'altar_pequeno.webp': {'caixa': (1088, 660, 1136, 714), 'uso': 'altar pequeno com ponta de cristal'},
    'fonte_cristal.webp': {'caixa': (1069, 718, 1153, 805), 'uso': 'fonte circular com cristal, praça'},
    'obelisco_azul.webp': {'caixa': (904, 740, 940, 806), 'uso': 'obelisco azul com topo branco'},
    'corrente_poste.webp': {'caixa': (848, 758, 895, 802), 'uso': 'poste com corrente, delimitador de passagem'},

    # ELEMENTOS ESPECIAIS
    'cristal_azul.webp': {'caixa': (20, 776, 94, 922), 'uso': 'cristal azul com anéis de luz, marco de magia'},
    'portal_azul.webp': {'caixa': (96, 776, 182, 914), 'uso': 'portal de pedra com luz azul, entrada de outro mundo'},
    'cristal_pequeno.webp': {'caixa': (181, 788, 224, 870), 'uso': 'cristal azul pequeno, decoração flutuante'},
    'ilha_cachoeira.webp': {'caixa': (228, 764, 327, 992), 'uso': 'ilha com cachoeira e nuvem na base, borda de mapa'},
    'nuvem_espiral_1.webp': {'caixa': (328, 796, 404, 854), 'uso': 'nuvem em espiral, detalhe de borda'},
    'nuvem_espiral_2.webp': {'caixa': (322, 858, 404, 922), 'uso': 'nuvem em espiral, detalhe de borda'},
    'nuvem_espiral_3.webp': {'caixa': (324, 924, 400, 984), 'uso': 'nuvem fofa, base de ilha ou borda do mapa'},
    'circulo_magico.webp': {'caixa': (23, 923, 99, 974), 'uso': 'círculo de luz para o chão, marca de runa'},

    # NUVENS (topo direita)
    'nuvem_pecas_1.webp': {'caixa': (1299, 50, 1393, 129), 'uso': 'nuvem branca, decoração de céu e borda'},
    'nuvem_pecas_2.webp': {'caixa': (1406, 34, 1519, 119), 'uso': 'nuvem branca grande, decoração de céu e borda'},
    'nuvem_pecas_3.webp': {'caixa': (1298, 136, 1397, 222), 'uso': 'nuvem branca, decoração de céu e borda'},
    'ilha_nuvem.webp': {'caixa': (1420, 128, 1516, 224), 'uso': 'ilha flutuante com nuvem e cachoeira, borda do mapa'},

    # VEGETAÇÃO (ilhas flutuantes)
    'ilha_rocha.webp': {'caixa': (1214, 663, 1304, 792), 'uso': 'ilha flutuante de rocha com ruína no topo'},
    'ilha_grama.webp': {'caixa': (1306, 660, 1392, 800), 'uso': 'ilha flutuante de grama com árvores e base de rocha'},
    'ilha_pequena.webp': {'caixa': (1375, 752, 1426, 810), 'uso': 'ilha pequena com árvore, ilha satélite'},
    'ilha_arvore.webp': {'caixa': (1414, 658, 1516, 810), 'uso': 'ilha grande com árvore, ilha de destaque'},

    # PISOS / TERRENO (blocos isométricos, com a lateral)
    'piso_pedra.webp': {'caixa': (743, 58, 823, 124), 'uso': 'bloco isométrico de pedra clara, peça de piso'},
    'piso_azulejo_dourado.webp': {'caixa': (823, 56, 907, 125), 'uso': 'bloco isométrico de azulejo dourado, peça de piso cerimonial'},
    'piso_pedra_2.webp': {'caixa': (905, 46, 986, 118), 'uso': 'bloco isométrico de pedra com juntas, peça de piso'},
    'piso_grama.webp': {'caixa': (1074, 46, 1158, 118), 'uso': 'bloco isométrico de grama, peça de piso verde'},
    'piso_grama_2.webp': {'caixa': (993, 118, 1085, 200), 'uso': 'bloco isométrico de grama com flores, peça de piso verde'},
    'ilha_ruina_1.webp': {'caixa': (1174, 40, 1268, 139), 'uso': 'ilha de grama com ruína, peça de borda'},
    'ilha_ruina_2.webp': {'caixa': (1188, 138, 1268, 218), 'uso': 'ilha de grama com pilar de ruína, peça de borda'},
}


# ---------------------------------------------------------------------------
# Funções
# ---------------------------------------------------------------------------

def abrir_folha(caminho):
    """Abre a folha do dono e confere o tamanho (as caixas são para 1536x1024)."""
    if not os.path.isfile(caminho):
        sys.exit('Folha não encontrada: %s' % caminho)
    folha = Image.open(caminho).convert('RGB')
    if folha.size != FOLHA_ESPERADA:
        sys.exit('A folha tem %dx%d, mas as caixas foram medidas em %dx%d. Ajuste as caixas antes.'
                 % (folha.size[0], folha.size[1], FOLHA_ESPERADA[0], FOLHA_ESPERADA[1]))
    return folha


def quadrado_central(img):
    w, h = img.size
    lado = min(w, h)
    x0 = (w - lado) // 2
    y0 = (h - lado) // 2
    return img.crop((x0, y0, x0 + lado, y0 + lado))


def peso_faixa(t):
    """Peso do miolo original na costura: 255 no centro, 0 nas bordas (t vai de 0 no centro a 0.5 na borda)."""
    if t <= FAIXA_CENTRO:
        return 255
    if t >= FAIXA_BORDA:
        return 0
    return int(round(255 * (FAIXA_BORDA - t) / (FAIXA_BORDA - FAIXA_CENTRO)))


def mascara_faixa_vertical(w, h):
    """Máscara em que cada coluna vale o peso do miolo (costura vertical, no meio da largura)."""
    mascara = Image.new('L', (w, h), 0)
    desenho = ImageDraw.Draw(mascara)
    for x in range(w):
        t = abs(x + 0.5 - w / 2) / w
        desenho.line([(x, 0), (x, h - 1)], fill=peso_faixa(t))
    return mascara


def mascara_faixa_horizontal(w, h):
    """Máscara em que cada linha vale o peso do miolo (costura horizontal, no meio da altura)."""
    mascara = Image.new('L', (w, h), 0)
    desenho = ImageDraw.Draw(mascara)
    for y in range(h):
        t = abs(y + 0.5 - h / 2) / h
        desenho.line([(0, y), (w - 1, y)], fill=peso_faixa(t))
    return mascara


def ladrilhavel(img):
    """Torna a textura seamless: desloca pela metade, mistura a costura no meio e repete o processo na vertical.

    A costura antiga (borda da amostra) vai para o meio; ali a imagem usa o miolo original, onde
    não há descontinuidade. Nas bordas usa a versão deslocada, que já encaixa com o outro lado.
    """
    w, h = img.size
    deslocada = ImageChops.offset(img, w // 2, 0)
    passo1 = Image.composite(img, deslocada, mascara_faixa_vertical(w, h))
    deslocada = ImageChops.offset(passo1, 0, h // 2)
    return Image.composite(passo1, deslocada, mascara_faixa_horizontal(w, h))


def textura_de_losango(folha, cfg):
    """Desenrola a face de cima de um bloco isométrico (losango) para virar um quadrado."""
    x0, y0, x1, y1 = cfg['caixa']
    recorte = folha.crop((x0, y0, x1, y1))
    pontos = [(x - x0, y - y0) for x, y in cfg['losango']]
    topo, esquerda, base, direita = pontos
    dados = (topo[0], topo[1], esquerda[0], esquerda[1], base[0], base[1], direita[0], direita[1])
    return recorte.transform((TAMANHO_TEXTURA, TAMANHO_TEXTURA), Image.Transform.QUAD, dados,
                             resample=Image.Resampling.BICUBIC)


def textura_de_caixa(folha, cfg):
    """Amostra retangular: tira 2 px de margem (bordas da amostra), pega o quadrado central e amplia."""
    x0, y0, x1, y1 = cfg['caixa']
    recorte = folha.crop((x0 + 2, y0 + 2, x1 - 2, y1 - 2))
    quadrado = quadrado_central(recorte)
    return quadrado.resize((TAMANHO_TEXTURA, TAMANHO_TEXTURA), Image.Resampling.LANCZOS)


def manter_principais(mascara, proporcao=FRACAO_MINIMA_PEDACO):
    """Zera pedaços soltos pequenos (fragmentos de peça vizinha que entraram na caixa).

    Mantém cada parte conectada com pelo menos 'proporcao' da área da maior parte.
    """
    w, h = mascara.size
    px = mascara.load()
    visto = bytearray(w * h)
    partes = []
    for y in range(h):
        for x in range(w):
            if px[x, y] >= 128 and not visto[y * w + x]:
                visto[y * w + x] = 1
                pilha = [(x, y)]
                pixels = []
                while pilha:
                    cx, cy = pilha.pop()
                    pixels.append(cy * w + cx)
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < w and 0 <= ny < h and px[nx, ny] >= 128 and not visto[ny * w + nx]:
                            visto[ny * w + nx] = 1
                            pilha.append((nx, ny))
                partes.append(pixels)
    if not partes:
        return mascara
    maior = max(len(p) for p in partes)
    limite = proporcao * maior
    saida = Image.new('L', (w, h), 0)
    spx = saida.load()
    for parte in partes:
        if len(parte) >= limite:
            for i in parte:
                spx[i % w, i // w] = 255
    return saida


def tirar_fundo(folha, caixa):
    """Recorta a peça e torna transparente o fundo azul-marinho.

    1. A cor do fundo é a mediana da borda da caixa.
    2. Pixels parecidos com ela e ligados à borda viram fundo (flood fill a partir da borda).
    3. Buracos fechados muito parecidos com o fundo também viram fundo.
    4. Pedaços soltos pequenos (fragmento de peça vizinha dentro da caixa) são descartados.
    5. A borda recebe um leve desfoque no alpha, para não ficar serrilhada.
    """
    recorte = folha.crop(caixa)
    w, h = recorte.size
    pix = recorte.load()
    borda = ([pix[x, 0] for x in range(w)] + [pix[x, h - 1] for x in range(w)]
             + [pix[0, y] for y in range(h)] + [pix[w - 1, y] for y in range(h)])
    fundo = tuple(sorted(c[i] for c in borda)[len(borda) // 2] for i in range(3))

    diferenca = ImageChops.difference(recorte, Image.new('RGB', (w, h), fundo))
    dr, dg, db = diferenca.split()
    dm = ImageChops.lighter(ImageChops.lighter(dr, dg), db)

    candidato = dm.point(lambda v: 255 if v <= LIMIAR_FUNDO else 0)
    sementes = ([(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)]
                + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)])
    for x, y in sementes:
        if candidato.getpixel((x, y)) == 255:
            ImageDraw.floodfill(candidato, (x, y), 128)
    ligado_a_borda = candidato.point(lambda v: 255 if v == 128 else 0)
    buraco = dm.point(lambda v: 255 if v <= LIMIAR_INTERNO else 0)
    fundo_mascara = ImageChops.lighter(ligado_a_borda, buraco)

    alpha = fundo_mascara.point(lambda v: 0 if v else 255)
    alpha = manter_principais(alpha)
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.6))
    saida = recorte.convert('RGBA')
    saida.putalpha(alpha)
    if max(saida.size) > LADO_MAXIMO_PECA:
        saida.thumbnail((LADO_MAXIMO_PECA, LADO_MAXIMO_PECA), Image.Resampling.LANCZOS)
    return saida


def main():
    if len(sys.argv) != 2:
        sys.exit('Uso: python3 scripts/recortarAto4.py /caminho/da/folha.webp')
    folha = abrir_folha(sys.argv[1])

    os.makedirs(SAIDA_PECAS, exist_ok=True)
    manifesto = []

    for nome, cfg in TEXTURAS.items():
        if 'losango' in cfg:
            imagem = textura_de_losango(folha, cfg)
        else:
            imagem = textura_de_caixa(folha, cfg)
        imagem = ladrilhavel(imagem)
        caminho = os.path.join(SAIDA, nome)
        imagem.save(caminho, 'WEBP', quality=QUALIDADE, method=6)
        manifesto.append({
            'nome': nome,
            'tipo': 'textura',
            'arquivo': nome,
            'tamanho': '%dx%d' % imagem.size,
            'uso': cfg['uso'],
        })

    for nome, cfg in PECAS.items():
        imagem = tirar_fundo(folha, cfg['caixa'])
        caminho = os.path.join(SAIDA_PECAS, nome)
        imagem.save(caminho, 'WEBP', quality=QUALIDADE, method=6)
        manifesto.append({
            'nome': nome,
            'tipo': 'peca',
            'arquivo': 'pecas/' + nome,
            'tamanho': '%dx%d' % imagem.size,
            'uso': cfg['uso'],
        })

    with open(os.path.join(SAIDA, 'manifesto.json'), 'w', encoding='utf-8') as arq:
        json.dump(manifesto, arq, ensure_ascii=False, indent=2)
        arq.write('\n')

    texturas = sum(1 for m in manifesto if m['tipo'] == 'textura')
    print('Texturas: %d | Peças: %d | Saída: %s' % (texturas, len(manifesto) - texturas, os.path.normpath(SAIDA)))


if __name__ == '__main__':
    main()
