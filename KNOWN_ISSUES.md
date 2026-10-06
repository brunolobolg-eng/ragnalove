# KNOWN_ISSUES

Só problemas confirmados e ainda existentes. Nada já corrigido, nada inventado.

### Thin margins on solarRuins / frostPass
Description: mage ends these waves at ~8 HP with minimum typical builds (weapon-only, no micro/potions).
Impact: casual players may wipe on these two nodes.
Possible area: `src/config/zones.ts` (counts/mix/intervals of redDunes-adjacent curve), `src/config/world.ts` (Act II/III mults).
Status: accepted for now — real players carry full gear, potions and barriers (probes are conservative).

### Final level 15–16 vs 13–14 target
Description: continuous progression overshoots the original 13–14 target by ~2 levels.
Impact: low — progression stays relevant until the end (the actual goal).
Possible area: `progression.expPerKill`, `expCurve.growth`.
Status: accepted — further cuts risked flipping victories to defeats.

### Survival plays on corridor maps
Description: survival nodes reuse campaign maps (no real flanks/base-building terrain).
Impact: mode works correctly but tactics are limited.
Possible area: new arena zone in `src/config/zones.ts` + `world.ts`.
Status: future improvement, not a bug.

### simCheck shows defeats with unleveled parties
Description: default level-1 setups lose against 160–600-count waves (e.g. bridge city −32%).
Impact: none on players — informative only; the real gate is `runCheck` (all victories).
Possible area: `scripts/simCheck.ts`.
Status: by design (determinism + no-stall checks still pass).

### No browser testing in this environment
Description: no Playwright installed; UI changes verified by inspection + `tsc` + headless logic tests only.
Impact: visual regressions (CSS/DOM) can slip through.
Possible area: dev environment setup.
Status: open.
