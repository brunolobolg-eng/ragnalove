import type * as THREE from 'three';
import { MAGIA_HIT_INTERVAL, MAGIA_RECIPES, TICKS_POR_SEGUNDO, type MagiaRecipe } from '../../../config/fx/efeitosMagia';
import type { SimEvent } from '../../../core/sim/types';
import { tileToWorld } from '../../coords';
import type { OneShotFx } from '../kit/FxKit';
import type { PackFx } from './PackFx';

/** Altura do golpe (meio do corpo) em metros. */
const ALTURA_GOLPE = 1.1;

/** O que o despachante precisa da GameView: o sistema do pacote, a cena e a lista de efeitos. */
export interface MagicCtx {
  pack: PackFx;
  world: THREE.Group;
  /** Raiz de uma unidade viva (undefined se ela já saiu da cena). */
  unitRoot(id: number): THREE.Object3D | undefined;
  /** Classe ou tipo da unidade (ex.: 'warlock', 'necro'), para receitas específicas de quem causou o efeito. */
  kindOf(id: number): string | undefined;
  /** Registra o efeito "de uma vez" na GameView, que atualiza e remove. `undefined` = orçamento cheio, ignora. */
  add(fx: OneShotFx | undefined): void;
}

/** Opções de um disparo: duração que vem do evento (em segundos) e quem causou (para a receita específica). */
interface Disparo {
  tempo?: number;
  quem?: number;
}

/**
 * Camada dos efeitos novos sobre as magias: lê os eventos da simulação e dispara círculos, golpes, auras e
 * emissores do pacote, segundo a receita de cada magia (config/fx/efeitosMagia.ts). Roda antes do despachante
 * de cada classe, sem substituí-lo. Só apresentação: a simulação não sabe que ela existe.
 */
export class MagicVfx {
  private clock = 0;
  private readonly lastAt = new Map<string, number>();

  constructor(readonly ctx: MagicCtx) {}

  update(dt: number): void {
    this.clock += dt;
  }

