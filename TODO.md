# TODO

Só itens conhecidos/identificados. Sem features inventadas.

# HIGH
- Margens finas em solarRuins/frostPass (mago termina com ~8 HP em builds mínimas) — reavaliar se jogadores casuais travarem.
- Arena dedicada para o Survival (mapas atuais são corredores; o modo funciona, mas sem flancos reais).

# MEDIUM
- Nível final 15–16 vs alvo 13–14 — aceito por ora (cortar mais EXP arriscaria virar vitórias em derrotas).
- Exibir `survivalBest` no Ranking inicial (linhas ancoradas na arte — reposicionar com cuidado).

# LOW
- Tempo de execução da suite headless cresce com as contagens (só lógica; ok por enquanto).
- Contorno (outline) dobra o custo de desenho da horda (medido: 192 → 152 chamadas e 0,70M → 0,40M triângulos com 40 unidades sem contorno). Decisão visual pendente do dono.
- `ualClips.ts` / `ualMixamo.ts` guardam ~400 KB de números no código; podem virar JSON carregado sob demanda.
- Áudio (~11 MB em `public/audio`) pode cair para 128 kbps se o tamanho do download importar.

# FUTURE
- (reservado — nada pendente além do acima)
