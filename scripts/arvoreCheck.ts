/**
 * Checagem headless da Árvore Global de progressão e das Masteries táticas. Rode: npm run arvore:check
 * (a) Desenho: dados válidos, ciclo de caminho alternativo, pontos vindos do progresso.
 * (b) Nós: caminho inválido, requisito de ligação, pontos insuficientes, nó já aberto, compatibilidade.
 * (c) Masteries: Zen insuficiente, cancelamento sem gasto, elegibilidade, nível, uma por herói, troca cobra de novo.
 * (d) Mastery segue o personagem: a party muda e ela continua com o herói.
 * (e) Reorganizar: cobra Zen com custo crescente, zera nós e Masteries, e o efeito some (sem residual).
 * (f) Em luta: nada da árvore muda.
 * (g) Sem duplicar nem residual: nó repetido em save conta uma vez; Mastery sem o nó aberto não vale.
 * (h) Efeito real: nó aberto muda heroStats; reorganizar devolve exatamente os status de antes.
 */
import { ARVORE_CAPS_COMBATE, ARVORE_CAP_ATRIBUTO, ARVORE_CONFIG, ARVORE_ECONOMIA, CATEGORIA_IDS, ECO_KEYS, MASTERY_BY_ID, NOS, nosPorCategoria, type MasteryId } from '../src/config/arvoreGlobal';
import {
  BLOQUEIO_COMBATE,
  alcancavel,
  estadoNo,
  atribuirMastery,
  bonusDoHeroi,
  comprarNo,
  custoReorganizar,
  masteryDoHeroi,
  motivoComprarNo,
  pontosDisponiveis,
  pontosGastos,
  pontosTotais,
  previsaoAtribuir,
  previsaoReorganizar,
  removerMastery,
  reorganizarArvore,
  textoBonus,
  validarArvore,
  vizinhos,
  economiaDoPerfil,
  type ArvoreHost,
} from '../src/core/progression/arvore';
import { createProfile, heroStats, type Profile } from '../src/core/progression/profile';
import { newRun, precoMult, priceMult, repairCost, shopStock, unlockHero } from '../src/core/run/run';
import { newBastion, structureMaxHp } from '../src/core/bastion/bastion';
import { buildCostOf } from '../src/core/bastion/rules';
import { emptyCollection } from '../src/core/progression/cards';
import { GAME_CONFIG } from '../src/config/gameConfig';
import type { HeroKind } from '../src/core/progression/skills';

let falhas = 0;
let total = 0;
const check = (label: string, cond: boolean, extra = '') => {
  total++;
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) falhas++;
};

/** Perfil novo com os níveis dados (os outros heróis ficam no nível 1). */
function comNiveis(niveis: Partial<Record<HeroKind, number>>, zeni = 0): Profile {
  const p = createProfile();
  for (const [k, v] of Object.entries(niveis) as [HeroKind, number][]) p.heroes[k].level = v;
  p.zeni = zeni;
  return p;
}

const abrir = (h: ArvoreHost, ids: string[]) => ids.map((id) => comprarNo(h, id));
const semErro = (erros: (string | undefined)[]) => erros.every((e) => e === undefined);

// ---------------- (a) desenho ----------------
const erros = validarArvore();
check('desenho válido (validarArvore sem erros)', erros.length === 0, erros.join('; '));
check('100 ou mais nós na árvore', NOS.length >= 100, `${NOS.length} nós`);
const tipos = (t: string) => NOS.filter((n) => n.tipo === t).length;
check('tem comuns, notáveis, caminhos alternativos e pontos de Mastery', tipos('comum') > 0 && tipos('notavel') > 0 && tipos('caminho') > 0 && tipos('mastery') > 0, `comum ${tipos('comum')} · notável ${tipos('notavel')} · caminho ${tipos('caminho')} · mastery ${tipos('mastery')}`);
check('três Masteries táticas, cada uma com ponto próprio', ['barreiraDeContencao', 'golpeDeMisericordia', 'pressaoTatica'].every((id) => MASTERY_BY_ID[id] && NOS.some((n) => n.mastery === id)));
check('notável Muralha Viva tem duas rotas (caminho alternativo)', vizinhos('muralhaViva').length >= 2, vizinhos('muralhaViva').join(', '));
check('custo de reorganizar começa em 80 e sobe a cada uso', custoReorganizar(comNiveis({})) === ARVORE_CONFIG.reorganizarZen);
check('perfil novo tem 0 pontos de árvore', pontosTotais(createProfile()) === 0);

