/**
 * Checagem headless das vocações (sem renderização). Rode: npm run vocation:check
 * 1) Dados · 2) Escolha (nível, uma vez por jornada, classe certa) · 3) Atributos (o bônus soma,
 * sem virar pontos gastos) · 4) Save (ida e volta, saves antigos, ids que não existem).
 */
import { VOCATIONS, VOCATIONS_CONFIG, type VocationDef } from '../src/config/vocations';
import { HERO_NAME, HERO_ORDER } from '../src/config/heroes';
import { ATTR_KEYS } from '../src/core/progression/attributes';
import {
  createProfile,
  evolve,
  evolveBlocker,
  heroDisplayName,
  heroStats,
  migrateProfile,
  setLevel,
  spentPoints,
  vocationOf,
  type Profile,
} from '../src/core/progression/profile';

let falhas = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${msg}`);
  if (!ok) falhas++;
};
const copia = (p: Profile): Profile => JSON.parse(JSON.stringify(p));
const NIVEL = VOCATIONS_CONFIG.level;

console.log('\n1) Dados');
for (const k of HERO_ORDER) check(VOCATIONS[k].length === 2, `${k}: duas vagas`);
const todas = HERO_ORDER.flatMap((k) => VOCATIONS[k]).filter((v): v is VocationDef => v !== null);
const ids = todas.map((v) => v.id);
check(new Set(ids).size === ids.length, 'ids de vocação únicos');
for (const v of todas) {
  check(v.nome.trim().length > 0 && v.descricao.trim().length > 0, `${v.id}: nome e descrição preenchidos`);
  check(Object.keys(v.bonus).every((k) => (ATTR_KEYS as string[]).includes(k)), `${v.id}: bônus só em atributos válidos`);
}
check(VOCATIONS.warrior[0]?.id === 'barbarian', 'Guerreiro: a primeira vaga é o Bárbaro');

console.log('\n2) Escolha');
const p = createProfile();
check(evolveBlocker(p, 'warrior', 'barbarian') !== undefined, 'nível 1: não pode evoluir ainda');
setLevel(p, 'warrior', NIVEL);
check(evolve(p, 'warrior', 'barbarian') === undefined, `nível ${NIVEL}: evolui para o Bárbaro`);
check(vocationOf('warrior', p.heroes.warrior)?.id === 'barbarian', 'a vocação fica gravada no herói');
check(evolve(p, 'warrior', 'barbarian') !== undefined, 'segunda escolha na mesma jornada é recusada');
setLevel(p, 'mage', NIVEL);
check(evolve(p, 'mage', 'barbarian') !== undefined, 'vocação de outra classe é recusada');
check(evolve(p, 'mage', 'nao-existe') !== undefined, 'vaga sem desenho (Em breve) é recusada');
check(heroDisplayName(p, 'warrior') === 'Bárbaro', 'nome na interface: o Bárbaro');
check(heroDisplayName(p, 'mage') === HERO_NAME.mage, 'nome na interface: classe base sem vocação');

console.log('\n3) Atributos');
const base = createProfile();
setLevel(base, 'warrior', NIVEL);
const evoluido = copia(base);
evolve(evoluido, 'warrior', 'barbarian');
const stBase = heroStats(base, 'warrior');
const stEvo = heroStats(evoluido, 'warrior');
check(stEvo.maxHp > stBase.maxHp, `vida: ${stBase.maxHp} → ${stEvo.maxHp} (Vitalidade da vocação)`);
check(stEvo.cleaveDamage > stBase.cleaveDamage, `dano do golpe: ${stBase.cleaveDamage.toFixed(1)} → ${stEvo.cleaveDamage.toFixed(1)} (Força da vocação)`);
check(spentPoints(evoluido.heroes.warrior, 'warrior') === spentPoints(base.heroes.warrior, 'warrior'), 'o bônus não conta como ponto gasto (pode ser redistribuído)');
check(JSON.stringify(evoluido.heroes.warrior.attrs) === JSON.stringify(base.heroes.warrior.attrs), 'os atributos guardados não mudam (o bônus fica à parte)');

console.log('\n4) Save');
const ida = copia(evoluido);
migrateProfile(ida);
check(vocationOf('warrior', ida.heroes.warrior)?.id === 'barbarian', 'a vocação sobrevive a salvar e carregar');
check(heroStats(ida, 'warrior').maxHp === stEvo.maxHp, 'os status são os mesmos depois de carregar');
const antigo = copia(base);
delete antigo.heroes.warrior.vocation;
migrateProfile(antigo);
check(vocationOf('warrior', antigo.heroes.warrior) === undefined, 'save antigo (sem o campo) abre como classe base');
check(heroStats(antigo, 'warrior').maxHp === stBase.maxHp, 'save antigo mantém os status de antes');
const fantasma = copia(evoluido);
fantasma.heroes.warrior.vocation = 'fantasma';
migrateProfile(fantasma);
check(fantasma.heroes.warrior.vocation === undefined, 'vocação desconhecida sai na migração');
const trocada = copia(evoluido);
trocada.heroes.mage.vocation = 'barbarian';
migrateProfile(trocada);
check(trocada.heroes.mage.vocation === undefined, 'vocação de outra classe sai na migração');
const duas = copia(ida);
migrateProfile(duas);
check(JSON.stringify(duas) === JSON.stringify(ida), 'migração é idempotente (rodar de novo não muda nada)');

if (falhas) throw new Error(`${falhas} falha(s) na checagem de vocações.`);
console.log('\nTudo certo: vocações íntegras.');
