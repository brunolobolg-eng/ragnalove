/**
 * Checagem de save da árvore global (Profile v2). Rode: npm run arvore:save:check
 * (a) Save v1 da jornada abre: Zeni, almas, níveis e heróis faltantes preservados; vira versão 2 com árvore vazia.
 * (b) Efeito zero: status dos heróis não mudam com a migração (o jogador antigo joga igual).
 * (c) Os pontos de árvore dos níveis já conquistados entram sem precisar de nada.
 * (d) Migração idempotente (jornada e perfil mínimo) e ida e volta do v2 sem perda.
 * (e) Árvore corrompida ou editada: o que é inválido sai, o que é válido fica (requisito de ligação, Mastery, limite).
 * (f) Bastião com Profile v1 abre e vira v2.
 */
import { arvoreVazia, normalizarArvore, pontosTotais, atribuirMastery, comprarNo, reorganizarArvore } from '../src/core/progression/arvore';
import { PROFILE_VERSION, createProfile, heroStats, migrateProfile, type Profile } from '../src/core/progression/profile';
import { migrateRun, newRun, type RunState } from '../src/core/run/run';
import { migrateBastion, newBastion, type BastionState } from '../src/core/bastion/bastion';
import { emptyCollection } from '../src/core/progression/cards';
import { HERO_ORDER } from '../src/config/heroes';
import type { HeroKind } from '../src/core/progression/skills';

let falhas = 0;
let total = 0;
const check = (label: string, cond: boolean, extra = '') => {
  total++;
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) falhas++;
};

/** Profile no formato v1 (antes da árvore): o mesmo que os saves de antes deste protótipo guardavam. */
function perfilV1(): Record<string, unknown> {
  const p = createProfile();
  p.heroes.warrior.level = 6;
  p.heroes.warrior.exp = 12;
  p.heroes.warrior.points = 3;
  p.heroes.warrior.skillPoints = 5;
  p.heroes.warrior.attrs.str = 9;
  p.heroes.mage.level = 4;
  p.zeni = 340;
  p.souls = 22;
  const v1: Record<string, unknown> = { ...p, version: 1 };
  delete v1.arvore;
  return v1;
}

/** Jornada no formato v1 (version 1 da RunState), com o perfil dado. */
function jornadaV1(profile: unknown): RunState {
  return {
    version: 1,
    seed: 99,
    act: 1,
    node: 2,
    profile,
    dead: [],
    history: [],
    kills: 4,
    party: ['warrior', 'mage'],
    cityHp: 80,
    cityMaxHp: 100,
    nights: 2,
    reports: [],
    usedObjects: [],
  } as unknown as RunState;
}

const textoV1 = JSON.stringify(jornadaV1(perfilV1()));

// ---------------- (a) save v1 da jornada abre ----------------
let abriu = true;
let r: RunState = jornadaV1({});
try {
  r = migrateRun(JSON.parse(textoV1) as RunState);
} catch (e) {
  abriu = false;
  console.log(String(e));
}
check('save v1 da jornada abre sem erro', abriu);
check('perfil vira versão 2', r.profile.version === PROFILE_VERSION && PROFILE_VERSION === 2);
check('árvore entra vazia (nenhum nó, nenhuma Mastery)', JSON.stringify(r.profile.arvore) === JSON.stringify(arvoreVazia()));
check('Zeni e almas preservados', r.profile.zeni === 340 && r.profile.souls === 22, `zeni ${r.profile.zeni} · almas ${r.profile.souls}`);
check('níveis, EXP e pontos do Guerreiro preservados', r.profile.heroes.warrior.level === 6 && r.profile.heroes.warrior.exp === 12 && r.profile.heroes.warrior.points === 3);
check('atributo alterado do Guerreiro preservado', r.profile.heroes.warrior.attrs.str === 9);
check('a jornada (party, cidade, nós) continua igual', r.party.join(',') === 'warrior,mage' && r.cityHp === 80 && r.act === 1 && r.node === 2 && r.kills === 4);
check('os seis heróis existem depois de abrir', HERO_ORDER.every((k) => !!r.profile.heroes[k]));