const pNiv = comNiveis({ warrior: 5, mage: 4 });
check('pontos = (nível − 1) por herói, somados', pontosTotais(pNiv) === 4 + 3, `${pontosTotais(pNiv)} pontos`);

// ---------------- (b) nós: requisitos e caminho ----------------
{
  const p = comNiveis({ warrior: 10 }); // 9 pontos
  check('nó sem ligação com o aberto não abre', (comprarNo(p, 'brasaEterna') ?? '').includes('Abra primeiro'));
  check('caminho inválido não gasta ponto', pontosDisponiveis(p) === 9, `${pontosDisponiveis(p)} pontos`);
  check('abrir um nó ligado ao núcleo funciona', comprarNo(p, 'vigorDoReino') === undefined && pontosDisponiveis(p) === 8);
  check('nó já aberto não abre de novo', (comprarNo(p, 'vigorDoReino') ?? '').includes('já está aberto') && pontosDisponiveis(p) === 8);
  check('nó ligado a um aberto abre (escudoAntigo)', comprarNo(p, 'escudoAntigo') === undefined && pontosDisponiveis(p) === 7);
  check('ponto de Mastery custa 2', comprarNo(p, 'pontoBarreira') === undefined && pontosDisponiveis(p) === 5);
  check('caminho alternativo abre e liga ao notável', semErro([comprarNo(p, 'caminhoDaMuralha'), comprarNo(p, 'muralhaViva')]) && pontosDisponiveis(p) === 2);
  check('pontos gastos batem com os nós abertos', pontosGastos(p) === 7, `${pontosGastos(p)} gastos`);
}
{
  // rota alternativa sozinha: o notável abre pelo caminho, sem passar pelo escudo nem pelo ponto de barreira
  const p = comNiveis({ warrior: 10 });
  check('rota alternativa abre o notável sem o escudo', semErro(abrir(p, ['vigorDoReino', 'caminhoDaMuralha', 'muralhaViva'])) && p.arvore?.comprados.includes('muralhaViva') === true && !p.arvore?.comprados.includes('escudoAntigo'));
  check('nó sem ligação com nada aberto não é alcançável', alcancavel(p, 'pontoMisericordia') === false && alcancavel(p, 'muralhaViva') === true);
}
{
  const p = comNiveis({ warrior: 2 }); // 1 ponto
  check('pontos insuficientes são avisados', semErro([comprarNo(p, 'vigorDoReino')]) && (comprarNo(p, 'escudoAntigo') ?? '').includes('Faltam 1 ponto'));
  check('pontos insuficientes não mudam nada', pontosDisponiveis(p) === 0 && p.arvore?.comprados.length === 1);
}
{
  // cancelar sem gastar: a pré-visualização não mexe em nada
  const p = comNiveis({ warrior: 5 }, 0);
  const antes = pontosDisponiveis(p);
  motivoComprarNo(p, 'vigorDoReino');
  check('pré-visualizar compra não gasta ponto nem abre nó', pontosDisponiveis(p) === antes && (p.arvore?.comprados.length ?? 0) === 0);
}

