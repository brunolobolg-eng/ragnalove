/**
 * Testes da distância de agressão (INT/velocidade/agressão + tutorial):
 * fonte única combatProfile().aggressionRange + discPattern (mesma do visual).
 * Uso: node node_modules/tsx/dist/cli.mjs scripts/aggressionCheck.ts
 */
import { discPattern } from '../src/core/grid/patterns';
import { combatProfile, neutralMods } from '../src/core/sim/RangeSystem';
import type { Unit } from '../src/core/sim/types';

let failures = 0;
const check = (name: string, cond: boolean, extra = ''): void => {
  if (cond) console.log(`  ok: ${name}`);
  else {
    failures++;
    console.error(`  FALHA: ${name} ${extra}`);
  }
};
const fake = (kind: string): Unit => ({ kind }) as Unit;
const mods = neutralMods();
const agr = (kind: string): number => combatProfile(fake(kind), mods, 1).aggressionRange;

// 1-2. base por classe: rápido reage mais longe
const w = agr('warrior');
const a = agr('assassin');
const m = agr('mage');
const r = agr('archer');
console.log(`  info: warrior=${w.toFixed(2)} assassin=${a.toFixed(2)} mage=${m.toFixed(2)} archer=${r.toFixed(2)}`);
check('guerreiro 3.5', Math.abs(w - 3.5) < 1e-6, String(w));
check('assassino 4.375', Math.abs(a - 4.375) < 1e-6, String(a));
check('assassino corpo-a-corpo > guerreiro', a > w);
check('mesma classe, mais rápido = maior',
  combatProfile(fake('warrior'), { ...mods, heroes: { warrior: { moveTicks: 4 } } }, 1).aggressionRange > w);
check('arqueira 9 (teto detecção não pega)', Math.abs(r - 9) < 1e-6, String(r));
check('arqueira <= detecção', r <= 15);

// 3/5. mudança de velocidade (mods = buff/debuff de teste) muda a zona
const fast = combatProfile(fake('mage'), { ...mods, heroes: { mage: { moveTicks: 3 } } }, 1).aggressionRange;
const slow = combatProfile(fake('mage'), { ...mods, heroes: { mage: { moveTicks: 12 } } }, 1).aggressionRange;
check('buff de velocidade aumenta', fast > m, `${slow} < ${m} < ${fast}`);
check('debuff diminui', slow < m);
// 14. extremos: piso 2 e teto detecção
const crawl = combatProfile(fake('mage'), { ...mods, heroes: { mage: { moveTicks: 99 } } }, 1).aggressionRange;
check('piso 2 em lentidão extrema', crawl === 2, String(crawl));
const bolt = combatProfile(fake('mage'), { ...mods, heroes: { mage: { moveTicks: 1 } } }, 1).aggressionRange;
check('teto = detecção em velocidade extrema', bolt === 12, String(bolt));

// 6/4. lentidão de campo e equipamento NÃO mudam herói (sem fonte no progression)
const slowed = { ...fake('mage'), slowUntil: 9999, slowMult: 2 } as Unit;
check('slowUntil ignorado no perfil', combatProfile(slowed, mods, 1).aggressionRange === m);

// zona visual == cálculo: disco contém/expulsa certo
const has = (arr: { x: number; y: number }[], x: number, y: number): boolean => arr.some((t) => t.x === x && t.y === y);
const disc = discPattern({ x: 5, y: 5 }, 2);
check('disco contém centro e eixos', has(disc, 5, 5) && has(disc, 7, 5) && has(disc, 5, 7));
check('disco contém diagonal curta', has(disc, 6, 6));
check('disco exclui longe', !has(disc, 8, 5) && !has(disc, 7, 7));
check('mesma função do jogo (raio do perfil)', discPattern({ x: 0, y: 0 }, m).length > 0);

if (failures) throw new Error(`${failures} FALHA(S)`);
console.log('\nAgressão OK: visual = cálculo.');
