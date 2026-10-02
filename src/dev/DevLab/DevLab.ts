/**
 * DEV LAB — ambiente interno de testes e balanceamento.
 *
 * Carregado por `import()` dinâmico em main.ts só no client desktop (executável) e com
 * DEV_MODE ligado (src/dev/devConfig.ts). Com DEV_MODE = false este módulo nem é carregado.
 *
 * Regra: o Dev Lab não tem lógica de jogo própria. Todo comando chama as funções do jogo
 * recebidas em `DevLabApi` (as mesmas usadas pela HUD, pela onda e pelo save).
 */
import { GAME_CONFIG, type PartySetup, type WaveOptions } from '../../config/gameConfig';
import { HERO_NAME, HERO_ORDER } from '../../config/heroes';
import { ACTS, NODE_LABEL, type NodeType } from '../../config/world';
import type { WaveMix, ZoneDef } from '../../config/zones';
import { isCombat } from '../../core/run/run';
import type { HeroLoadout, Simulation } from '../../core/sim/Simulation';
import { isRanged, type SimMods } from '../../core/sim/RangeSystem';
import { ACT_MONSTERS, MONSTER_MODELS } from '../../config/visualConfig';
import { DEV_VISUAL } from '../../render/units/createUnitView';
import { SHARED_EDITOR } from '../../editor/EditorStore';
import type { DevApi } from '../../debug/DebugPanel';
import { DEV_CONFIG } from '../devConfig';
import { DevPanel, type DevTab } from './DevPanel';
import { SpawnController } from './SpawnController';
import { buildCharacters } from './CharacterController';
import { buildSkills } from './SkillTester';
import { CombatDebugController } from './CombatDebugController';
import { buildEconomy } from './EconomyController';
import { buildLoot } from './LootTester';
import { buildWaves } from './WaveTester';
import { ScenarioManager } from './ScenarioManager';

export interface DevLabApi {
  /** Comandos já existentes do jogo (mesmas funções do painel de debug). */
  base: DevApi;
  /** Trapaças da simulação (sobrevivem ao reinício da onda). */
  cheats: { invincible: boolean; noCooldowns: boolean; oneHit: boolean };
  /** Modificadores de teste (temporários) — o mesmo objeto que a simulação lê. */
  mods: SimMods;
  sim(): Simulation;
  /** Manda para o render/log/som os eventos que um comando gerou fora do passo da onda. */
  flush(): void;
  mode(): string;
  party(): string[];
  dead(): string[];
  heroLevel(kind: string): { level: number; exp: number; next: number; skills: Record<string, number> };
  /** Adiciona/remove da equipe. Devolve uma mensagem se não deu. */
  setPartyMember(kind: string, on: boolean): string | undefined;
  maxGear(kind: string): string | undefined;
  currencies(): { zeni: number; souls: number };
  setCurrency(which: 'zeni' | 'souls', n: number): void;
  /** CAST: dispara a habilidade pelo mesmo código da IA. */
  castSkill(kind: string, id: string): boolean;
  /** Para o Wave Tester (simulação sem render, a mesma Simulation do jogo). */
  headless: {
    zoneFor(act: number, node: number, type: NodeType): { zone: ZoneDef; wave: WaveOptions };
    setupFor(zone: ZoneDef): PartySetup;
    loadout(): Record<string, HeroLoadout>;
    cityMaxHp(): number;
  };
  /** Joga a fase no jogo (muda a posição da run). */
  playPhase(act: number, node: number, type: NodeType): void;
  /** Cenários salvos pelo client (Electron). */
  scenarioStore?: { loadScenarios(): Promise<unknown[] | null>; saveScenarios(list: unknown[]): Promise<string> };
  setSpeed(s: number): void;
  getSpeed(): number;
  /** Composição da onda de uma fase da run (sem mexer na run atual). */
  waveFor(act: number, node: number, type: NodeType): { count: number; mix: WaveMix[]; boss?: string; zone: string };
}

/** Contexto compartilhado entre as abas. */
export interface DevCtx {
  api: DevLabApi;
  spawner: SpawnController;
  overlay: CombatDebugController;
  /** Herói selecionado (CHARACTERS e SKILLS). */
  hero: string;
  setHero(kind: string): void;
  log(text: string): void;
}

