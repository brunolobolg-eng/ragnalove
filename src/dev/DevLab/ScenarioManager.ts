/**
 * Aba SCENARIOS: cenários de teste salvos (criar, salvar, carregar, duplicar, deletar).
 * Ficam num arquivo gravado pelo client desktop (Electron): src/dev/devlab-scenarios.json
 * rodando da pasta do projeto, ou a pasta de dados do usuário no executável.
 * Carregar um cenário só chama comandos do jogo/Dev Lab (equipe, nível, Zen, trapaças,
 * modificadores, spawn) — nada aqui tem lógica de combate.
 */
import { GAME_CONFIG } from '../../config/gameConfig';
import { HERO_ORDER } from '../../config/heroes';
import type { HeroMods } from '../../core/sim/RangeSystem';
import { DEV_CONFIG } from '../devConfig';
import type { OverlayFlags } from './CombatDebugController';
import { enemyLabel, heroLabel, type DevCtx } from './DevLab';

export interface Scenario {
  id: string;
  name: string;
  /** Equipe e níveis. Vazio = mantém a equipe atual ("herói selecionado"). */
  heroes: { kind: string; level?: number }[];
  enemies: { kind: string; count: number }[];
  zeni?: number;
  cheats: { invincible: boolean; noCooldowns: boolean; oneHit: boolean };
  movement: { enabled?: boolean; rangedMult?: number; maxMove?: number };
  heroMods?: Record<string, HeroMods>;
  overlay?: Partial<OverlayFlags>;
  autoStart?: boolean;
}

