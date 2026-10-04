// Checagem headless da run: cada fase de combate com heróis "típicos" daquele ponto da jornada.
// Ato I: 1 herói (solo) · Ato II: 2 heróis · Ato III: 3 heróis (com a Arqueira).
import { applyZone } from '../src/config/gameConfig';
import { ACTS } from '../src/config/world';
import { ZONES } from '../src/config/zones';
import { Simulation } from '../src/core/sim/Simulation';
import { applyWaveResult, createProfile, heroStats } from '../src/core/progression/profile';
import { weaponPower } from '../src/core/progression/equipment';
import { battleFor, newRun } from '../src/core/run/run';
import type { HeroKind, SkillId } from '../src/core/progression/skills';
import { barriersAround, barriersShield } from '../src/config/gameConfig';

type Build = { level: number; attrs: Partial<Record<HeroKind, Record<string, number>>>; skills: Partial<Record<HeroKind, Partial<Record<SkillId, number>>>> };
const BUILDS: Build[] = [
  { level: 5, attrs: { warrior: { str: 6, vit: 6 }, mage: { int: 9, dex: 3 } }, skills: { warrior: { bash: 2, cleave: 3 }, mage: { frostBolt: 2, fireBarrier: 3 } } },
  { level: 10, attrs: { warrior: { str: 10, vit: 10, dex: 4 }, mage: { int: 16, dex: 6, vit: 3 } }, skills: { warrior: { bash: 4, cleave: 3, ironSkin: 3, taunt: 1, battleBreath: 1, shatter: 1 }, mage: { frostBolt: 4, fireBarrier: 3, frostNova: 2, meditation: 2, doubleBarrier: 1 } } },
  {
    level: 16,
    attrs: { warrior: { str: 18, vit: 14, dex: 10 }, mage: { int: 24, dex: 10, vit: 8 }, archer: { dex: 22, luk: 8, vit: 8 } },
    skills: {
      warrior: { bash: 5, cleave: 4, ironSkin: 4, taunt: 3, battleBreath: 3, shatter: 3, shockwave: 2 },
      mage: { frostBolt: 5, fireBarrier: 4, frostNova: 3, meditation: 3, doubleBarrier: 3, thunderstorm: 1 },
      archer: { preciseShot: 5, arrowRain: 4, eagleEye: 3, piercing: 2, volley: 2 },
    },
  },
];

const parties: HeroKind[][][] = [[['warrior'], ['mage']], [['warrior', 'mage'], ['mage', 'warrior']], [['warrior', 'mage', 'archer']]];
for (let a = 0; a < ACTS.length; a++) {
  for (const party of parties[a]) {
    const b = BUILDS[a];
    const p = createProfile();
    for (const k of party) {
      const h = p.heroes[k];
      h.level = b.level;
      for (const [at, v] of Object.entries(b.attrs[k] ?? {})) (h.attrs as Record<string, number>)[at] += v;
      Object.assign(h.skills, b.skills[k] ?? {});
      // arma típica do ponto da jornada: Comum no Ato I, Incomum no II, Rara no III
      const rar = (['common', 'uncommon', 'rare'] as const)[a];
      Object.assign(h.equipment.weapon!, { rarity: rar }, weaponPower(rar, h.equipment.weapon!.kind!));
    }
    const run = newRun(party[0], 12345);
    let cityHp = run.cityHp;
    let cityDamage = 0;
    run.party = party;
    run.act = a;
    ACTS[a].nodes.forEach((node, ni) => {
      run.node = ni;
      for (const t of node.options.filter((o) => o === 'horde' || o === 'elite' || o === 'boss')) {
        const { zone, wave } = battleFor(run, t);
        applyZone(zone, wave);
        const setup = structuredClone(ZONES[zone.id].defaultSetup);
        setup.members = setup.members.filter((m) => party.includes(m.archetype));
        if (party.length === 1 && party[0] === 'mage') {
          const m = setup.members[0];
          setup.barriers = barriersShield(m.x, m.y);
        }
        if (party.includes('archer')) {
          const m = setup.members.find((x) => x.archetype === 'mage')!;
          setup.members.push({ archetype: 'archer', x: m.x + 2, y: m.y });
        }
        void barriersAround;
        const lo = Object.fromEntries(party.map((k) => [k, { stats: heroStats(p, k), level: b.level, exp: 0 }]));
        const sim = new Simulation(setup, wave.seed, lo, { cityHp });
        sim.start();
        const count: Record<string, number> = {};
        while (sim.phase === 'running' && sim.tick < 6000) for (const e of sim.step()) count[e.type] = (count[e.type] ?? 0) + 1;
        const alive = [...sim.units.values()].filter((u) => u.team === 'party').map((u) => `${u.kind}:${Math.round(u.hp)}/${u.maxHp}`).join(' ');
        cityHp = sim.cityHp;
        cityDamage += sim.cityDamage;
        // economia acumulada da jornada (instrumentação: prova folga vs limite)
        applyWaveResult(p, sim.result());
        console.log(`A${a + 1}N${ni + 1} ${party.join('+').padEnd(20)} ${zone.id.padEnd(12)} ${t.padEnd(5)} ${sim.phase.padEnd(7)} t=${sim.tick} kills=${sim.killed} drops=${sim.drops.length} | ${alive} | spells:${(count.shadowBolt ?? 0) + (count.stomp ?? 0) + (count.meteor ?? 0)} | cidade −${sim.cityDamage} (${sim.reachedCity} invadiram) → ${sim.cityHp}`);
      }
    });
    const lv = party.map((k) => `${k}:${p.heroes[k].level}`).join(' ');
    console.log(`  == economia ${party.join('+')}: níveis ${lv} · zeni ${p.zeni} · almas ${p.souls} · itens ${p.inventory.length} · dano cidade acumulado ${cityDamage} · cidade ${cityHp}`);
  }
}
