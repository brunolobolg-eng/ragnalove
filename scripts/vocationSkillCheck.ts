/**
 * Checagem headless das árvores de vocação (Crusado e Hypnomancer): 20 habilidades cada.
 * Rode: npm run vocation:skills:check
 * 1) Dados (ids, posições, requisitos, ícones distintos; o casamento com o catálogo do dono é checado por script à parte) · 2) Escolha e árvore (o Bárbaro segue
 * com a árvore do Guerreiro) · 3) Passivas (somam em heroStats) · 4) Save (aditivo, saves antigos, ida e volta)
 * · 5) Combate: cada habilidade ativa dispara na simulação (CAST forçado) e produz efeito/evento;
 *   a luta inteira com tudo aprendido roda sem erro e é determinística (mesma seed, mesmos eventos).
 * Uma linha por checagem: ok ou FALHA. Sai com código 1 se algo falhar.
 */
import { applyZone } from '../src/config/gameConfig';
import { TEST_ZONE } from '../src/dev/DevLab/skillArenaZone';
import { VOCATION_TREES, type VocationSkillSpec } from '../src/config/vocationSkills';
import { VOCATIONS, VOCATIONS_CONFIG } from '../src/config/vocations';
import { Simulation } from '../src/core/sim/Simulation';
import { ARCHETYPES, VOCATION_ARCHETYPES, archetypeOf } from '../src/core/archetypes/registry';
import {
  SKILLS,
  VOCATION_SKILLS,
  allHeroSkills,
  heroSkills,
  inHeroTree,
  investedSkillPoints,
  lvOf,
  missingRequirements,
  skillState,
  type HeroKind,
  type SkillId,
} from '../src/core/progression/skills';
import { basicOf, lockedSkillKeys, slotSkills } from '../src/core/progression/skillSlots';
import { createProfile, evolve, heroStats, migrateProfile, setLevel, vocationOf, type Profile } from '../src/core/progression/profile';

