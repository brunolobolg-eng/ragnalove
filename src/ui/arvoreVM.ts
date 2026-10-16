import { ARVORE_CONFIG, ARVORE_ECONOMIA, CATEGORIAS, CATEGORIA_IDS, CONEXOES, FAMILIAS, MASTERIES, MASTERY_BY_ID, NOS, NO_BY_ID, REGIOES, TIPO_NO_LABEL, custoDoNo, nosPorCategoria, type BonusKey, type Categoria, type FamiliaId, type MasteryDef, type MasteryId, type NoDef, type NoTipo } from '../config/arvoreGlobal';
import { ARVORE_VISUAL, FAMILIA_VISUAL, ICONE_POR_BONUS, ICONE_POR_CATEGORIA, SETOR_DA_REGIAO, TAMANHO_NO } from '../config/arvoreVisual';
import { HERO_NAME, HERO_ORDER } from '../config/heroes';
import { RAIZ_ID, estadoNo, masteryDoHeroi, masteryDesbloqueada, previsaoAtribuir, previsaoReorganizar, textoBonus, type EstadoNo } from '../core/progression/arvore';
import { heroDisplayName, type Profile } from '../core/progression/profile';
import type { HeroKind } from '../core/progression/skills';

/**
 * View model da Árvore Global: traduz o estado do núcleo (core/progression/arvore.ts) em texto, números e
 * posições para a tela. Nenhuma regra é decidida aqui: estados, custos e motivos vêm das funções do núcleo.
 * A roda (posições, anéis, setores e rótulos) é geometria de apresentação, calculada uma vez por carga.
 */

export interface NoVM {
  id: string;
  categoria: Categoria;
  categoriaNome: string;
  /** Bônus de economia que ainda não têm gancho no jogo (texto do motivo). */
  pendencias: string[];
  nome: string;
  tipo: NoTipo;
  tipoNome: string;
  regiao: string;
  regiaoNome: string;
  /** Setor (família) do nó; ausente no núcleo e nos nós soltos (núcleo e caminhos de ligação). */
  familia?: FamiliaId;
  familiaNome?: string;
  /** Cor do setor (ou a neutra dos nós soltos). */
  cor: string;
  /** Posição na roda (px relativos ao centro) e raio da forma (px). */
  x: number;
  y: number;
  r: number;
  /** Anel (profundidade por BFS a partir do núcleo). */
  anel: number;
  /** Ícone do nó na roda (arte do kit; na Mastery, o emblema do setor). Ausente no núcleo e nos caminhos. */
  icone?: string;
  /** Notáveis e Masteries: pedem destaque visual (moldura e brilho). */
  destaque: boolean;
  custo: number;
  estado: EstadoNo;
  /** Texto do estado para o painel de detalhes (pt-BR). */
  estadoTexto: string;
  descricao: string;
  bonus: string[];
  /** Quem recebe o bônus ("Todos os heróis" ou os nomes). */
  para: string;
  /** Só pontos de Mastery: a Mastery que este ponto desbloqueia. */
  mastery?: string;
  raiz: boolean;
}

export interface CandidatoVM {
  kind: HeroKind;
  nome: string;
  retrato: string;
  nivel: number;
  /** Pode receber esta Mastery pela regra de elegibilidade (falso = nem aparece como opção). */
  elegivel: boolean;
  /** Motivo para não atribuir agora (ausente = pode). */
  erro?: string;
}

export interface MasteryVM {
  id: MasteryId;
  nome: string;
  familiaId: FamiliaId;
  familia: string;
  cor: string;
  identidade: string;
  efeito: string;
  nivelMin: number;
  noId: string;
  noNome: string;
  noAberto: boolean;
  portador?: HeroKind;
  portadorNome?: string;
  candidatos: CandidatoVM[];
  custo: number;
}

export interface HeroiVM {
  kind: HeroKind;
  nome: string;
  retrato: string;
  nivel: number;
  mastery?: string;
}