// ---------------- (c) masteries: Zen, elegibilidade, nível, uma por herói ----------------
{
  const p = comNiveis({ warrior: 5 }, 0); // 4 pontos
  abrir(p, ['vigorDoReino', 'escudoAntigo', 'pontoBarreira']);
  check('ponto de Mastery aberto com 4 pontos', pontosDisponiveis(p) === 0);
  const prev = previsaoAtribuir(p, 'barreiraDeContencao', 'warrior');
  check('pré-visualização mostra o custo antes de confirmar', prev.custo === ARVORE_CONFIG.atribuirZen && (prev.erro ?? '').includes('Zen insuficiente'), `custo ${prev.custo} · ${prev.erro}`);
  check('Zen insuficiente não atribui', (atribuirMastery(p, 'barreiraDeContencao', 'warrior') ?? '').includes('Zen insuficiente') && !p.arvore?.masteries.barreiraDeContencao && p.zeni === 0);
  p.zeni = ARVORE_CONFIG.atribuirZen - 1;
  check('um Zen a menos ainda não basta', (atribuirMastery(p, 'barreiraDeContencao', 'warrior') ?? '').includes('Zen insuficiente') && p.zeni === ARVORE_CONFIG.atribuirZen - 1);
  p.zeni = ARVORE_CONFIG.atribuirZen;
  check('com Zen suficiente atribui e cobra o custo', atribuirMastery(p, 'barreiraDeContencao', 'warrior') === undefined && p.zeni === 0 && p.arvore?.masteries.barreiraDeContencao === 'warrior');
  check('a Mastery vale para o herói depois de atribuída', masteryDoHeroi(p, 'warrior')?.id === 'barreiraDeContencao');
}
{
  // cancelar: a confirmação nunca roda; o Zen fica intacto
  const p = comNiveis({ warrior: 5 }, 200);
  abrir(p, ['vigorDoReino', 'escudoAntigo', 'pontoBarreira']);
  previsaoAtribuir(p, 'barreiraDeContencao', 'warrior');
  previsaoAtribuir(p, 'barreiraDeContencao', 'warrior');
  check('cancelar a atribuição não gasta Zen nem atribui', p.zeni === 200 && !p.arvore?.masteries.barreiraDeContencao);
}
{
  const p = comNiveis({ warrior: 5, mage: 4, warlock: 3 }, 1000);
  abrir(p, ['vigorDoReino', 'escudoAntigo', 'pontoBarreira', 'sortePeregrina', 'pontoPressao']); // 4 + 3 = 7 pontos
  check('mage não é elegível para Pressão Tática', (atribuirMastery(p, 'pressaoTatica', 'mage') ?? '').includes('não serve'));
  check('archer não é elegível para Barreira de Contenção', (atribuirMastery(p, 'barreiraDeContencao', 'archer') ?? '').includes('não serve'));
  check('Barreira só vale depois de atribuída', masteryDoHeroi(p, 'warrior') === undefined);
  check('atribui Barreira ao Guerreiro', atribuirMastery(p, 'barreiraDeContencao', 'warrior') === undefined && p.zeni === 1000 - ARVORE_CONFIG.atribuirZen);
  check('um herói só carrega uma Mastery', (atribuirMastery(p, 'pressaoTatica', 'warrior') ?? '').includes('já carrega outra'));
  // troca: a Barreira vai ao Bruxo e cobra de novo; o Guerreiro fica sem ela
  check('trocar de personagem cobra de novo', atribuirMastery(p, 'barreiraDeContencao', 'warlock') === undefined && p.zeni === 1000 - 2 * ARVORE_CONFIG.atribuirZen);
  check('Mastery trocada sai do antigo herói (sem duplicar)', masteryDoHeroi(p, 'warrior') === undefined && masteryDoHeroi(p, 'warlock')?.id === 'barreiraDeContencao');
}
{
  // nível mínimo: Pressão Tática pede nível 2
  const p = comNiveis({ warrior: 5, assassin: 1 }, 500);
  abrir(p, ['sortePeregrina', 'pontoPressao']);
  check('nível mínimo é checado na atribuição', (atribuirMastery(p, 'pressaoTatica', 'assassin') ?? '').includes('nível 2'));
  p.heroes.assassin.level = 2;
  check('com o nível mínimo, atribui', atribuirMastery(p, 'pressaoTatica', 'assassin') === undefined);
}

// ---------------- (d) Mastery segue o personagem (party muda) ----------------
{
  const run = newRun('warrior', 4242);
  const p = run.profile;
  p.heroes.warrior.level = 5;
  p.zeni = 500;
  abrir(p, ['vigorDoReino', 'escudoAntigo', 'pontoBarreira']);
  atribuirMastery(p, 'barreiraDeContencao', 'warrior');
  run.party = ['warrior'];
  const naParty = masteryDoHeroi(p, 'warrior')?.id;
  run.party = ['mage'];
  check('Mastery continua com o Guerreiro quando ele sai da party', masteryDoHeroi(p, 'warrior')?.id === 'barreiraDeContencao', `na party: ${naParty}`);
  check('o Mago não herda a Mastery do Guerreiro', masteryDoHeroi(p, 'mage') === undefined);
  check('efeito de nó compatível segue o Guerreiro fora da party', heroStats(p, 'warrior').attrs.vit > heroStats(createProfile(), 'warrior').attrs.vit);
  run.party = ['warrior', 'mage'];
  check('volta à party e a Mastery continua a mesma', masteryDoHeroi(p, 'warrior')?.id === 'barreiraDeContencao' && naParty === 'barreiraDeContencao');
}