let falhas = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${msg}`);
  if (!ok) falhas++;
};
const copia = (p: Profile): Profile => JSON.parse(JSON.stringify(p));
const NIVEL = VOCATIONS_CONFIG.level;

const BASE_IDS = new Set<string>(SKILLS.map((s) => s.id));
const TREE_IDS = Object.keys(VOCATION_TREES);

console.log('\n1) Dados');
for (const vid of TREE_IDS) {
  const t = VOCATION_TREES[vid];
  const sk = t.skills;
  check(sk.length === 20, `${vid}: 20 habilidades (${sk.length})`);
  check(new Set(sk.map((s) => s.id)).size === sk.length, `${vid}: ids únicos dentro da árvore`);
  check(sk.every((s) => !BASE_IDS.has(s.id)), `${vid}: ids não colidem com as habilidades da classe`);
  check(new Set(sk.map((s) => s.name)).size === sk.length, `${vid}: nomes únicos`);
  check(sk.every((s) => s.name.trim() && s.desc.trim()), `${vid}: nome e descrição em pt-BR preenchidos`);
  check(new Set(sk.map((s) => `${s.tier}:${s.col}`)).size === sk.length, `${vid}: nenhuma posição (tier, coluna) repetida`);
  check(sk.every((s) => s.tier >= 1 && s.tier <= 3 && s.col >= 0 && s.col <= 6), `${vid}: tiers 1 a 3 e colunas 0 a 6`);
  const ids = new Set(sk.map((s) => s.id));
  check(sk.every((s) => s.requires.every((r) => ids.has(r.id))), `${vid}: requisitos apontam para habilidades da própria árvore`);
  const byId = Object.fromEntries(sk.map((s) => [s.id, s]));
  check(sk.every((s) => s.requires.every((r) => r.level <= byId[r.id].maxLevel)), `${vid}: requisitos cabem no nível máximo`);
  check(sk.every((s) => s.requires.every((r) => byId[r.id].tier < s.tier || (byId[r.id].tier === s.tier && byId[r.id].col < s.col))), `${vid}: requisitos vêm de tier anterior`);
  const basic = byId[t.basic];
  check(!!basic && basic.kind === 'active' && basic.start === 1, `${vid}: básico é ativo e começa aprendido`);
  check(sk.filter((s) => s.start > 0).length === 1, `${vid}: só o básico começa aprendido`);
  check(sk.every((s) => s.kind === 'active' || s.behavior || s.stat), `${vid}: toda passiva tem efeito (atributo ou comportamento)`);
  check(sk.every((s) => s.kind === 'passive' || (s.behavior !== undefined)), `${vid}: toda ativa tem comportamento na simulação`);
  const icones = sk.map((s) => s.icon);
  check(new Set(icones).size === sk.length, `${vid}: cada habilidade tem um ícone diferente`);
  check(sk.filter((s) => s.kind === 'passive').length === (vid === 'crusado' ? 5 : 4), `${vid}: passivas: ${sk.filter((s) => s.kind === 'passive').length}`);
}
check(VOCATIONS.warrior[1]?.id === 'crusado' && VOCATIONS.warlock[0]?.id === 'hypnomancer', 'vagas: Crusado (Guerreiro) e Hypnomancer (Bruxa)');
check(Object.keys(ARCHETYPES).length === 6 && Object.keys(VOCATION_ARCHETYPES).length === 2, 'registro: 6 classes e 2 arquétipos de vocação');
check(TREE_IDS.every((vid) => VOCATIONS.warrior.some((v) => v?.id === vid) || VOCATIONS.warlock.some((v) => v?.id === vid)), 'árvores só para vocações que existem');
check(VOCATION_SKILLS.length === 40, `40 habilidades de vocação no catálogo do jogo (${VOCATION_SKILLS.length})`);
check(new Set(VOCATION_SKILLS.map((s) => s.id)).size === 40, 'ids de vocação únicos no jogo inteiro');

console.log('\n2) Escolha e árvore');
const p = createProfile();
setLevel(p, 'warrior', NIVEL);
check(evolve(p, 'warrior', 'crusado') === undefined, 'Guerreiro no nível 10 escolhe o Crusado');
check(p.heroes.warrior.skills.corteCruzado === 1, 'o básico do Crusado (Corte Cruzado) entra aprendido');
check(heroSkills('warrior', 'crusado').length === 20, 'a árvore mostrada é a do Crusado (20)');
check(heroSkills('warrior', 'barbarian').length === heroSkills('warrior').length, 'Bárbaro: segue com a árvore do Guerreiro');
check(!inHeroTree('warrior', 'crusado', 'bash'), 'habilidades da classe base ficam fora da árvore do Crusado');
check(inHeroTree('warrior', 'crusado', 'perfuracao'), 'Perfuração está na árvore do Crusado');
check(basicOf('warrior', 'crusado') === 'corteCruzado', 'básico do Crusado = Corte Cruzado');
check(basicOf('warrior') === 'bash', 'Guerreiro sem vocação: básico continua Investida');
const q = createProfile();
setLevel(q, 'warlock', NIVEL);
check(evolve(q, 'warlock', 'hypnomancer') === undefined, 'Bruxa no nível 10 escolhe o Hypnomancer');
check(heroSkills('warlock', 'hypnomancer').length === 20 && inHeroTree('warlock', 'hypnomancer', 'controleMental'), 'árvore do Hypnomancer tem Controle Mental');
check(basicOf('warlock', 'hypnomancer') === 'ataqueMagico', 'básico do Hypnomancer = Ataque Mágico');
check(slotSkills('warlock', 'hypnomancer').every((d) => d.vocation === 'hypnomancer'), 'slots do Hypnomancer só têm habilidades da árvore dele');
check(allHeroSkills('warrior').length === SKILLS.filter((s) => s.hero === 'warrior').length + 20, 'allHeroSkills: classe base + árvore do Crusado (para devolver pontos)');
const pq = createProfile();
check(heroStats(pq, 'warlock').maxHp > 0 && archetypeOf('warlock').id === 'warlock', 'sem vocação, o arquétipo é o da classe');
check(archetypeOf('warrior', 'crusado').id === 'crusado' && archetypeOf('warrior', 'barbarian').id === 'warrior', 'arquétipo: Crusado usa o seu; Bárbaro segue o do Guerreiro');
check(archetypeOf('warlock', 'hypnomancer').id === 'hypnomancer' && !!VOCATION_ARCHETYPES.crusado && !!ARCHETYPES.warrior, 'arquétipos registrados');
check(archetypeOf('mage', 'crusado').id === 'mage', 'vocação de outra classe não troca o arquétipo');

console.log('\n3) Passivas (somam em heroStats)');
const base = createProfile();
setLevel(base, 'warrior', NIVEL);
evolve(base, 'warrior', 'crusado');
const st0 = heroStats(base, 'warrior');
const up = copia(base);
for (const id of ['determinacao', 'forcaDivina', 'revidar', 'soproDeLuz', 'auraDeProtecao']) up.heroes.warrior.skills[id as SkillId] = 5;
const st1 = heroStats(up, 'warrior');
check(st1.maxHp > st0.maxHp, `Determinação: vida ${st0.maxHp} → ${st1.maxHp}`);
check(st1.classPower > st0.classPower, `Força Divina: poder ${st0.classPower.toFixed(3)} → ${st1.classPower.toFixed(3)}`);
check(st1.cleaveDamage > st0.cleaveDamage, 'Força Divina também sobe o dano do golpe da classe');
check(JSON.stringify(up.heroes.warrior.attrs) === JSON.stringify(base.heroes.warrior.attrs), 'passivas não mexem nos atributos guardados');
const hq = createProfile();
setLevel(hq, 'warlock', NIVEL);
evolve(hq, 'warlock', 'hypnomancer');
const hq0 = heroStats(hq, 'warlock');
hq.heroes.warlock.skills.escudoMagico = 5;
hq.heroes.warlock.skills.conjuracaoRapida = 5;
hq.heroes.warlock.skills.cicloArcano = 5;
const hq1 = heroStats(hq, 'warlock');
check(hq1.block > hq0.block && hq1.damageTakenMult < hq0.damageTakenMult, `Escudo Mágico: bloqueio ${hq0.block.toFixed(2)} → ${hq1.block.toFixed(2)}`);
check(hq1.crit > hq0.crit, 'Conjuração Rápida: crítico sobe');
check(hq1.cooldownMult < hq0.cooldownMult, 'Ciclo Arcano: Skill Haste (recarga menor)');

console.log('\n4) Save');
const ida = copia(up);
migrateProfile(ida);
check(JSON.stringify(ida) === JSON.stringify(up), 'salvar e carregar: a árvore do Crusado volta igual');
check(vocationOf('warrior', ida.heroes.warrior)?.id === 'crusado', 'a vocação continua gravada');
const velho = copia(base);
delete (velho.heroes.warrior.skills as Record<string, unknown>).corteCruzado;
migrateProfile(velho);
check(velho.heroes.warrior.skills.corteCruzado === 1, 'save da vocação sem o básico novo: o básico entra (aditivo)');
const antigo = copia(base);
delete antigo.heroes.warrior.vocation;
for (const k of Object.keys(antigo.heroes.warrior.skills)) if (VOCATION_SKILLS.some((s) => s.id === k)) delete (antigo.heroes.warrior.skills as Record<string, unknown>)[k];
const antes = JSON.stringify(antigo.heroes.warrior.skills);
migrateProfile(antigo);
check(vocationOf('warrior', antigo.heroes.warrior) === undefined, 'save antigo sem vocação abre como Guerreiro');
check(JSON.stringify(antigo.heroes.warrior.skills) === antes, 'save antigo: nenhuma habilidade da classe muda');
const fantasma = copia(base);
fantasma.heroes.warrior.vocation = 'nao-existe';
migrateProfile(fantasma);
check(fantasma.heroes.warrior.vocation === undefined, 'vocação desconhecida sai na migração');
const duas = copia(ida);
migrateProfile(duas);
check(JSON.stringify(duas) === JSON.stringify(ida), 'migração é idempotente');
const ptsBase = investedSkillPoints('warrior', up.heroes.warrior.skills);
check(ptsBase > 0, `pontos investidos contam a árvore da vocação (${ptsBase})`);
check(missingRequirements(up.heroes.warrior.skills, 'lancaSagrada').length > 0 || lvOf(up.heroes.warrior.skills, 'perfuracao') >= 3, 'requisitos de vocação são lidos pelo save');
check(skillState(up.heroes.warrior.skills, 'redencao') !== 'max', 'estado de habilidade funciona para a árvore da vocação');

// ---------------- 5) Combate ----------------
console.log('\n5) Combate');
const WX = 19;
const WY = 14;
type Layout = { foes: [number, number][] };
/** Cenário pronto para cada comportamento: inimigos-bonecos (não atacam, vida alta) em posições conhecidas. */
const LAYOUT: Record<string, Layout> = {
  default: { foes: [[1, 0]] },
  charge: { foes: [[3, 0]] },
  chain: { foes: [[1, 0], [2, 1], [3, 0], [4, 1]] },
  blink: { foes: [[1, 0]] },
  cross: { foes: [[0, 1], [0, 2], [1, 0], [2, 0], [-1, 0]] },
};
/** Cenário de teste. `warm`: um passo da simulação antes (monta o campo de fluxo que a armadilha usa), como no jogo. */
function scene(vid: string, _spec: VocationSkillSpec, level: number, layoutKey: string, warm = false) {
  applyZone(TEST_ZONE);
  const profile = createProfile();
  const kind: HeroKind = VOCATION_TREES[vid].hero === 'warlock' ? 'warlock' : 'warrior';
  setLevel(profile, kind, NIVEL);
  evolve(profile, kind, vid);
  for (const s of VOCATION_TREES[vid].skills) profile.heroes[kind].skills[s.id as SkillId] = Math.max(s.start, level);
  const stats = heroStats(profile, kind);
  stats.crit = 0; // número exato: sem sorteio de crítico
  const sim = new Simulation({ members: [{ archetype: kind, x: WX, y: WY }], barriers: [] }, 4242, {
    [kind]: { stats, level: NIVEL, exp: 0, locked: [], vocation: vid },
  });
  sim.mods = { ...sim.mods, combatMovement: false };
  sim.start();
  const u = sim.sortedUnits('party')[0];
  for (const [dx, dy] of LAYOUT[layoutKey].foes) sim.spawnEnemyAt('trainingDummy', WX + dx, WY + dy, 1e6);
  if (warm) sim.step();
  return { sim, u };
}
const DAMAGE_BEHAVIORS = new Set(['melee', 'charge', 'line', 'cone', 'areaSelf', 'areaTarget', 'bolt', 'chain']);
for (const vid of TREE_IDS) {
  for (const spec of VOCATION_TREES[vid].skills.filter((s) => s.kind === 'active')) {
    const layoutKey = spec.behavior === 'charge' ? 'charge' : spec.behavior === 'chain' ? 'chain' : spec.behavior === 'blink' ? 'blink' : 'default';
    // a armadilha escolhe o tile pelo caminho da horda, que só existe com cidade (a arena não tem): ver abaixo
    if (spec.behavior === 'trap') {
      const { sim, u } = scene(vid, spec, 3, layoutKey, false);
      const at = { x: WX + 2, y: WY };
      const placed = sim.placeTrap(u.id, at, 10, 0, 1, { kind: 'mine', radius: 1, stunTicks: 10 });
      const evs = sim.flushEvents();
      check(placed && evs.some((e) => e.type === 'trapSet'), `${vid} · ${spec.name} (trap): a mina arma no tile escolhido (o tile pelo caminho da horda é checado no jogo)`);
      continue;
    }
    const { sim, u } = scene(vid, spec, 3, layoutKey);
    if (spec.behavior === 'heal' || spec.id === 'redencao') u.hp = u.maxHp - 30; // alguém ferido para curar
    sim.flushEvents();
    const fired = sim.castSkill(u, spec.id);
    const evs = sim.flushEvents();
    const dmg = evs.filter((e) => e.type === 'damage' && e.unitId !== u.id).length;
    const cdOk = (u.cooldowns[spec.id] ?? 0) > sim.tick || spec.id === 'blink';
    const okDmg = !DAMAGE_BEHAVIORS.has(spec.behavior ?? '') || dmg > 0;
    check(fired && evs.length > 0 && okDmg && cdOk, `${vid} · ${spec.name} (${spec.behavior}): dispara, ${evs.length} evento(s)${dmg ? `, ${dmg} dano` : ''}`);
  }
}
// passivas: anunciadas no começo da luta e sem erro durante o tick
for (const vid of TREE_IDS) {
  const passivas = VOCATION_TREES[vid].skills.filter((s) => s.kind === 'passive');
  const { sim } = scene(vid, passivas[0], 3, 'default', false);
  let procs = 0;
  sim.onEvent((e) => {
    if (e.type === 'cardProc') procs++;
  });
  for (let i = 0; i < 5; i++) sim.step();
  check(procs === passivas.length, `${vid}: ${passivas.length} passiva(s) anunciadas na luta (${procs})`);
}

// luta inteira com a árvore toda aprendida: roda sem erro e é determinística
const fight = (vid: string): string => {
  const { sim } = scene(vid, VOCATION_TREES[vid].skills[0], 4, 'default');
  for (let i = 0; i < 6; i++) sim.spawnEnemyAt('grunt', WX + 4 + (i % 3), WY - 3 + i, 30);
  const sig: string[] = [];
  sim.onEvent((e) => sig.push(e.type));
  for (let i = 0; i < 400; i++) sim.step();
  return `${sig.length}:${sig.slice(0, 50).join(',')}:${sim.killed}:${sim.tick}`;
};
for (const vid of TREE_IDS) {
  let ok = true;
  let a = '';
  let b = '';
  try {
    a = fight(vid);
    b = fight(vid);
  } catch (err) {
    ok = false;
    console.log(String(err));
  }
  check(ok && a === b && a.length > 0, `${vid}: luta de 400 ticks sem erro e idêntica entre duas execuções (${a.split(':')[0]} eventos)`);
}

// lockedSkillKeys: o que não está nos slots de Mana nunca dispara (cooldown travado)
{
  const lk = lockedSkillKeys('warrior', { corteCruzado: 1, impactoDevoto: 3, escudoDeFe: 2 }, 0, undefined, 'crusado');
  check(lk.includes('impactoDevoto') && lk.includes('escudoDeFe'), 'slots: habilidades do Crusado fora dos slots ficam travadas');
  check(!lk.includes('corteCruzado'), 'slots: o básico nunca fica travado');
}

if (falhas) throw new Error(`${falhas} falha(s) na checagem das vocações (habilidades).`);
console.log('\nTudo certo: árvores das vocações íntegras.');