  /** Chamado para cada evento da simulação. Eventos sem receita são ignorados. */
  onEvent(e: SimEvent): void {
    switch (e.type) {
      case 'cast':
        this.unidade(`cast:${e.ability}`, e.unitId, {});
        break;
      case 'damage':
        if (e.source) this.golpeEm(`dmg:${e.source}`, e.unitId, e.sourceId);
        break;
      case 'bash':
        this.area('bash', e.x, e.y, 0, { quem: e.unitId });
        break;
      case 'cleave':
        for (const t of e.hitTiles.slice(0, 4)) this.area('cleave', t.x, t.y, 0, { quem: e.unitId });
        break;
      case 'execute':
        this.area('execute', e.x, e.y, 0, { quem: e.unitId });
        break;
      case 'sonicWave':
        this.area('sonicWave', e.x, e.y, 0, { quem: e.unitId });
        break;
      case 'nova':
        this.area('nova', e.x, e.y, e.radius, { quem: e.unitId });
        break;
      case 'stomp':
        this.area('stomp', e.x, e.y, e.radius, { quem: e.unitId });
        break;
      case 'shockwave':
        this.area('shockwave', e.x, e.y, e.radius, { quem: e.unitId });
        break;
      case 'telegraph':
        this.area('telegraph', e.x, e.y, e.radius, { tempo: e.ticks / TICKS_POR_SEGUNDO, quem: e.unitId });
        break;
      case 'meteor':
        this.area(e.unitId !== undefined ? 'meteor:sorcerer' : 'meteor', e.x, e.y, e.radius, { quem: e.unitId });
        break;
      case 'storm':
        for (const s of e.strikes) this.area(`storm:${e.ability ?? 'thunderstorm'}`, s.x, s.y, 0, { quem: e.unitId });
        break;
      case 'rain':
        this.area(e.fire ? 'rain:fire' : 'rain:arrow', e.x, e.y, e.radius, { quem: e.unitId });
        break;
      case 'combust':
        this.area('combust', e.x, e.y, 0, {});
        break;
      case 'curse':
        this.area('curse', e.x, e.y, e.radius, { quem: e.unitId });
        break;
      case 'frostMist':
        this.area('frostMist', e.x, e.y, e.radius, { tempo: e.ticks / TICKS_POR_SEGUNDO, quem: e.unitId });
        break;
      case 'blackFrost':
        this.area('blackFrost', e.x, e.y, e.radius, { quem: e.unitId });
        break;
      case 'sanctuary':
        this.area('sanctuary', e.x, e.y, e.radius, { tempo: e.ticks / TICKS_POR_SEGUNDO, quem: e.unitId });
        break;
      case 'soulEcho':
        this.area('soulEcho', e.x, e.y, e.radius, { quem: e.unitId });
        break;
      case 'windCutter':
        this.area('windCutter', e.x, e.y, e.radius, { quem: e.unitId });
        break;
      case 'hundredSpear':
        this.area('hundredSpear', e.x, e.y, e.radius, { quem: e.unitId });
        break;
      case 'deathBound':
        this.area('deathBound', e.x, e.y, 0, { tempo: e.ticks / TICKS_POR_SEGUNDO, quem: e.unitId });
        break;
      case 'taunt':
        this.areaDaUnidade('taunt', e.unitId, e.radius);
        break;
      case 'trapSet':
        this.area(`trapset:${e.trap.kind ?? 'snare'}`, e.trap.x, e.trap.y, 0, {});
        break;
      case 'trapTrigger':
        this.area(`trap:${e.kind ?? 'padrao'}`, e.x, e.y, e.radius ?? 0, { quem: e.targetId });
        break;
      case 'holyShield':
        this.unidade('holyShield', e.targetId, { tempo: e.ticks / TICKS_POR_SEGUNDO });
        break;
      case 'blessing':
        for (const id of e.targets) this.unidade('blessing', id, { tempo: e.ticks / TICKS_POR_SEGUNDO });
        break;
      case 'divineHeal':
        this.unidade('divineHeal', e.targetId, {});
        break;
      case 'heal':
        this.unidade('heal', e.unitId, {});
        break;
      case 'fury':
        this.unidade('fury', e.unitId, { tempo: e.ticks / TICKS_POR_SEGUNDO });
        break;
      case 'focus':
        this.unidade('focus', e.unitId, { tempo: e.ticks / TICKS_POR_SEGUNDO });
        break;
      case 'enchantBlade':
        this.unidade('enchantBlade', e.unitId, { tempo: e.ticks / TICKS_POR_SEGUNDO });
        break;
      case 'aggro':
        this.unidade('aggro', e.targetId, { tempo: e.ticks / TICKS_POR_SEGUNDO });
        break;
      case 'freeze':
        this.unidade('freeze', e.unitId, { tempo: e.ticks / TICKS_POR_SEGUNDO });
        break;
      case 'chill':
        this.unidade('chill', e.unitId, { tempo: e.ticks / TICKS_POR_SEGUNDO });
        break;
      case 'etherealCage':
        this.unidade('etherealCage', e.targetId, { tempo: e.ticks / TICKS_POR_SEGUNDO });
        break;
      case 'abyssMarsh':
        this.unidade('abyssMarsh', e.targetId, { tempo: e.ticks / TICKS_POR_SEGUNDO });
        break;
      case 'darkApex':
        this.unidade('darkApex', e.unitId, { tempo: e.ticks / TICKS_POR_SEGUNDO });
        break;
      case 'avoid':
        if (e.how === 'block') this.unidade('avoid:block', e.unitId, {});
        else if (e.how === 'shield') this.unidade('avoid:shield', e.unitId, {});
        break;
      default:
        break;
    }
  }