// ---------------- (e) reorganizar: custo crescente, efeito some ----------------
{
  const p = comNiveis({ warrior: 5, mage: 4 }, 300);
  abrir(p, ['vigorDoReino', 'escudoAntigo', 'pontoBarreira']);
  atribuirMastery(p, 'barreiraDeContencao', 'warrior');
  check('antes de reorganizar: zen 240, Mastery ativa', p.zeni === 240 && masteryDoHeroi(p, 'warrior') !== undefined);
  const prev = previsaoReorganizar(p);
  check('pré-visualização da reorganização mostra custo 80', prev.custo === 80 && prev.erro === undefined, `custo ${prev.custo}`);
  check('reorganizar cobra Zen e zera nós e Masteries', reorganizarArvore(p) === undefined && p.zeni === 160 && (p.arvore?.comprados.length ?? 0) === 0 && Object.keys(p.arvore?.masteries ?? {}).length === 0);
  check('depois de reorganizar, pontos voltam todos', pontosDisponiveis(p) === pontosTotais(p) && pontosTotais(p) === 7);
  check('Mastery saiu do herói (sem residual)', masteryDoHeroi(p, 'warrior') === undefined);
  check('efeito de nó saiu (bônus zerado)', bonusDoHeroi(p, 'warrior').attrs.vit === undefined && Object.keys(bonusDoHeroi(p, 'warrior').passiva).length === 0);
  abrir(p, ['vigorDoReino']);
  check('segunda reorganização custa o dobro', previsaoReorganizar(p).custo === 160);
  p.zeni = 100; // menos que o custo (160): a reorganização não pode acontecer
  check('Zen insuficiente bloqueia a reorganização', (reorganizarArvore(p) ?? '').includes('Zen insuficiente') && p.zeni === 100 && p.arvore?.comprados.length === 1);
  check('remover Mastery que não existe avisa', (removerMastery(p, 'pressaoTatica') ?? '').includes('guardada'));
}
{
  // remover Mastery é de graça: a Mastery volta para a guarda
  const p = comNiveis({ warrior: 5 }, 200);
  abrir(p, ['vigorDoReino', 'escudoAntigo', 'pontoBarreira']);
  atribuirMastery(p, 'barreiraDeContencao', 'warrior');
  const zen = p.zeni;
  check('tirar a Mastery é de graça e volta à guarda', removerMastery(p, 'barreiraDeContencao') === undefined && p.zeni === zen && masteryDoHeroi(p, 'warrior') === undefined);
}

// ---------------- (f) em luta, nada muda ----------------
{
  const p = comNiveis({ warrior: 5 }, 1000);
  abrir(p, ['vigorDoReino', 'escudoAntigo', 'pontoBarreira']);
  atribuirMastery(p, 'barreiraDeContencao', 'warrior');
  const ctx = { emCombate: true };
  const antes = JSON.stringify(p.arvore) + p.zeni;
  check('comprar em luta é bloqueado', comprarNo(p, 'caminhoDaMuralha', ctx) === BLOQUEIO_COMBATE);
  check('atribuir em luta é bloqueado', atribuirMastery(p, 'pressaoTatica', 'warrior', ctx) === BLOQUEIO_COMBATE);
  check('tirar Mastery em luta é bloqueado', removerMastery(p, 'barreiraDeContencao', ctx) === BLOQUEIO_COMBATE);
  check('reorganizar em luta é bloqueado', reorganizarArvore(p, ctx) === BLOQUEIO_COMBATE);
  check('nada muda em luta', JSON.stringify(p.arvore) + p.zeni === antes);
  check('previsão em luta já mostra o bloqueio', previsaoReorganizar(p, ctx).erro === BLOQUEIO_COMBATE);
}