// ---------------- (b) efeito zero na migração ----------------
{
  const antes = JSON.parse(JSON.stringify(perfilV1())) as Profile;
  const statsAntes = JSON.stringify(HERO_ORDER.map((k) => heroStats(antes, k)));
  const depois = migrateProfile(JSON.parse(JSON.stringify(perfilV1())) as Profile);
  const statsDepois = JSON.stringify(HERO_ORDER.map((k) => heroStats(depois, k)));
  check('status dos heróis iguais antes e depois da migração', statsAntes === statsDepois);
}

// ---------------- (c) pontos pelos níveis já conquistados ----------------
check('pontos de árvore dos níveis antigos entram sozinhos', pontosTotais(r.profile) === (6 - 1) + (4 - 1), `${pontosTotais(r.profile)} pontos`);

// ---------------- (d) idempotência e ida e volta ----------------
{
  const m1 = JSON.stringify(migrateRun(JSON.parse(textoV1) as RunState));
  const m2 = JSON.stringify(migrateRun(JSON.parse(m1) as RunState));
  check('migração da jornada é idempotente', m1 === m2);
}
{
  const minimo = { version: 1, souls: 5, zeni: 90, heroes: { warrior: { level: 4, exp: 10, attrs: { str: 7, int: 1, vit: 5, dex: 3, luk: 1 }, points: 0, skills: {}, skillPoints: 3, equipment: {}, cards: [] } }, inventory: [] };
  const m1 = JSON.stringify(migrateProfile(JSON.parse(JSON.stringify(minimo)) as Profile));
  const m2 = JSON.stringify(migrateProfile(JSON.parse(m1) as Profile));
  check('perfil mínimo (campos faltando) migra e é idempotente', m1 === m2 && JSON.parse(m1).heroes.assassin !== undefined && JSON.parse(m1).version === 2);
}
{
  // save v2 com árvore real: volta pelo JSON igualzinho
  const p = createProfile();
  p.zeni = 500;
  p.heroes.warrior.level = 5;
  comprarNo(p, 'vigorDoReino');
  comprarNo(p, 'escudoAntigo');
  comprarNo(p, 'pontoBarreira');
  atribuirMastery(p, 'barreiraDeContencao', 'warrior');
  const texto = JSON.stringify(p);
  const volta = JSON.stringify(migrateProfile(JSON.parse(texto) as Profile));
  check('save v2 com árvore volta pelo JSON sem perda', volta === texto);
  check('depois de voltar, a Mastery continua com o Guerreiro', (JSON.parse(volta) as Profile).arvore?.masteries.barreiraDeContencao === 'warrior');
}
{
  // reorganizar e salvar: a árvore volta vazia com o contador
  const p = createProfile();
  p.zeni = 500;
  p.heroes.warrior.level = 5;
  comprarNo(p, 'vigorDoReino');
  reorganizarArvore(p);
  const volta = migrateProfile(JSON.parse(JSON.stringify(p)) as Profile);
  check('reorganização sobrevive ao save (contador e árvore vazia)', volta.arvore?.reorganizacoes === 1 && volta.arvore.comprados.length === 0);
}