/** Nomes curtos dos tipos de inimigo no painel (o id aparece se faltar). */
const ENEMY_LABEL: Record<string, string> = {
  grunt: 'Comum',
  runner: 'Rápido',
  brute: 'Pesado',
  necro: 'Necromante',
  elite: 'Elite',
  boss: 'Chefe Ato I',
  boss2: 'Chefe Ato II',
  orcboss: 'Chefe final',
};
export const enemyLabel = (k: string) => (ENEMY_LABEL[k] ? `${ENEMY_LABEL[k]} (${k})` : k);
const label = enemyLabel;
export const heroLabel = (k: string) => (HERO_NAME as Record<string, string>)[k] ?? k;
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** Fases de combate da run (sem Sobrevivência, que não acaba). */
export interface PhaseRef {
  act: number;
  node: number;
  type: NodeType;
}
export function combatPhases(): PhaseRef[] {
  const out: PhaseRef[] = [];
  ACTS.forEach((a, ai) => a.nodes.forEach((n, ni) => n.options.filter((t) => isCombat(t) && t !== 'survival').forEach((type) => out.push({ act: ai, node: ni, type }))));
  return out;
}
export const phaseLabel = (p: PhaseRef) => `Ato ${ROMAN[p.act]} · fase ${p.node + 1} · ${NODE_LABEL[p.type]}`;

const TABS: DevTab[] = [
  { id: 'arena', label: 'ARENA', enabled: true },
  { id: 'characters', label: 'CHARACTERS', enabled: true },
  { id: 'skills', label: 'SKILLS', enabled: true },
  { id: 'movement', label: 'MOVEMENT', enabled: true },
  { id: 'economy', label: 'ECONOMY', enabled: true },
  { id: 'loot', label: 'LOOT', enabled: true },
  { id: 'waves', label: 'WAVES', enabled: true },
  { id: 'scenarios', label: 'SCENARIOS', enabled: true },
];

const ICON_LAB = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6L4.5 18.5A1.6 1.6 0 0 0 5.9 21h12.2a1.6 1.6 0 0 0 1.4-2.5L14 9V3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7.2 15h9.6l2 3.6H5.2z" fill="currentColor"/></svg>`;

export function installDevLab(root: HTMLElement, api: DevLabApi, addBarButton: (html: string, title: string, onClick: () => void) => void): void {
  const panel = new DevPanel(root, `Dev Lab · ${DEV_CONFIG.hotkey}`, TABS, () => toggle());
  const spawner = new SpawnController(api);
  const heroListeners: (() => void)[] = [];
  const ctx: DevCtx = {
    api,
    spawner,
    overlay: new CombatDebugController(root, api),
    hero: api.party()[0] ?? HERO_ORDER[0],
    setHero(kind) {
      ctx.hero = kind;
      for (const f of heroListeners) f();
    },
    log: (t) => api.base.log(`[dev lab] ${t}`),
  };
  const toggle = () => panel.toggle();
  addBarButton(ICON_LAB, `Dev Lab (${DEV_CONFIG.hotkey})`, toggle);

  // Fixar no jogo: ajustes de teste viram valores do jogo e tudo é gravado nos arquivos do projeto
  const fixBtn = document.createElement('button');
  fixBtn.className = 'dl-fix';
  fixBtn.textContent = '💾 Fixar no jogo';
  fixBtn.title = 'Grava para sempre nos arquivos do jogo (src/config/balance.ts): ajustes de combate/movimento do Dev Lab, ajustes de habilidades e tudo do Game Editor (F10). Vale no próximo ATUALIZAR_JOGO também.';
  panel.el.querySelector('.dl-title')!.insertBefore(fixBtn, panel.el.querySelector('[data-close]'));
  const fixMsg = document.createElement('div');
  fixMsg.className = 'dl-msg';
  fixMsg.hidden = true;
  panel.status.before(fixMsg);
  const showFix = (text: string, ok: boolean) => {
    ctx.log(text);
    fixMsg.textContent = text;
    fixMsg.classList.toggle('dl-bad', !ok);
    fixMsg.hidden = false;
  };
  fixMsg.addEventListener('click', () => (fixMsg.hidden = true));
  fixBtn.addEventListener('click', () => {
    fixBtn.disabled = true;
    void fixInGame(ctx)
      .then((msg) => showFix(msg, true), (err) => showFix(`Falha ao fixar: ${err}`, false))
      .finally(() => (fixBtn.disabled = false));
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === DEV_CONFIG.hotkey) {
      e.preventDefault();
      toggle();
    }
  });

  const tabs: Record<string, { refresh?(): void; onHero?(): void }> = {
    arena: buildArena(panel.body('arena'), api, spawner),
    characters: buildCharacters(panel.body('characters'), ctx),
    skills: buildSkills(panel.body('skills'), ctx),
    movement: ctx.overlay.buildTab(panel.body('movement')),
    economy: buildEconomy(panel.body('economy'), ctx),
    loot: buildLoot(panel.body('loot'), ctx),
    waves: buildWaves(panel.body('waves'), ctx),
    scenarios: new ScenarioManager(panel.body('scenarios'), ctx),
  };
  heroListeners.push(() => {
    for (const t of Object.values(tabs)) t.onHero?.();
  });

  const tick = () => {
    if (!panel.visible) return;
    const s = api.base.stats();
    const sp = api.getSpeed();
    panel.status.textContent = `${s.phase} · tick ${s.tick} · inimigos ${s.enemies} · fila ${spawner.pending} · ${sp === 0 ? 'PAUSADO' : `${sp}x`}`;
    panel.el.querySelectorAll<HTMLElement>('[data-speed]').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === sp));
    const pause = panel.el.querySelector<HTMLElement>('[data-cmd="pause"]');
    if (pause) pause.textContent = sp === 0 ? '▶ Continuar' : '⏸ Pausar';
    tabs[panel.current]?.refresh?.();
  };
  window.setInterval(tick, DEV_CONFIG.statusIntervalMs);
  api.base.log(`[dev lab] Dev Lab disponível (${DEV_CONFIG.hotkey}).`);
}