// ---------------- (g) sem duplicar, sem residual ----------------
{
  // save com o mesmo nó duas vezes: conta uma vez
  const p = comNiveis({ warrior: 5 });
  p.arvore = { comprados: ['vigorDoReino', 'vigorDoReino'], masteries: {}, reorganizacoes: 0 };
  check('nó repetido no save dá o bônus uma vez', bonusDoHeroi(p, 'warrior').attrs.vit === 1);
  check('nó repetido no save custa uma vez', pontosGastos(p) === 1);
}
{
  // Mastery guardada sem o nó aberto (save inconsistente) não tem efeito
  const p = comNiveis({ warrior: 5 }, 0);
  p.arvore = { comprados: [], masteries: { barreiraDeContencao: 'warrior' as HeroKind }, reorganizacoes: 0 };
  check('Mastery sem o ponto aberto não vale (sem residual)', masteryDoHeroi(p, 'warrior') === undefined);
  // Mastery para herói que não é elegível não vale
  const q = comNiveis({ mage: 5 }, 0);
  q.arvore = { comprados: ['pontoPressao', 'sortePeregrina'], masteries: { pressaoTatica: 'mage' as HeroKind }, reorganizacoes: 0 };
  check('Mastery para herói não elegível não vale', masteryDoHeroi(q, 'mage') === undefined);
  // Mastery abaixo do nível mínimo não vale
  const r = comNiveis({ assassin: 1 }, 0);
  r.arvore = { comprados: ['pontoPressao', 'sortePeregrina'], masteries: { pressaoTatica: 'assassin' as HeroKind }, reorganizacoes: 0 };
  check('Mastery abaixo do nível mínimo não vale', masteryDoHeroi(r, 'assassin') === undefined);
}
{
  // compatibilidade: nó só para magos não dá nada ao guerreiro
  const p = comNiveis({ warrior: 5, mage: 5 });
  abrir(p, ['chamaAntiga']);
  check('nó de magia dá Inteligência ao mago', bonusDoHeroi(p, 'mage').attrs.int === 1);
  check('nó de magia não dá nada ao guerreiro', bonusDoHeroi(p, 'warrior').attrs.int === undefined);
  check('nó "todos" dá a todos', bonusDoHeroi(p, 'warrior').attrs.vit === undefined && bonusDoHeroi(createProfile(), 'warrior').attrs.vit === undefined);
}

// ---------------- (h) efeito real em heroStats ----------------
{
  const p = comNiveis({ warrior: 5 }, 0);
  const base = JSON.stringify(heroStats(p, 'warrior'));
  abrir(p, ['vigorDoReino', 'escudoAntigo']);
  const com = heroStats(p, 'warrior');
  check('nó aberto muda os status do herói', JSON.stringify(com) !== base && com.attrs.vit === heroStats(createProfile(), 'warrior').attrs.vit + 1);
  check('nó de escudo dá bloqueio ao guerreiro', com.block > heroStats(createProfile(), 'warrior').block);
  p.zeni = 500;
  reorganizarArvore(p);
  check('depois de reorganizar, os status voltam exatamente aos de antes', JSON.stringify(heroStats(p, 'warrior')) === base);
}
{
  // texto (pt-BR) dos bônus
  const txt = textoBonus({ reduce: 0.02, hp: 0.06, vit: 2 });
  check('textos dos bônus em pt-BR', txt.includes('−2% de dano recebido') && txt.includes('+6% de vida máxima') && txt.includes('+2 de Vitalidade'), txt.join(' | '));
}
{
  // ids de Mastery são estáveis (vão para o save)
  const ids: MasteryId[] = ['barreiraDeContencao', 'golpeDeMisericordia', 'pressaoTatica'];
  check('ids de Mastery existem na configuração', ids.every((id) => MASTERY_BY_ID[id]?.id === id));
}

// ---------------- (i) estado de cada nó para a tela ----------------
{
  const p = comNiveis({ warrior: 2 }); // 1 ponto
  check('estado: raiz e nó aberto são "aberto"', estadoNo(p, 'nucleo') === 'aberto');
  check('estado: nó ligado e com ponto é "disponivel"', estadoNo(p, 'vigorDoReino') === 'disponivel');
  check('estado: nó sem ligação é "bloqueado"', estadoNo(p, 'brasaEterna') === 'bloqueado');
  check('estado: nó ligado sem ponto é "sem-pontos"', (comprarNo(p, 'vigorDoReino'), estadoNo(p, 'escudoAntigo')) === 'sem-pontos');
  check('estado: depois de abrir vira "aberto"', estadoNo(p, 'vigorDoReino') === 'aberto');
  check('estado: nó desconhecido é "bloqueado"', estadoNo(p, 'naoExiste') === 'bloqueado');
}

