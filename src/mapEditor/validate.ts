/**
 * Validação do mapa usando a lógica REAL do jogo (parseZone) + cheques do editor.
 * Erros impedem exportar um mapa jogável; avisos são recomendações.
 */
import { GAME_CONFIG } from '../config/gameConfig';
import { parseZone } from '../config/zones';
import { VALID_CHARS } from './legend';
import { inBounds, toZoneDef, type MapDoc } from './mapDoc';

export interface Validation {
  errors: string[];
  warnings: string[];
}

const ENEMY_KINDS = new Set(Object.keys(GAME_CONFIG.enemies));

export function validate(d: MapDoc): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!d.id) errors.push('ID do mapa vazio.');
  if (d.width < 5 || d.height < 5) errors.push(`Tamanho inválido (${d.width}×${d.height}, mínimo 5×5).`);
  if (d.grid.length !== d.height) errors.push(`Grade com ${d.grid.length} linhas, esperado ${d.height}.`);
  d.grid.forEach((row, y) => {
    if (row.length !== d.width) errors.push(`Linha ${y} com ${row.length} colunas (esperado ${d.width}).`);
    [...row].forEach((ch) => {
      if (!VALID_CHARS.has(ch)) errors.push(`Caractere inválido "${ch}" na linha ${y}.`);
    });
  });
  // passa pelo parser real do jogo
  try {
    const z = parseZone(toZoneDef(d));
    if (!z.city.length) warnings.push('Sem portão da cidade ("g"): a horda nunca invade.');
    const reach = (p: { x: number; y: number }): boolean => inBounds(d, p.x, p.y) && z.walls.every((w) => w.x !== p.x || w.y !== p.y) && z.voids.every((v) => v.x !== p.x || v.y !== p.y);
    d.spawnPoints.forEach((p, i) => {
      if (!inBounds(d, p.x, p.y)) errors.push(`Spawn ${i + 1} fora do mapa.`);
      else if (!reach(p)) errors.push(`Spawn ${i + 1} (${p.x},${p.y}) está bloqueado.`);
    });
  } catch (e) {
    errors.push(`Mapa rejeitado pelo jogo: ${(e as Error).message}`);
  }
  d.setup.members.forEach((m, i) => {
    if (!inBounds(d, m.x, m.y)) errors.push(`Herói ${i + 1} fora do mapa.`);
  });
  if (!d.setup.members.length) warnings.push('Setup sem heróis (Player Spawn vazio).');
  d.objects.forEach((o, i) => {
    if (!inBounds(d, o.x, o.y)) errors.push(`Objeto ${i + 1} (${o.type}) fora do mapa.`);
  });
  if (d.wave.count < 1) errors.push('Onda com quantidade < 1.');
  if (d.wave.spawnIntervalTicks < 1) errors.push('Intervalo de spawn < 1 tick.');
  for (const m of d.wave.mix) {
    if (!ENEMY_KINDS.has(m.kind)) errors.push(`Inimigo inexistente no mix: "${m.kind}".`);
    if (m.weight <= 0) warnings.push(`Peso zerado para "${m.kind}" no mix.`);
  }
  if (!d.wave.mix.length) errors.push('Mix da onda vazio.');
  if (d.wave.boss && !ENEMY_KINDS.has(d.wave.boss)) errors.push(`Chefe inexistente: "${d.wave.boss}".`);
  return { errors, warnings };
}