// ---------------------------------------------------------------- FIXAR NO JOGO

/** Onde mora o alcance base de cada herói à distância no GAME_CONFIG (o mesmo número do arquétipo). */
const RANGE_PATH: Record<string, string> = {
  archer: 'game/archetypes/archer/arrow/range',
  mage: 'game/archetypes/mage/frostBolt/range',
  sorcerer: 'game/archetypes/sorcerer/orb/range',
  warlock: 'game/archetypes/warlock/drain/range',
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Transforma os modificadores de teste (combate/movimento) em valores do GAME_CONFIG — pelo store do
 * Game Editor (desfazível) — zera os modificadores (o efeito no jogo continua o mesmo) e grava tudo
 * no balanceamento do projeto. Velocidade de ataque é só multiplicador de teste: fica de fora (avisado).
 */
async function fixInGame(ctx: DevCtx): Promise<string> {
  const store = SHARED_EDITOR.store;
  if (!store) return 'O Game Editor ainda não carregou; tente de novo em alguns segundos.';
  const { mods } = ctx.api;
  const C = GAME_CONFIG.combatAI;
  const vals: Record<string, unknown> = {};
  const skipped: string[] = [];
  if (mods.combatMovement !== undefined) vals['game/combatAI/enabled'] = mods.combatMovement;
  for (const k of Object.keys(C.heroes)) {
    const base = C.heroes[k];
    const m = mods.heroes[k] ?? {};
    const hp = `game/combatAI/heroes/${k}`;
    const ranged = isRanged(k);
    const mult = ranged ? mods.rangedRangeMult : 1;
    if (m.detectionRange !== undefined) vals[`${hp}/detectionRange`] = m.detectionRange;
    if (m.preferredRange !== undefined) vals[`${hp}/preferredRange`] = m.preferredRange;
    else if (mult !== 1) vals[`${hp}/preferredRange`] = round2(base.preferredRange * mult);
    const maxMove = m.maxCombatMoveDistance ?? mods.maxCombatMoveDistance;
    if (maxMove !== undefined) vals[`${hp}/maxCombatMoveDistance`] = maxMove;
    if (m.moveTicks !== undefined) vals[`${hp}/moveTicks`] = Math.max(1, Math.round(m.moveTicks));
    if (ranged) {
      const p = RANGE_PATH[k];
      const cur = p ? store.get(p) : undefined;
      if (m.attackRange !== undefined || mult !== 1) {
        if (typeof cur === 'number') vals[p] = round2((m.attackRange ?? cur) * mult);
        else skipped.push(`${heroLabel(k)}: alcance`);
      }
    } else if (m.attackRange !== undefined) vals[`${hp}/attackRange`] = m.attackRange;
    if (m.attackSpeed !== undefined && m.attackSpeed !== 1) skipped.push(`${heroLabel(k)}: velocidade de ataque (só teste)`);
  }
  const fixed = Object.keys(vals).length;
  if (fixed) store.setMany(vals);
  // os valores agora estão no jogo: os modificadores voltam ao neutro (sem aplicar em dobro)
  mods.combatMovement = undefined;
  mods.maxCombatMoveDistance = undefined;
  ctx.overlay.rangedOn = false;
  ctx.overlay.applyRanged();
  for (const [k, m] of Object.entries(mods.heroes)) {
    if (m.attackSpeed !== undefined && m.attackSpeed !== 1) mods.heroes[k] = { attackSpeed: m.attackSpeed };
    else delete mods.heroes[k];
  }
  const where = await store.save();
  const total = store.countChanged();
  const inProject = where.endsWith('balance.ts');
  return (
    `${fixed} ajuste(s) do Dev Lab viraram valores do jogo; ${total} valor(es) de balanceamento gravados em ${where}.` +
    (inProject ? ' Ficam no jogo para sempre (entram no próximo ATUALIZAR_JOGO).' : ' ATENÇÃO: não achei a pasta do projeto — ficou salvo só neste PC.') +
    (skipped.length ? ` Não fixado: ${skipped.join(', ')}.` : '')
  );
}

// ---------------------------------------------------------------- ARENA

/** Nome da criatura de cada ato no seletor de aparência (pelo modelo do inimigo comum). */
const LOOK_NAME: Record<string, string> = { rat: 'Ratos', goblin: 'Goblins', zombie: 'Zumbis' };

function buildArena(el: HTMLElement, api: DevLabApi, spawner: SpawnController): { refresh(): void } {
  const kinds = Object.keys(GAME_CONFIG.enemies);
  const bosses = GAME_CONFIG.bossKinds.filter((k) => k in GAME_CONFIG.enemies);
  const phases = combatPhases();
  const opt = (v: string, t: string) => `<option value="${v}">${t}</option>`;
  const looks = Object.entries(ACT_MONSTERS).map(([act, m]) => opt(act, `Ato ${ROMAN[Number(act)]} · ${LOOK_NAME[m.grunt] ?? m.grunt}`));
  const skinFiles = Object.values(MONSTER_MODELS).find((v) => v.skins?.length)?.skins ?? [];
  const skinName = (f: string) => {
    const n = f.replace(/^.*_|\.\w+$/g, '');
    return n.charAt(0).toUpperCase() + n.slice(1);
  };

  el.innerHTML = `
    <div class="dl-sec"><h4>Monstros</h4>
      <div class="dl-row"><select data-kind>${kinds.map((k) => opt(k, label(k))).join('')}</select>
        <input type="number" min="1" max="${DEV_CONFIG.maxSpawn}" value="1" data-qty>
        <select data-point>${opt('', 'Portal sorteado')}${opt('0', 'Portal 1')}${opt('1', 'Portal 2')}</select>
        <button class="dl-btn dl-primary" data-cmd="spawn">Spawnar</button></div>
      <div class="dl-row"><select data-look>${opt('', 'Aparência: a do mapa atual')}${looks.join('')}${opt('base', 'Modelo antigo')}</select>
        <select data-skin>${opt('', 'Cor sorteada')}${opt('0', 'Cor original')}${skinFiles.map((f, i) => opt(String(i + 1), skinName(f))).join('')}</select></div>
      <div class="dl-note">Aparência e cor valem para os próximos inimigos (spawn, wave e boss); vida e dano continuam os do tipo escolhido. Cores: só criaturas com variantes (zumbis).</div>
    </div>
    <div class="dl-sec"><h4>Wave</h4>
      <div class="dl-row"><select data-phase>${phases.map((p, i) => opt(String(i), phaseLabel(p))).join('')}</select>
        <button class="dl-btn" data-cmd="wave">Spawnar wave</button></div>
      <div class="dl-note">Spawna a composição da fase (tipos, quantidade e chefe) no mapa atual; a escala de vida/dano é a da arena.</div>
    </div>
    <div class="dl-sec"><h4>Boss</h4>
      <div class="dl-row"><select data-boss>${bosses.map((k) => opt(k, label(k))).join('')}</select><button class="dl-btn" data-cmd="boss">Spawnar boss</button></div>
    </div>
    <div class="dl-sec"><h4>Arena</h4>
      <div class="dl-row"><button class="dl-btn dl-primary" data-cmd="start">Iniciar onda</button><button class="dl-btn" data-cmd="pause">⏸ Pausar</button>
        <button class="dl-btn dl-danger" data-cmd="kill">Matar todos</button><button class="dl-btn dl-danger" data-cmd="reset">Limpar / resetar arena</button></div>
    </div>
    <div class="dl-sec"><h4>Velocidade</h4>
      <div class="dl-row">${DEV_CONFIG.speeds.map((s) => `<button class="dl-btn" data-speed="${s}">${s}x</button>`).join('')}</div>
    </div>
    <div class="dl-sec"><h4>Trapaças</h4>
      <div class="dl-row"><label><input type="checkbox" data-cheat="invincible"> God Mode</label>
        <label><input type="checkbox" data-cheat="oneHit"> Dano infinito</label>
        <label><input type="checkbox" data-cheat="noCooldowns"> Sem recarga</label>
        <label><input type="checkbox" data-cheat="noCooldowns"> Mana/energia infinita</label></div>
      <div class="dl-note">O jogo não usa mana: as recargas fazem esse papel, então "Mana infinita" = "Sem recarga".</div>
    </div>`;

  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  let lastSpeed = api.getSpeed() || 1;

  const syncCheats = () => {
    el.querySelectorAll<HTMLInputElement>('[data-cheat]').forEach((c) => (c.checked = api.cheats[c.dataset.cheat as keyof DevLabApi['cheats']]));
  };
  syncCheats();

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.dataset.speed !== undefined) {
      const s = Number(b.dataset.speed);
      lastSpeed = s;
      api.setSpeed(s);
      return;
    }
    switch (b.dataset.cmd) {
      case 'spawn': {
        const n = Math.max(1, Math.min(DEV_CONFIG.maxSpawn, Math.round(Number(q<HTMLInputElement>('[data-qty]').value) || 1)));
        const p = q<HTMLSelectElement>('[data-point]').value;
        spawner.spawn(q<HTMLSelectElement>('[data-kind]').value, n, p === '' ? undefined : Number(p));
        break;
      }
      case 'wave': {
        const ph = phases[Number(q<HTMLSelectElement>('[data-phase]').value)];
        const w = api.waveFor(ph.act, ph.node, ph.type);
        spawner.spawnWave(w.count, w.mix, w.boss);
        api.base.log(`[dev lab] Wave de ${w.zone}: ${w.count} inimigos${w.boss ? ` + ${label(w.boss)}` : ''} na fila.`);
        break;
      }
      case 'boss':
        spawner.spawn(q<HTMLSelectElement>('[data-boss]').value, 1);
        break;
      case 'start':
        api.base.startWave();
        break;
      case 'pause': {
        const sp = api.getSpeed();
        if (sp > 0) lastSpeed = sp;
        api.setSpeed(sp > 0 ? 0 : lastSpeed || 1);
        break;
      }
      case 'kill':
        spawner.clear();
        api.base.log(`[dev lab] ${api.base.killAllEnemies()} inimigo(s) mortos.`);
        break;
      case 'reset':
        spawner.clear();
        api.base.restartWave();
        break;
    }
  });

  el.addEventListener('change', (e) => {
    const c = e.target as HTMLInputElement;
    if (c.dataset.look !== undefined) DEV_VISUAL.act = c.value === '' ? undefined : c.value === 'base' ? null : Number(c.value);
    if (c.dataset.skin !== undefined) DEV_VISUAL.skin = c.value === '' ? undefined : Number(c.value);
    if (!c.dataset.cheat) return;
    api.cheats[c.dataset.cheat as keyof DevLabApi['cheats']] = c.checked;
    api.base.applyCheats();
    syncCheats(); // "Sem recarga" e "Mana infinita" andam juntos
  });  return { refresh: syncCheats };
}