export interface EmblemaVM {
  id: FamiliaId;
  nome: string;
  cor: string;
  arte: string;
  x: number;
  y: number;
}

/** Roda: geometria fixa (anéis, medalhões e aro) para desenhar e para a checagem de sobreposição. */
export interface RodaVM {
  aroRaio: number;
  mioloRaio: number;
  nucleoArte: number;
  aneis: number[];
  emblemas: EmblemaVM[];
  /** Maior distância de um nó ao centro, borda externa da forma (px). */
  raioMax: number;
}

/** Caminho aceso até um nó: os nós que faltam abrir, na ordem de compra, a partir da rede aberta. */
export interface CaminhoVM {
  alvo: string;
  /** Nós fechados no caminho, do mais próximo da rede aberta até o alvo. */
  ids: string[];
  nos: number;
  zen: number;
  /** Só o alvo falta (um passo a partir da rede). */
  umPasso: boolean;
  /** O alvo já está aberto (não há caminho a acender). */
  aberto: boolean;
}

export interface ArvoreVM {
  categorias: { id: Categoria; nome: string; total: number }[];
  familias: { id: FamiliaId; nome: string; cor: string; total: number }[];
  totalNos: number;
  /** Saldo do banco de Zen (carteira da árvore: o que os nós e as Masteries custam). */
  banco: number;
  reorganizar: { custo: number; erro?: string };
  emCombate: boolean;
  nos: NoVM[];
  conexoes: [string, string][];
  /** Vizinhos de cada nó (para acender o caminho). */
  adjacencia: Record<string, string[]>;
  roda: RodaVM;
  herois: HeroiVM[];
  masteries: MasteryVM[];
}

const ESTADO_TEXTO = (estado: EstadoNo, custo: number, falta: number): string => {
  if (estado === 'aberto') return 'Aberto';
  if (estado === 'disponivel') return `Disponível: abre com o Zen do banco (${custo} Zen).`;
  if (estado === 'sem-zen') return `Faltam ${falta} Zen no banco.`;
  return 'Bloqueado: abra antes um nó ligado a este.';
};

const paraTexto = (no: NoDef): string => (no.para === 'todos' ? 'Todos os heróis' : no.para.map((k) => HERO_NAME[k]).join(', '));

/** Ícone de um nó na roda: a Mastery usa o emblema do setor; o resto, o primeiro bônus com ícone; senão, o da categoria. */
export function iconeDoNo(no: NoDef, familia?: FamiliaId): string | undefined {
  if (no.tipo === 'raiz' || no.tipo === 'caminho') return undefined;
  if (no.tipo === 'mastery') return familia ? FAMILIA_VISUAL[familia].emblema : undefined;
  const chave = (Object.keys(no.bonus) as BonusKey[]).find((k) => ICONE_POR_BONUS[k]);
  return chave ? ICONE_POR_BONUS[chave] : ICONE_POR_CATEGORIA[no.categoria];
}

const RAD = Math.PI / 180;
const POLAR = (raio: number, angulo: number) => ({ x: raio * Math.cos(angulo), y: raio * Math.sin(angulo) });

// ---------------- roda: geometria (calculada uma vez; o grafo é fixo) ----------------

/** Espaçamento angular (rad) entre os nós sem setor que saem do mesmo pai. */
const SOLTO_LEQUE = 0.22;

/** Ponto da roda durante o cálculo: centro do setor e meia-largura permitida (nó solto = sem limite). */
interface Ponto {
  id: string;
  x: number;
  y: number;
  r: number;
  anel: number;
  familia?: FamiliaId;
  fixo: boolean;
  centro: number;
  meio: number;
}

interface Roda {
  pos: Map<string, { x: number; y: number; r: number; anel: number; familia?: FamiliaId }>;
  aneis: number[];
  emblemas: EmblemaVM[];
  raioMax: number;
}

let rodaCache: Roda | undefined;

