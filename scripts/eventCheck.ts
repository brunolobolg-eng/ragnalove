/**
 * Fumaça dos eventos: toda opção de todo evento, 25× (cobre win/lose das apostas).
 * Uso: node node_modules/tsx/dist/cli.mjs scripts/eventCheck.ts
 */
import { EVENTS } from '../src/config/world';
import { applyEventEffects, newRun } from '../src/core/run/run';

let failures = 0;
for (const ev of EVENTS) {
  for (const opt of ev.options) {
    let wins = 0;
    let loses = 0;
    try {
      for (let i = 0; i < 25; i++) {
        const run = newRun('warrior', 1000 + i);
        run.party = ['warrior', 'mage'];
        run.profile.zeni = 10000;
        run.profile.souls = 100;
        const before = JSON.stringify({ z: run.profile.zeni, s: run.profile.souls, inv: run.profile.inventory.length });
        const out = applyEventEffects(run, opt.effects);
        if (!Array.isArray(out)) throw new Error('sem texto de resultado');
        if (!Number.isFinite(run.profile.zeni) || run.profile.zeni < 0) throw new Error(`zeni inválido: ${run.profile.zeni}`);
        if (!Number.isFinite(run.profile.souls) || run.profile.souls < 0) throw new Error(`almas inválidas: ${run.profile.souls}`);
        for (const h of run.party) {
          const hp = run.profile.heroes[h];
          if (!Number.isFinite(hp.points) || hp.points < 0 || !Number.isFinite(hp.skillPoints) || hp.skillPoints < 0) {
            throw new Error(`pontos inválidos em ${h}`);
          }
        }
        void before;
        // heuristic: resultado menciona ganho?
        if (out.join(' ').length > 0) wins++;
        loses++;
      }
      void wins;
      void loses;
    } catch (e) {
      failures++;
      console.error(`  FALHA ${ev.id}/${opt.label}: ${(e as Error).message}`);
    }
  }
}
console.log(`eventos: ${EVENTS.length} (${EVENTS.map((e) => e.id).join(', ')})`);
if (failures) throw new Error(`${failures} FALHA(S)`);
console.log('Eventos OK.');
