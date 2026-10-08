# AI_WORKFLOW

Como trabalhar no Vanguarda gastando pouco contexto.

## STEP 0
A palavra do dono nesta conversa vale mais que qualquer documento ou código.
Em caso de conflito, obedeça ao dono e atualize os documentos depois.

## STEP 1
Read `VANGUARDA_CONTEXT.md`.

## STEP 2
Determine which system the task touches (section Major Systems).

## STEP 3
Inspect only the relevant source files (paths are referenced in the context doc).

## STEP 4
Do not read the entire repository unless necessary.

## STEP 5
Implement the smallest safe change (no unrelated systems, no silent redesigns).

## STEP 6
Test the affected system (`tsc --noEmit` + the relevant `scripts/*.ts` check; see context doc gate).

## STEP 7
If a permanent gameplay/design rule changed, update `VANGUARDA_CONTEXT.md`.

## STEP 8
If a meaningful historical change occurred, add a short entry to `CHANGELOG.md`.

## STEP 9
If a known issue was fixed, update `KNOWN_ISSUES.md` (remove it) or `TODO.md`.

## STEP 10
Do not update documentation for trivial code changes.