function calcularRoda(): Roda {
  if (rodaCache) return rodaCache;
  const adj = new Map<string, string[]>();
  for (const [a, b] of CONEXOES) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }
  // 1) profundidade e pai (BFS a partir do núcleo, na ordem da lista de conexões)
  const prof = new Map<string, number>([[RAIZ_ID, 0]]);
  const pai = new Map<string, string>();
  const ordem: string[] = [RAIZ_ID];
  for (let i = 0; i < ordem.length; i++) {
    const a = ordem[i];
    for (const b of adj.get(a) ?? []) {
      if (prof.has(b)) continue;
      prof.set(b, prof.get(a)! + 1);
      pai.set(b, a);
      ordem.push(b);
    }
  }
  // 2) setor: a Mastery leva o setor da sua família; a região leva o setor pelo mapa; o resto fica solto na roda
  const setor = new Map<string, FamiliaId | undefined>();
  for (const id of ordem) {
    const no = NO_BY_ID[id];
    if (no.tipo === 'raiz') setor.set(id, undefined);
    else if (no.mastery) setor.set(id, MASTERY_BY_ID[no.mastery]!.familia);
    else setor.set(id, SETOR_DA_REGIAO[no.regiao]);
  }
  // 3) anéis: raio do anel d = primeiro + passo × (d − 1)
  const { primeiro, passo, banda } = ARVORE_VISUAL.anel;
  const raioDoAnel = (d: number) => primeiro + passo * (d - 1);
  const maxProf = Math.max(...prof.values());
  const aneis = Array.from({ length: maxProf }, (_, i) => raioDoAnel(i + 1));
  const angulo = new Map<string, number>([[RAIZ_ID, 0]]);
  const pts: Ponto[] = [];
  const meioSetor = ARVORE_VISUAL.setorMeioGrau * RAD;
  const meioMax = ARVORE_VISUAL.setorMeioGrauMax * RAD;
  for (let d = 1; d <= maxProf; d++) {
    const doAnel = ordem.filter((id) => prof.get(id) === d);
    const grupos = new Map<FamiliaId | 'solto', string[]>();
    for (const id of doAnel) {
      const k = setor.get(id) ?? 'solto';
      grupos.set(k, [...(grupos.get(k) ?? []), id]);
    }
    for (const [k, ids] of grupos) {
      // dentro do grupo, a ordem segue o pai (vizinhos perto, menos cruzamentos)
      ids.sort((a, b) => (angulo.get(pai.get(a)!) ?? 0) - (angulo.get(pai.get(b)!) ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
      if (k === 'solto') {
        ids.forEach((id, i) => {
          const a0 = (angulo.get(pai.get(id)!) ?? 0) + (i - (ids.length - 1) / 2) * SOLTO_LEQUE;
          angulo.set(id, a0);
          const p = POLAR(raioDoAnel(d), a0);
          pts.push({ id, x: p.x, y: p.y, r: TAMANHO_NO[NO_BY_ID[id].tipo] / 2, anel: d, fixo: false, centro: a0, meio: Math.PI });
        });
        continue;
      }
      const centro = FAMILIA_VISUAL[k].grau * RAD;
      ids.forEach((id, i) => {
        const n = ids.length;
        const t = n === 1 ? 0 : -meioSetor + (2 * meioSetor * (i + 0.5)) / n;
        angulo.set(id, centro + t);
        const p = POLAR(raioDoAnel(d), centro + t);
        pts.push({ id, x: p.x, y: p.y, r: TAMANHO_NO[NO_BY_ID[id].tipo] / 2, anel: d, familia: k, fixo: false, centro, meio: meioMax });
      });
    }
  }
  // 4) núcleo no centro; a arte dele e os medalhões dos setores são obstáculos (os nós desviam)
  const arte = ARVORE_VISUAL.nucleoArte / 2;
  const nucleo: Ponto = { id: RAIZ_ID, x: 0, y: 0, r: TAMANHO_NO.raiz / 2, anel: 0, fixo: true, centro: 0, meio: 0 };
  const emblemas: EmblemaVM[] = (Object.keys(FAMILIA_VISUAL) as FamiliaId[]).map((f) => {
    const p = POLAR(ARVORE_VISUAL.emblema.raio, FAMILIA_VISUAL[f].grau * RAD);
    return { id: f, nome: FAMILIAS.find((x) => x.id === f)?.nome ?? f, cor: FAMILIA_VISUAL[f].cor, arte: FAMILIA_VISUAL[f].emblema, x: p.x, y: p.y };
  });
  const obstaculos = emblemas.map((e) => ({ x: e.x, y: e.y, r: ARVORE_VISUAL.emblema.diametro / 2 }));
  const todos: Ponto[] = [nucleo, ...pts];
  // 5) relaxamento em três fases: (a) com anel e setor; (b) com faixas um pouco mais largas; (c) só a separação
  //    entre nós, para nenhum par ficar encostado. O aro (teto) vale em todas as fases.
  const folga = ARVORE_VISUAL.folga;
  const fases: [number, boolean, number][] = [[2500, true, 1], [1500, true, 2.2], [800, false, 1]];
  for (const [iteracoes, comFaixas, fator] of fases) {
    for (let it = 0; it < iteracoes; it++) {
      for (let i = 0; i < todos.length; i++) {
        for (let j = i + 1; j < todos.length; j++) {
          const a = todos[i], b = todos[j];
          if (a.fixo && b.fixo) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1e-6;
          const min = a.r + b.r + folga;
          if (d >= min) continue;
          const f = (min - d) / (a.fixo || b.fixo ? 1 : 2);
          const ux = dx / d, uy = dy / d;
          if (!a.fixo) { a.x -= ux * f; a.y -= uy * f; }
          if (!b.fixo) { b.x += ux * f; b.y += uy * f; }
        }
      }
      for (const p of pts) {
        for (const o of obstaculos) {
          const dx = p.x - o.x, dy = p.y - o.y;
          const d = Math.hypot(dx, dy) || 1e-6;
          const min = p.r + o.r + ARVORE_VISUAL.emblema.folga;
          if (d < min) { p.x += (dx / d) * (min - d); p.y += (dy / d) * (min - d); }
        }
        // não invade a arte do núcleo
        const dn = Math.hypot(p.x, p.y) || 1e-6;
        const minN = p.r + arte + folga;
        if (dn < minN) { const k = minN / dn; p.x *= k; p.y *= k; }
        // dentro do aro (teto): o raio do nó mais a folga não passa da moldura
        const teto = ARVORE_VISUAL.aroRaio - ARVORE_VISUAL.folga * 2 - p.r;
        const rho0 = Math.hypot(p.x, p.y) || 1e-6;
        if (rho0 > teto) { p.x = (p.x / rho0) * teto; p.y = (p.y / rho0) * teto; }
        if (comFaixas) {
          // fica no anel (± banda)
          const alvo = raioDoAnel(p.anel);
          const rho = Math.hypot(p.x, p.y) || 1e-6;
          const lim = Math.max(alvo - banda * fator, Math.min(alvo + banda * fator, rho));
          p.x = (p.x / rho) * lim;
          p.y = (p.y / rho) * lim;
        }
        // fica no setor (± meio): vale em todas as fases
        let rel = Math.atan2(p.y, p.x) - p.centro;
        while (rel > Math.PI) rel -= 2 * Math.PI;
        while (rel < -Math.PI) rel += 2 * Math.PI;
        const meio = Math.min(Math.PI, p.meio + 0.25 * (fator - 1));
        const rel2 = Math.max(-meio, Math.min(meio, rel));
        if (rel2 !== rel) {
          const r2 = Math.hypot(p.x, p.y);
          const t2 = p.centro + rel2;
          p.x = r2 * Math.cos(t2);
          p.y = r2 * Math.sin(t2);
        }
      }
    }
  }
  const pos = new Map<string, { x: number; y: number; r: number; anel: number; familia?: FamiliaId }>();
  for (const p of todos) pos.set(p.id, { x: p.x, y: p.y, r: p.r, anel: p.anel, familia: p.fixo ? undefined : p.familia });
  const raioMax = Math.max(...pts.map((p) => Math.hypot(p.x, p.y) + p.r));
  rodaCache = { pos, aneis, emblemas, raioMax };
  return rodaCache;
}

/** Caminho aceso até um nó: a partir da rede aberta (ou do núcleo), o menor caminho de nós fechados até o alvo. */
export function caminhoAte(vm: ArvoreVM, alvo: string): CaminhoVM {
  const estado = new Map(vm.nos.map((n) => [n.id, n.estado]));
  if (estado.get(alvo) === 'aberto') return { alvo, ids: [], nos: 0, zen: 0, umPasso: false, aberto: true };
  const prev = new Map<string, string | null>();
  const fila: string[] = [];
  for (const n of vm.nos) if (n.estado === 'aberto') { prev.set(n.id, null); fila.push(n.id); }
  for (let i = 0; i < fila.length && !prev.has(alvo); i++) {
    for (const b of vm.adjacencia[fila[i]] ?? []) {
      if (prev.has(b)) continue;
      prev.set(b, fila[i]);
      fila.push(b);
    }
  }
  if (!prev.has(alvo)) return { alvo, ids: [], nos: 0, zen: 0, umPasso: false, aberto: false };
  const ids: string[] = [];
  let atual: string | null | undefined = alvo;
  while (atual && estado.get(atual) !== 'aberto') {
    ids.unshift(atual);
    atual = prev.get(atual);
  }
  const zen = ids.reduce((s, id) => s + (vm.nos.find((n) => n.id === id)?.custo ?? 0), 0);
  return { alvo, ids, nos: ids.length, zen, umPasso: ids.length === 1, aberto: false };
}

// ---------------- view model ----------------

/** Monta a tela com o estado atual do perfil. `retratos`: imagem de cada herói (vazio = inicial no lugar). */
export function montarArvoreVM(p: Profile, retratos: Record<string, string>, ctx: { emCombate?: boolean } = {}): ArvoreVM {
  // p.zeni aqui é o saldo do banco (quem chama passa o perfil com o saldo no lugar)
  const disponiveis = p.zeni;
  const roda = calcularRoda();
  const nos: NoVM[] = NOS.map((no) => {
    const estado = estadoNo(p, no.id);
    const falta = Math.max(0, custoDoNo(no) - disponiveis);
    const mastery = no.mastery ? MASTERIES.find((m) => m.id === no.mastery) : undefined;
    const pendencias = (Object.keys(no.bonus) as (keyof typeof ARVORE_ECONOMIA)[])
      .filter((k) => ARVORE_ECONOMIA[k] && !ARVORE_ECONOMIA[k].ligado)
      .map((k) => `${ARVORE_ECONOMIA[k].nome}: ${ARVORE_ECONOMIA[k].motivo ?? 'sem gancho ainda'}`);
    const g = roda.pos.get(no.id)!;
    const familia = g.familia;
    return {
      id: no.id,
      categoria: no.categoria,
      categoriaNome: CATEGORIAS[no.categoria].nome,
      pendencias,
      nome: no.nome,
      tipo: no.tipo,
      tipoNome: TIPO_NO_LABEL[no.tipo],
      regiao: no.regiao,
      regiaoNome: REGIOES[no.regiao]?.nome ?? no.regiao,
      familia,
      familiaNome: familia ? FAMILIAS.find((f) => f.id === familia)?.nome : undefined,
      cor: familia ? FAMILIA_VISUAL[familia].cor : ARVORE_VISUAL.cor.neutra,
      x: g.x,
      y: g.y,
      r: g.r,
      anel: g.anel,
      icone: iconeDoNo(no, familia),
      destaque: no.tipo === 'notavel' || no.tipo === 'mastery',
      custo: custoDoNo(no),
      estado,
      estadoTexto: no.id === RAIZ_ID ? 'Ponto de partida: sempre aberto.' : ESTADO_TEXTO(estado, custoDoNo(no), falta),
      descricao: no.descricao,
      bonus: textoBonus(no.bonus),
      para: paraTexto(no),
      mastery: mastery?.nome,
      raiz: no.tipo === 'raiz',
    };
  });
  const adjacencia: Record<string, string[]> = {};
  for (const [a, b] of CONEXOES) {
    (adjacencia[a] ??= []).push(b);
    (adjacencia[b] ??= []).push(a);
  }
  const nomeHeroi = (k: HeroKind) => heroDisplayName(p, k);
  const herois: HeroiVM[] = HERO_ORDER.map((k) => {
    const m = masteryDoHeroi(p, k);
    return { kind: k, nome: nomeHeroi(k), retrato: retratos[k] ?? '', nivel: p.heroes[k]?.level ?? 1, mastery: m?.nome };
  });
  const masteries: MasteryVM[] = MASTERIES.map((m: MasteryDef) => {
    const noM = NOS.find((n) => n.id === m.noRequerido);
    const portador: HeroKind | undefined = p.arvore?.masteries[m.id];
    const candidatos: CandidatoVM[] = HERO_ORDER.map((k) => {
      const prev = previsaoAtribuir(p, m.id, k, ctx);
      // destino só quando serve à Mastery E já chegou ao nível dela (o motivo do bloqueio aparece antes da escolha)
      return { kind: k, nome: nomeHeroi(k), retrato: retratos[k] ?? '', nivel: p.heroes[k]?.level ?? 1, elegivel: m.elegiveis.includes(k) && (p.heroes[k]?.level ?? 1) >= m.nivelMin, erro: prev.erro };
    });
    return {
      id: m.id,
      nome: m.nome,
      familiaId: m.familia,
      familia: FAMILIAS.find((f) => f.id === m.familia)?.nome ?? m.familia,
      cor: FAMILIA_VISUAL[m.familia].cor,
      identidade: m.identidade,
      efeito: m.efeito,
      nivelMin: m.nivelMin,
      noId: m.noRequerido,
      noNome: noM?.nome ?? m.noRequerido,
      noAberto: masteryDesbloqueada(p, m.id),
      portador,
      portadorNome: portador ? nomeHeroi(portador) : undefined,
      candidatos,
      custo: ARVORE_CONFIG.atribuirZen,
    };
  });
  const reorg = previsaoReorganizar(p, ctx);
  const porCat = nosPorCategoria();
  return {
    categorias: CATEGORIA_IDS.map((id) => ({ id, nome: CATEGORIAS[id].nome, total: porCat[id] })),
    familias: FAMILIAS.map((f) => ({ id: f.id, nome: f.nome, cor: FAMILIA_VISUAL[f.id].cor, total: nos.filter((n) => n.familia === f.id).length })),
    totalNos: NOS.length,
    banco: p.zeni,
    reorganizar: { custo: reorg.custo, erro: reorg.erro },
    emCombate: !!ctx.emCombate,
    nos,
    conexoes: CONEXOES,
    adjacencia,
    roda: {
      aroRaio: ARVORE_VISUAL.aroRaio,
      mioloRaio: ARVORE_VISUAL.mioloRaio,
      nucleoArte: ARVORE_VISUAL.nucleoArte,
      aneis: roda.aneis,
      emblemas: roda.emblemas,
      raioMax: roda.raioMax,
    },
    herois,
    masteries,
  };
}

/** Para a checagem: geometria pura da roda (nós e medalhões). Os nomes não ficam na roda. */
export function geometriaDaRoda(): { nos: { id: string; x: number; y: number; r: number }[]; emblemas: { id: string; x: number; y: number; r: number }[]; aroRaio: number } {
  const roda = calcularRoda();
  return {
    nos: [...roda.pos.entries()].map(([id, g]) => ({ id, x: g.x, y: g.y, r: g.r })),
    emblemas: roda.emblemas.map((e) => ({ id: e.id, x: e.x, y: e.y, r: ARVORE_VISUAL.emblema.diametro / 2 })),
    aroRaio: ARVORE_VISUAL.aroRaio,
  };
}