// ---------------- (j) categorias, tetos, crítico separado e economia ----------------
{
  const porCat = nosPorCategoria();
  const faltando = CATEGORIA_IDS.filter((c) => porCat[c] === 0);
  check('seis categorias com nós (progressão, campanha, bastião, combate, masteries, ligação)', CATEGORIA_IDS.length === 6 && faltando.length === 0, CATEGORIA_IDS.map((c) => `${c} ${porCat[c]}`).join(' · '));
  check('total de nós bate com a soma das categorias', CATEGORIA_IDS.reduce((s, c) => s + porCat[c], 0) === NOS.length);
  check('notáveis e caminhos (ligação) existem em número', NOS.filter((n) => n.categoria === 'ligacao').length >= 12);
  const ligados = NOS.filter((n) => n.categoria === 'ligacao').every((n) => vizinhos(n.id).length >= 2);
  check('cada caminho alternativo liga pelo menos dois nós', ligados);
}
{
  // tetos: nenhum nó passa do teto da economia nem dos caps de combate (validarArvore), e a economia com a árvore inteira aberta respeita os tetos
  const todos = NOS.filter((n) => n.tipo !== 'raiz').map((n) => n.id);
  const h = createProfile();
  h.heroes.warrior.level = 99;
  h.arvore = { comprados: todos, masteries: {}, reorganizacoes: 0 };
  const eco = economiaDoPerfil(h);
  const estourou = ECO_KEYS.filter((k) => eco[k] > ARVORE_ECONOMIA[k].teto);
  check('economia com a árvore inteira aberta respeita o teto de cada bônus', estourou.length === 0, estourou.join(', ') || 'ok');
  const pendentesAtivos = ECO_KEYS.filter((k) => !ARVORE_ECONOMIA[k].ligado && eco[k] !== 0);
  check('bônus sem gancho (pendentes) ficam em zero na economia', pendentesAtivos.length === 0);
  const tetosDeCombate = (['warrior', 'mage', 'archer', 'sorcerer', 'warlock', 'assassin'] as const).every((k) => {
    const b = bonusDoHeroi(h, k);
    const passivaOk = (Object.keys(b.passiva) as (keyof typeof ARVORE_CAPS_COMBATE)[]).every((p) => (b.passiva[p] ?? 0) <= ARVORE_CAPS_COMBATE[p] + 1e-9);
    const attrOk = (Object.values(b.attrs) as number[]).every((v) => v <= ARVORE_CAP_ATRIBUTO);
    return passivaOk && attrOk;
  });
  check('bônus de combate respeitam os caps de passiva e de atributo para todos os personagens', tetosDeCombate);
  check('teto de cada economia é positivo e existe na tabela', ECO_KEYS.every((k) => ARVORE_ECONOMIA[k].teto > 0));
  check('tetos de combate são frações entre 0 e 1 (ou 0,5 para dano crítico)', Object.values(ARVORE_CAPS_COMBATE).every((v) => v > 0 && v <= 1));
}
{
  // crítico (chance) e dano crítico são separados; velocidade de ataque é só Skill Haste
  const comCrit = NOS.filter((n) => n.bonus.crit !== undefined && n.bonus.critDano !== undefined);
  check('nenhum nó mistura chance de crítico e dano crítico', comCrit.length === 0);
  const laminas = NOS.find((n) => n.id === 'laminaPrecisa');
  check('Lâmina Precisa dá dano crítico (não chance)', laminas?.bonus.critDano !== undefined && laminas.bonus.crit === undefined);
  const ritmo = NOS.find((n) => n.id === 'ritmoDeBatalha');
  check('Ritmo de Batalha acelera pelo Skill Haste (único acelerador)', ritmo?.bonus.haste !== undefined && Object.keys(ritmo.bonus).length === 1);
}
{
  // economia ligada: a escolha de um nó de Zen/EXP/pontos aparece no cálculo
  const h = createProfile();
  h.heroes.warrior.level = 9;
  h.zeni = 500;
  h.arvore = { comprados: ['estudoDeCampo'], masteries: {}, reorganizacoes: 0 };
  check('EXP em combate: nó aberto soma +3%', Math.abs(economiaDoPerfil(h).expCombate - 0.03) < 1e-9);
  check('pontos de habilidade só valem se o nó estiver aberto (zero antes)', economiaDoPerfil(createProfile()).pontosHabilidade === 0);
  h.arvore = { comprados: ['treinoAcelerado'], masteries: {}, reorganizacoes: 0 };
  check('Treino Acelerado dá +1 ponto de habilidade por nível', economiaDoPerfil(h).pontosHabilidade === 1);
}
{
  // a economia chega às regras de verdade (run: reparo, recrutas, loja; bastião: custo, reparo, muralha)
  const r = newRun('warrior', 555);
  r.profile.zeni = 1000;
  const reparoAntes = repairCost(r, 40);
  r.profile.arvore = { comprados: ['reparoAgil', 'maosHabeis'], masteries: {}, reorganizacoes: 0 };
  const reparoDepois = repairCost(r, 40);
  r.profile.arvore = { comprados: ['olhoDeMercador'], masteries: {}, reorganizacoes: 0 };
  check('Olho de Mercador: preço da cidade 3% mais barato (precoMult < priceMult)', Math.abs(precoMult(r) - priceMult(r) * 0.97) < 1e-9, `${precoMult(r).toFixed(4)} vs ${(priceMult(r) * 0.97).toFixed(4)}`);
  r.profile.arvore = { comprados: ['reparoAgil', 'maosHabeis'], masteries: {}, reorganizacoes: 0 };
  check('reparo da muralha fica mais barato com os nós de reparo (−10%)', reparoDepois < reparoAntes && Math.abs(reparoDepois / reparoAntes - 0.9) < 0.03, `${reparoAntes} -> ${reparoDepois}`);
  const niveis = { ...r.profile.heroes };
  r.party = ['warrior'];
  r.profile.heroes.warrior.level = 5;
  r.profile.heroes.mage.level = 1;
  r.profile.arvore = { comprados: ['recrutaPromissor'], masteries: {}, reorganizacoes: 0 };
  unlockHero(r, 'mage');
  check('recruta entra com +1 nível pelo nó Recruta Promissor', r.profile.heroes.mage.level === 6, `nível ${r.profile.heroes.mage.level}`);
  void niveis;
  r.party = ['warrior'];
  r.profile.heroes.mage.level = 1;
  r.profile.arvore = { comprados: [], masteries: {}, reorganizacoes: 0 };
  r.party = ['warrior'];
  unlockHero(r, 'mage');
  check('sem o nó, o recruta entra no nível do grupo', r.profile.heroes.mage.level === 5, `nível ${r.profile.heroes.mage.level}`);
  r.profile.arvore = { comprados: ['vitrineCheia'], masteries: {}, reorganizacoes: 0 };
  r.shop = undefined;
  check('Vitrine Cheia: a loja tem um item a mais', shopStock(r).length === GAME_CONFIG.city.shopStock + 1, `${shopStock(r).length} itens`);
}
{
  const b = newBastion(7, emptyCollection());
  // a torre (120 de Zen) mostra o desconto; a muralha (5 de Zen) arredonda de volta para 5 (limitação registrada)
  const base = buildCostOf(b, 'tower');
  b.profile.arvore = { comprados: ['pedreiroDeOficio'], masteries: {}, reorganizacoes: 0 };
  check('Pedreiro de Ofício: torre mais barata no Bastião', buildCostOf(b, 'tower') < base, `${base} -> ${buildCostOf(b, 'tower')}`);
  const hpAntes = structureMaxHp(b, { kind: 'wall', level: 1 });
  b.profile.arvore = { comprados: ['argamassaForte'], masteries: {}, reorganizacoes: 0 };
  check('Argamassa Forte: muralha com mais vida no Bastião', structureMaxHp(b, { kind: 'wall', level: 1 }) > hpAntes, `${hpAntes} -> ${structureMaxHp(b, { kind: 'wall', level: 1 })}`);
  check('a torre não recebe o bônus de muralha', structureMaxHp(b, { kind: 'tower', level: 1 }) === structureMaxHp(newBastion(7, emptyCollection()), { kind: 'tower', level: 1 }));
}

console.log(`\n${total - falhas}/${total} ok${falhas ? ` · ${falhas} FALHA(S)` : ''}`);
if (falhas) throw new Error(`arvoreCheck: ${falhas} falha(s)`);
