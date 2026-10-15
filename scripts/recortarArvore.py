#!/usr/bin/env python3
"""
Recorta a roda da Árvore de Aurenthal a partir da arte de referência do dono (emblemas, núcleo, aro e miolo).

A imagem é do dono e NÃO vai para o repositório: o script recebe o caminho dela como argumento e grava só
os recortes em public/ui/arvore/. A referência base é a 15.webp (1536x1024). Só a roda entra aqui: cabeçalho,
painéis, personagens e fundo com ilhas ficam fora do recorte.

Uso (de qualquer pasta):

    python3 scripts/recortarArvore.py /caminho/da/imagem/15.webp

Saída (public/ui/arvore/):
    emblema-<setor>.webp   medalhão de cada setor, recorte circular com alpha (256x256)
    nucleo.webp            emblema ROGUARD do centro, recorte circular com alpha (384x384)
    anel-roda.webp         aro dourado da moldura, só a faixa do aro (alpha fora dela)
    fundo-roda.webp        miolo escuro da roda: a própria arte desfocada e escurecida (alpha circular)

As caixas (CAIXAS) são frações da imagem: centro (x / largura, y / altura) e raio (fração da LARGURA).
Assim o mesmo script roda sobre a versão HD sem ajuste manual, desde que a composição seja a da referência.

Como ajustar um recorte:
  - Abra a imagem, desenhe uma grade e leia o centro e o raio do desenho em pixels.
  - Divida: centro_x / largura, centro_y / altura, raio / largura. Escreva em CAIXAS.
  - MODO diz como recortar: 'circulo' (medalhão), 'anel' (só o aro) ou 'desfocado' (miolo escuro).

Tudo é determinístico (sem sorteio, sem data): rodar de novo com a mesma imagem gera os mesmos arquivos.
"""
import os
import statistics
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

# ---------------- caixas em fração da imagem: ((centro_x, centro_y, raio), modo) ----------------
# centro_x = x / largura, centro_y = y / altura, raio = fração da largura. Base: 15.webp (1536x1024).
CAIXAS = {
    # emblemas dos seis setores (cada setor = uma família de Mastery; ver src/config/arvoreVisual.ts)
    'emblema-destruicao': ((0.4980, 0.1191, 0.0313), 'circulo'),   # topo: vermelho/laranja
    'emblema-controle': ((0.3268, 0.3125, 0.0313), 'circulo'),     # esquerda-alta: azul
    'emblema-protecao': ((0.6706, 0.3125, 0.0313), 'circulo'),     # direita-alta: verde
    'emblema-execucao': ((0.3268, 0.5762, 0.0299), 'circulo'),     # esquerda-baixa: roxo
    'emblema-mobilidade': ((0.4980, 0.6641, 0.0313), 'circulo'),   # base: dourado
    'emblema-sinergia': ((0.6706, 0.5762, 0.0313), 'circulo'),     # direita-baixa: azul-petróleo
    # emblema ROGUARD do centro (o nome do logo faz parte da arte do dono)
    'nucleo': ((0.4980, 0.4443, 0.0651), 'circulo'),
    # aro dourado da moldura: a faixa entre 0,9254 e 1 do raio (372 a 402 px na referência)
    'anel-roda': ((0.4980, 0.4443, 0.2617), 'anel'),
    # miolo da roda: a arte desfocada e escurecida, sem nós (raio 380 px na referência)
    'fundo-roda': ((0.4980, 0.4443, 0.2474), 'desfocado'),
}
RAIO_ANEL_INTERNO = 0.9254  # raio interno do aro, em fração do raio externo (372 / 402)

TAM_EMBLEMA = 256
TAM_NUCLEO = 384
TAM_FUNDO = 760
DESFOQUE_FUNDO = 18  # raio do desfoque do miolo: some com os nós e deixa a cor e a textura
BRILHO_FUNDO = 0.42  # abaixo de 1 escurece o miolo para os nós e os rótulos lerem
QUALIDADE = 92  # WebP com alpha: qualidade alta para não borrar a borda do recorte


def caixa_em_pixels(centro_x, centro_y, raio, largura, altura):
    """(x0, y0, x1, y1) em pixels da imagem recebida, a partir das frações."""
    cx, cy, r = centro_x * largura, centro_y * altura, raio * largura
    return (round(cx - r), round(cy - r), round(cx + r), round(cy + r))


def mascara_circulo(tam, interno=0.0):
    """Círculo com borda suave (desenhado 4x e reduzido). Com `interno` > 0, faz um furo no meio (aro)."""
    s = 4
    m = Image.new('L', (tam * s, tam * s), 0)
    d = ImageDraw.Draw(m)
    d.ellipse((0, 0, tam * s - 1, tam * s - 1), fill=255)
    if interno > 0:
        c = tam * s / 2
        r_in = interno * c
        d.ellipse((c - r_in, c - r_in, c + r_in, c + r_in), fill=0)
    return m.resize((tam, tam), Image.LANCZOS)


def cor_media(recorte_rgb):
    """Cor típica do medalhão: mediana dos pixels saturados e claros (o brilho do setor, sem o fundo escuro)."""
    px = [tuple(recorte_rgb.tobytes()[i:i + 3]) for i in range(0, len(recorte_rgb.tobytes()), 3)]
    vivos = [p for p in px if max(p) > 60 and (max(p) - min(p)) / max(p) > 0.3]
    if not vivos:
        return '#000000'
    r = statistics.median(p[0] for p in vivos)
    g = statistics.median(p[1] for p in vivos)
    b = statistics.median(p[2] for p in vivos)
    return '#%02x%02x%02x' % (round(r), round(g), round(b))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    origem = sys.argv[1]
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    saida = os.path.join(raiz, 'public', 'ui', 'arvore')
    os.makedirs(saida, exist_ok=True)

    img = Image.open(origem).convert('RGB')
    largura, altura = img.size
    print(f'imagem: {origem} ({largura}x{altura})')

    for nome, ((fx, fy, fr), modo) in CAIXAS.items():
        caixa = caixa_em_pixels(fx, fy, fr, largura, altura)
        recorte = img.crop(caixa)
        if modo == 'desfocado':
            miolo = recorte.resize((TAM_FUNDO, TAM_FUNDO), Image.LANCZOS).filter(ImageFilter.GaussianBlur(DESFOQUE_FUNDO))
            miolo = ImageEnhance.Brightness(miolo).enhance(BRILHO_FUNDO).convert('RGBA')
            miolo.putalpha(mascara_circulo(TAM_FUNDO))
            tam = TAM_FUNDO
        else:
            if modo == 'anel':
                tam = recorte.width  # aro na resolução da imagem (nítido na escala 1 da roda)
            else:
                tam = TAM_NUCLEO if nome == 'nucleo' else TAM_EMBLEMA
            miolo = recorte.resize((tam, tam), Image.LANCZOS).filter(
                ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2)).convert('RGBA')
            if modo == 'circulo':
                miolo.putalpha(mascara_circulo(tam))
            elif modo == 'anel':
                miolo.putalpha(mascara_circulo(tam, interno=RAIO_ANEL_INTERNO))
        destino = os.path.join(saida, f'{nome}.webp')
        miolo.save(destino, 'WEBP', quality=QUALIDADE, method=6)
        cor = cor_media(recorte) if modo == 'circulo' else '-'
        print(f'{nome}: {destino} {miolo.size} caixa={caixa} modo={modo} cor={cor}')


if __name__ == '__main__':
    main()
