# Folhas de referência de texturas do dono

Estas folhas são as fontes das texturas do jogo. Ficam fora de `public/`, então não vão para o `.exe`
(o empacotamento só inclui `dist/`, `electron/` e o `package.json`).

| Arquivo | O que tem | Onde virou textura |
|---|---|---|
| `folha-21-arvores-rochas-deserto.webp` | Troncos, copas de folhas, pedras (chão e objetos), areia do deserto e cactos (objetos) | `public/textures/arvores/`, `pedras/` e `deserto/` (v0.8d) |
| `folha-22-arvores-rochas-deserto-b.webp` | Troncos e copas (topo e objetos), pedras, areia e objetos do deserto | `public/textures/arvores/`, `pedras/` e `deserto/` (v0.8d) |
| `folha-23-terreno-caminhos-agua-pisos.webp` | Terreno e grama, caminhos, água, pedras, madeira, muros, telhados e pisos (chão) e painéis de objetos | `public/textures/biblioteca/` (47 texturas, com `catalogo.json`) (v0.8e) |
| `folha-24-neve-vulcao.webp` | Neve e gelo (chão, paredes e cristais), vulcão, basalto e lava (chão, paredes, fumaça e brasas) | `public/textures/gelo/` (21) e `public/textures/vulcao/` (20), com `catalogo.json` em cada pasta (v0.8f) |

Os painéis de objetos (barris, bandeiras, lanternas, fogueira, estátuas, cactos, ossos e similares)
estão sobre fundo escuro e não foram recortados. Para virar sprite, precisam de fundo transparente.

Origem: enviadas pelo dono no chat. Ver `LOG_SESSOES.md` para as decisões de cada entrega.