const noCheats = { invincible: false, noCooldowns: false, oneHit: false };
const uid = () => `sc-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

/** Cenários de exemplo (entram quando ainda não há nenhum salvo). */
const PRESETS: Omit<Scenario, 'id'>[] = [
  { name: 'Boss Test', heroes: [{ kind: 'warrior', level: 50 }], enemies: [{ kind: 'boss', count: 1 }], zeni: 10000, cheats: { ...noCheats, noCooldowns: true }, movement: { enabled: true } },
  { name: 'Swarm Test', heroes: [{ kind: 'mage', level: 30 }], enemies: [{ kind: 'grunt', count: 100 }], cheats: { ...noCheats, noCooldowns: true }, movement: { rangedMult: 2 } },
  { name: 'Melee Range Test', heroes: [{ kind: 'warrior' }], enemies: [{ kind: 'grunt', count: 20 }], cheats: { ...noCheats }, movement: { enabled: true }, heroMods: { warrior: { attackRange: 1 } }, overlay: { attack: true } },
  { name: 'Ranged Range Test', heroes: [{ kind: 'archer' }], enemies: [{ kind: 'boss', count: 1 }], cheats: { ...noCheats }, movement: { rangedMult: 2 }, overlay: { preferred: true, attack: true } },
  { name: 'Skill Test', heroes: [], enemies: [{ kind: 'boss', count: 1 }], cheats: { ...noCheats, noCooldowns: true }, movement: {} },
];

const parsePairs = (txt: string) =>
  txt
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [k, v] = s.split(/[:=×*\s]+/).map((x) => x.trim());
      return { k, v: v === undefined || v === '' ? undefined : Number(v) };
    });

export class ScenarioManager {
  private list: Scenario[] = [];
  private sel = '';
  private readonly el: HTMLElement;

  /** Aba sem atualização periódica (o formulário só muda por ação do usuário). */
  refresh(): void {}

  constructor(el: HTMLElement, private readonly ctx: DevCtx) {
    this.el = el;
    const kinds = Object.keys(GAME_CONFIG.enemies);
    el.innerHTML = `
      <div class="dl-sec"><h4>Cenários</h4>
        <select size="6" class="dl-list" data-list></select>
        <div class="dl-row" style="margin-top:4px"><button class="dl-btn dl-primary" data-cmd="load">Carregar</button><button class="dl-btn" data-cmd="new">Criar</button>
          <button class="dl-btn" data-cmd="save">Salvar</button><button class="dl-btn" data-cmd="dup">Duplicar</button><button class="dl-btn dl-danger" data-cmd="del">Deletar</button>
          <button class="dl-btn" data-cmd="capture" title="Preenche com a equipe, níveis, trapaças e modificadores atuais">Usar estado atual</button></div>
        <div class="dl-note" data-where></div>
      </div>
      <div class="dl-sec"><h4>Editar</h4>
        <div class="dl-grid2">
          <span>Nome</span><input type="text" data-f="name">
          <span>Heróis</span><input type="text" data-f="heroes" placeholder="warrior:50, mage:30 (vazio = equipe atual)">
          <span>Inimigos</span><input type="text" data-f="enemies" placeholder="grunt:100, boss:1">
          <span>Zen</span><input type="number" min="0" data-f="zeni" placeholder="(não muda)">
          <span>Trapaças</span><span><label><input type="checkbox" data-c="invincible"> God</label> <label><input type="checkbox" data-c="oneHit"> Dano infinito</label> <label><input type="checkbox" data-c="noCooldowns"> Sem recarga/mana</label></span>
          <span>Movimento</span><select data-f="move"><option value="">padrão do jogo</option><option value="on">Combat Movement ON</option><option value="off">OFF</option></select>
          <span>Range mult.</span><select data-f="ranged"><option value="">desligado</option>${DEV_CONFIG.rangedMultOptions.map((v) => `<option value="${v}">${v}x</option>`).join('')}</select>
          <span>Max move</span><input type="number" min="0" step="0.5" data-f="maxMove" placeholder="(de cada herói)">
          <span>Ajustes</span><input type="text" data-f="mods" placeholder="warrior.attackRange:1, archer.attackSpeed:2">
          <span>Mostrar</span><span><label><input type="checkbox" data-v="attack"> Attack</label> <label><input type="checkbox" data-v="detection"> Detection</label> <label><input type="checkbox" data-v="preferred"> Preferred</label> <label><input type="checkbox" data-v="position"> Position</label> <label><input type="checkbox" data-v="debug"> Debug AI</label></span>
          <span>Início</span><label><input type="checkbox" data-f="auto"> Iniciar a onda ao carregar</label>
        </div>
        <div class="dl-note">Tipos de inimigo: ${kinds.map(enemyLabel).join(', ')}. Heróis: ${HERO_ORDER.join(', ')}.</div>
      </div>`;
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-cmd]');
      if (b) void this.cmd(b.dataset.cmd!);
    });
    this.q<HTMLSelectElement>('[data-list]').addEventListener('change', (e) => {
      this.sel = (e.target as HTMLSelectElement).value;
      this.fill(this.current());
    });
    void this.loadStore();
  }

  private q<T extends HTMLElement>(s: string): T {
    return this.el.querySelector<T>(s)!;
  }

  private current(): Scenario | undefined {
    return this.list.find((s) => s.id === this.sel);
  }

  private async loadStore(): Promise<void> {
    const store = this.ctx.api.scenarioStore;
    const saved = store ? await store.loadScenarios().catch(() => null) : null;
    this.list = Array.isArray(saved) && saved.length ? (saved as Scenario[]) : PRESETS.map((p) => ({ ...structuredClone(p), id: uid() }));
    this.sel = this.list[0]?.id ?? '';
    this.q('[data-where]').textContent = store ? 'Salvos em arquivo pelo client (src/dev/devlab-scenarios.json no projeto; pasta de dados no executável).' : 'Client desktop indisponível: cenários só nesta sessão.';
    this.renderList();
    this.fill(this.current());
  }

  private async persist(): Promise<void> {
    const store = this.ctx.api.scenarioStore;
    if (!store) return;
    const where = await store.saveScenarios(this.list);
    this.ctx.log(`Cenários salvos em ${where}.`);
  }

  private renderList(): void {
    this.q<HTMLSelectElement>('[data-list]').innerHTML = this.list.map((s) => `<option value="${s.id}" ${s.id === this.sel ? 'selected' : ''}>${s.name}</option>`).join('');
  }

  /** Mostra o cenário no formulário. */
  private fill(s?: Scenario): void {
    const f = (k: string) => this.q<HTMLInputElement>(`[data-f="${k}"]`);
    f('name').value = s?.name ?? '';
    f('heroes').value = (s?.heroes ?? []).map((h) => (h.level ? `${h.kind}:${h.level}` : h.kind)).join(', ');
    f('enemies').value = (s?.enemies ?? []).map((e) => `${e.kind}:${e.count}`).join(', ');
    f('zeni').value = s?.zeni !== undefined ? String(s.zeni) : '';
    this.el.querySelectorAll<HTMLInputElement>('[data-c]').forEach((c) => (c.checked = !!s?.cheats[c.dataset.c as keyof Scenario['cheats']]));
    (f('move') as unknown as HTMLSelectElement).value = s?.movement.enabled === undefined ? '' : s.movement.enabled ? 'on' : 'off';
    (f('ranged') as unknown as HTMLSelectElement).value = s?.movement.rangedMult !== undefined ? String(s.movement.rangedMult) : '';
    f('maxMove').value = s?.movement.maxMove !== undefined ? String(s.movement.maxMove) : '';
    f('mods').value = Object.entries(s?.heroMods ?? {})
      .flatMap(([k, m]) => Object.entries(m).map(([p, v]) => `${k}.${p}:${v}`))
      .join(', ');
    this.el.querySelectorAll<HTMLInputElement>('[data-v]').forEach((c) => (c.checked = !!s?.overlay?.[c.dataset.v as keyof OverlayFlags]));
    f('auto').checked = !!s?.autoStart;
  }

  /** Lê o formulário para um cenário. */
  private read(id: string): Scenario {
    const f = (k: string) => this.q<HTMLInputElement>(`[data-f="${k}"]`).value.trim();
    const num = (v: string) => (v === '' ? undefined : Number(v));
    const heroMods: Record<string, HeroMods> = {};
    for (const { k, v } of parsePairs(f('mods'))) {
      const [hero, param] = k.split('.');
      if (hero && param && v !== undefined && Number.isFinite(v)) (heroMods[hero] ??= {})[param as keyof HeroMods] = v;
    }
    const overlay: Partial<OverlayFlags> = {};
    this.el.querySelectorAll<HTMLInputElement>('[data-v]').forEach((c) => (overlay[c.dataset.v as keyof OverlayFlags] = c.checked));
    const cheats = { ...noCheats };
    this.el.querySelectorAll<HTMLInputElement>('[data-c]').forEach((c) => (cheats[c.dataset.c as keyof typeof cheats] = c.checked));
    const move = f('move');
    return {
      id,
      name: f('name') || 'Sem nome',
      heroes: parsePairs(f('heroes'))
        .filter((p) => HERO_ORDER.includes(p.k as never))
        .map((p) => ({ kind: p.k, level: p.v })),
      enemies: parsePairs(f('enemies'))
        .filter((p) => p.k in GAME_CONFIG.enemies)
        .map((p) => ({ kind: p.k, count: Math.max(1, Math.round(p.v ?? 1)) })),
      zeni: num(f('zeni')),
      cheats,
      movement: { enabled: move === '' ? undefined : move === 'on', rangedMult: num(f('ranged')), maxMove: num(f('maxMove')) },
      heroMods,
      overlay,
      autoStart: this.q<HTMLInputElement>('[data-f="auto"]').checked,
    };
  }

  /** Preenche o formulário com o estado atual do jogo e do Dev Lab. */
  private capture(): void {
    const { api, overlay } = this.ctx;
    const s: Scenario = {
      id: this.sel,
      name: this.q<HTMLInputElement>('[data-f="name"]').value || 'Estado atual',
      heroes: api.party().map((k) => ({ kind: k, level: api.heroLevel(k).level })),
      enemies: this.read(this.sel).enemies,
      zeni: api.currencies().zeni,
      cheats: { ...api.cheats },
      movement: { enabled: api.mods.combatMovement, rangedMult: overlay.rangedOn ? overlay.rangedMult : undefined, maxMove: api.mods.maxCombatMoveDistance },
      heroMods: structuredClone(api.mods.heroes),
      overlay: { ...overlay.flags },
    };
    this.fill(s);
  }

  private async cmd(c: string): Promise<void> {
    const cur = this.current();
    switch (c) {
      case 'new': {
        const s = this.read(uid());
        s.name = s.name === 'Sem nome' || this.list.some((x) => x.name === s.name) ? `Cenário ${this.list.length + 1}` : s.name;
        this.list.push(s);
        this.sel = s.id;
        break;
      }
      case 'save':
        if (!cur) return this.cmd('new');
        Object.assign(cur, this.read(cur.id));
        break;
      case 'dup':
        if (!cur) return;
        this.list.push({ ...structuredClone(cur), id: uid(), name: `${cur.name} (cópia)` });
        this.sel = this.list[this.list.length - 1].id;
        break;
      case 'del':
        if (!cur) return;
        this.list = this.list.filter((s) => s !== cur);
        this.sel = this.list[0]?.id ?? '';
        break;
      case 'capture':
        return this.capture();
      case 'load':
        if (cur) this.apply(this.read(cur.id));
        return;
    }
    this.renderList();
    this.fill(this.current());
    await this.persist();
  }

  /** Aplica um cenário pela mesma API que os botões do Dev Lab usam. */
  private apply(s: Scenario): void {
    const { api, overlay, spawner } = this.ctx;
    if (api.mode() !== 'battle') this.ctx.log('Entre numa fase (batalha) para usar o cenário na arena.');
    spawner.clear();
    if (api.sim().phase !== 'setup') api.base.restartWave();
    // equipe e níveis
    if (s.heroes.length) {
      const want = s.heroes.map((h) => h.kind);
      for (const k of want) api.setPartyMember(k, true);
      for (const k of api.party()) if (!want.includes(k)) api.setPartyMember(k, false);
      for (const h of s.heroes) if (h.level) api.base.setLevel(h.kind, Math.max(1, Math.min(DEV_CONFIG.maxLevel, h.level)));
      this.ctx.setHero(want[0]);
    }
    if (s.zeni !== undefined) api.setCurrency('zeni', s.zeni);
    Object.assign(api.cheats, s.cheats);
    api.base.applyCheats();
    api.mods.combatMovement = s.movement.enabled;
    overlay.rangedOn = s.movement.rangedMult !== undefined;
    if (s.movement.rangedMult !== undefined) overlay.rangedMult = s.movement.rangedMult;
    overlay.applyRanged();
    api.mods.maxCombatMoveDistance = s.movement.maxMove;
    for (const k of Object.keys(api.mods.heroes)) delete api.mods.heroes[k];
    Object.assign(api.mods.heroes, structuredClone(s.heroMods ?? {}));
    overlay.setFlags({ attack: false, detection: false, preferred: false, position: false, debug: false, ...s.overlay });
    // a arena volta ao planejamento com tudo aplicado e os inimigos entram pelos portais
    api.base.restartWave();
    for (const e of s.enemies) spawner.spawn(e.kind, e.count);
    if (s.autoStart) api.base.startWave();
    this.ctx.log(`Cenário "${s.name}" carregado${s.heroes.length ? ` (${s.heroes.map((h) => heroLabel(h.kind)).join(', ')})` : ''}.`);
  }
}