  /** Receita: primeiro `chave:classe` de quem causou (se houver), depois só `chave`. */
  private receita(chave: string, quem?: number): MagiaRecipe | undefined {
    const classe = quem !== undefined ? this.ctx.kindOf(quem) : undefined;
    return (classe && MAGIA_RECIPES[`${chave}:${classe}`]) || MAGIA_RECIPES[chave];
  }

  /** Efeito numa área do chão (raio em tiles; 0 = a receita decide o tamanho). */
  private area(chave: string, x: number, y: number, raio: number, d: Disparo): void {
    const r = this.receita(chave, d.quem);
    if (!r) return;
    const chao = tileToWorld(x, y);
    this.dispara(r, chao, chao.clone().setY(ALTURA_GOLPE), raio, d.tempo);
  }

  /** Efeito numa área centrada na unidade (ex.: provocar). */
  private areaDaUnidade(chave: string, unitId: number, raio: number): void {
    const r = this.receita(chave, unitId);
    const alvo = r ? this.ctx.unitRoot(unitId) : undefined;
    if (!r || !alvo) return;
    this.dispara(r, alvo.position.clone().setY(0), alvo.position.clone().setY(ALTURA_GOLPE), raio, undefined, alvo);
  }

  /** Efeito numa unidade (lançamento, cura, escudo, estado). Com `tempo`, a aura e o emissor duram o que o evento diz. */
  private unidade(chave: string, unitId: number, d: Disparo): void {
    const r = this.receita(chave, unitId);
    const alvo = r ? this.ctx.unitRoot(unitId) : undefined;
    if (!r || !alvo) return;
    if (!chave.startsWith('cast:') && !this.permite(chave, unitId)) return;
    this.dispara(r, alvo.position.clone().setY(0), alvo.position.clone().setY(ALTURA_GOLPE), 0, d.tempo, alvo);
  }

  /** Golpe em fatia no alvo (de quem causou o dano, se a receita pedir), com limite de frequência por alvo. */
  private golpeEm(chave: string, unitId: number, quem?: number): void {
    const r = this.receita(chave, quem);
    if (!r || !this.permite(chave, unitId)) return;
    const alvo = this.ctx.unitRoot(unitId);
    if (!alvo) return;
    this.dispara(r, alvo.position.clone().setY(0), alvo.position.clone().setY(ALTURA_GOLPE), 0);
  }

  /** Dispara o que a receita pede: círculo no chão, golpe no corpo, aura e emissor na unidade. */
  private dispara(r: MagiaRecipe, chao: THREE.Vector3, corpo: THREE.Vector3, raio: number, tempo?: number, alvo?: THREE.Object3D): void {
    const { pack, world } = this.ctx;
    if (r.circulo) {
      const raioFinal = r.circulo.raio || raio;
      this.ctx.add(pack.circle(world, chao, r.element, raioFinal, r.circulo.segurar ?? tempo));
    }
    if (r.golpe) {
      const anel = r.golpe.anelRaio && raio > 0 ? raio * 2 : (r.golpe.anel ?? 0);
      this.ctx.add(pack.slash(world, corpo, r.element, anel));
    }
    if (r.brilho) this.ctx.add(pack.brilho(world, corpo, r.element, r.brilho.textura, tempo ?? r.brilho.vida, r.brilho.tamanho));
    if (alvo && r.aura) this.ctx.add(pack.aura(world, alvo, r.element, tempo ?? r.aura.vida));
    if (alvo && r.emissor) {
      this.ctx.add(pack.stream(alvo, r.element, tempo ?? r.emissor.vida, r.emissor.tipo === 'cruz' ? 'cross' : 'crystal'));
    }
  }

  /** Libera o próximo efeito deste tipo e alvo só depois de `MAGIA_HIT_INTERVAL` segundos (evita enxame). */
  private permite(chave: string, unitId: number): boolean {
    const k = `${chave}:${unitId}`;
    const ultimo = this.lastAt.get(k) ?? -Infinity;
    if (this.clock - ultimo < MAGIA_HIT_INTERVAL) return false;
    this.lastAt.set(k, this.clock);
    return true;
  }
}
