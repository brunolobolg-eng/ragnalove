# CHANGELOG

Histórico conciso (gameplay, arquitetura, sistemas maiores). Sem código.

## 2026-10-06 — v0.5r
- Skill tree gained automatic prerequisite path (`prereqPath`/`learnPath` + preview/button/highlight); branches never auto-chosen.
- Currency renamed from Zeni to Zen in all player-facing text (internal identifiers kept).
- Attributes rebalanced for impact (~+33–80% per 5 points above base); caps and identities preserved.
- Temple fixed: HUD party refresh after city revive, free revive no longer blocked, failure feedback corrected.
- Party join hardened: `unlockHero` clears dead flag (join alive invariant).

## 2026-10-06 — v0.5q
- Campaign rebalance: target run duration 60–80 min via enemy quantity/frequency/density (bridge 160, Act III 600; bosses 90–240 with pacing, not HP).
- Spawn: organic packs up to 10, scatter 3, N-portal engine, density governor (breathe at 35, hard cap 120).
- Economy: per-kill EXP/Zen/souls −30% then EXP −50%; level curve 1.35 → 1.6; city threat −60% (paired with bigger hordes); Act II/III hpMult 2.0→1.6, 3.8→3.2; boss attendants 0.7→0.55.
- Survival became true last-stand: center setup, all monsters hunt, gate irrelevant, `survivalBest` records (save-compatible), richer result screen.
- Scripts: caps raised for bigger waves; new `survivalCheck.ts`.

## 2026-10-06 — v0.5p
- Click-to-move order, smaller focus ranges, infiltrator never locks, pulsing aggression zone.

## 2026-10-06 — v0.5o
- Monster focus lock 60 ticks (6s) with leash/cap/re-pick; faster hordes (packs, intervals, counts).

## 2026-10-05 — v0.5n
- 10 new events (+ small fail on all), procedural art, `eventCheck`.

## 2026-10-05 — v0.5m
- City-gate funnel on all 12 entrances (7→5 tiles + wings, right side open for archer fire).

## 2026-10-05 — v0.5l / v0.5k
- Central `aggressionRange` (speed→distance, single source for AI + visual zone); contextual `CoachTips` tutorial.

## 2026-10-05 — v0.5j / v0.5i
- Aggression zone for selected hero only + star progression on portrait; Night Crossing as fixed pill twin of the city bar.