// ---------------- (e) árvore corrompida ou editada ----------------
{
  const n = normalizarArvore({ comprados: ['naoExiste', 'nucleo', 'vigorDoReino', 'vigorDoReino', 'pontoBarreira'], masteries: {}, reorganizacoes: 0 });
  check('id desconhecido e raiz saem; repetido conta uma vez; sem ligação não fica', JSON.stringify(n.comprados) === JSON.stringify(['vigorDoReino']), JSON.stringify(n.comprados));
}
{
  const n = normalizarArvore({ comprados: ['escudoAntigo', 'vigorDoReino'], masteries: {}, reorganizacoes: 0 });
  check('nós fora de ordem no save ficam (o ponto fixo liga tudo)', JSON.stringify(n.comprados) === JSON.stringify(['escudoAntigo', 'vigorDoReino']));
}
{
  const n = normalizarArvore({
    comprados: ['vigorDoReino', 'escudoAntigo', 'pontoBarreira'],
    masteries: { barreiraDeContencao: 'warrior', pressaoTatica: 'mage', golpeDeMisericordia: 'archer' },
    reorganizacoes: 0,
  });
  check('Mastery válida fica; sem nó aberto, inelegível ou de outro herói, sai', JSON.stringify(n.masteries) === JSON.stringify({ barreiraDeContencao: 'warrior' }), JSON.stringify(n.masteries));
}
{
  const n = normalizarArvore({
    comprados: ['vigorDoReino', 'escudoAntigo', 'pontoBarreira', 'sortePeregrina', 'pontoPressao'],
    masteries: { pressaoTatica: 'warrior', barreiraDeContencao: 'warrior' },
    reorganizacoes: 0,
  });
  check('limite de uma Mastery por herói: fica a primeira em ordem (determinística)', JSON.stringify(n.masteries) === JSON.stringify({ barreiraDeContencao: 'warrior' }), JSON.stringify(n.masteries));
}
{
  const cases: [unknown, number][] = [[-3, 0], [2.5, 0], ['x', 0], [2, 2], [undefined, 0]];
  for (const [raw, esperado] of cases) {
    const n = normalizarArvore({ comprados: [], masteries: {}, reorganizacoes: raw });
    check(`reorganizações ${String(raw)} vira ${esperado}`, n.reorganizacoes === esperado, `obtido ${n.reorganizacoes}`);
  }
}
{
  check('árvore nula ou texto vira árvore vazia', JSON.stringify(normalizarArvore(null)) === JSON.stringify(arvoreVazia()) && JSON.stringify(normalizarArvore('lixo')) === JSON.stringify(arvoreVazia()));
  check('Mastery com valor que não é herói sai', JSON.stringify(normalizarArvore({ comprados: ['pontoBarreira'], masteries: { barreiraDeContencao: 42 }, reorganizacoes: 0 }).masteries) === '{}');
}
{
  // save com árvore corrompida passa pela migração do Profile sem quebrar nada
  const p = createProfile();
  p.arvore = { comprados: ['x', 'pontoBarreira'], masteries: { barreiraDeContencao: 'warrior' as HeroKind }, reorganizacoes: -1 };
  const m = migrateProfile(JSON.parse(JSON.stringify(p)) as Profile);
  check('Profile com árvore corrompida migra sem perder o resto', m.zeni === 0 && m.arvore?.comprados.length === 0 && Object.keys(m.arvore?.masteries ?? {}).length === 0 && m.arvore?.reorganizacoes === 0);
}

// ---------------- (f) bastião com Profile v1 ----------------
{
  const b = newBastion(7, emptyCollection());
  const v1 = JSON.parse(JSON.stringify(b)) as BastionState;
  (v1.profile as unknown as Record<string, unknown>).version = 1;
  delete (v1.profile as Partial<Profile>).arvore;
  v1.profile.zeni = 260;
  const m = migrateBastion(JSON.parse(JSON.stringify(v1)) as BastionState);
  check('bastião com Profile v1 abre e o perfil vira v2', m.profile.version === 2 && JSON.stringify(m.profile.arvore) === JSON.stringify(arvoreVazia()));
  check('Zeni do bastião preservado na migração', m.profile.zeni === 260);
  const m2 = JSON.stringify(migrateBastion(JSON.parse(JSON.stringify(m)) as BastionState));
  check('migração do bastião é idempotente', m2 === JSON.stringify(m));
}

// ---------------- (g) partida nova nasce no formato atual ----------------
check('perfil novo nasce em versão 2 com árvore vazia', createProfile().version === 2 && JSON.stringify(newRun('warrior', 1).profile.arvore) === JSON.stringify(arvoreVazia()));

console.log(`\n${total - falhas}/${total} ok${falhas ? ` · ${falhas} FALHA(S)` : ''}`);
if (falhas) throw new Error(`arvoreSaveCheck: ${falhas} falha(s)`);
