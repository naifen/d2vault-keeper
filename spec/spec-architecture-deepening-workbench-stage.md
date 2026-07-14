# Spec: Deepen Workbench Stage selected + Rec exclusion continuity (C1+C2)

## Problem Statement

Stage selected (composer-first Selection filter rewrite, no auto-Apply) spans five modules (`main` → shell-state pool/filter → selection-filter → client.stage → stage-map). Tests assert call order by grepping `main.ts`. Agent-only synthetic rec rows drop `isExotic`/`tag`/`tierType`, so Stage can accept items Recs meant to protect even though exclusion *policy* is already deep.

## Goals

1. One deep Stage selection module owns pool merge, exclusion-preserving rec projection, Selection filter rewrite, and candidate Stage send.
2. Workbench `main.stageSelected` only paints statuses and clears selection from a single outcome.
3. Rec→row projector preserves ExclusionSubject fields when vault lacks the id; vault wins on collision.
4. Behavioral Vitest tests drive the deep interface; structural greps of Stage order in `main.ts` are removed.

## Non-goals

- Full Workbench DOM/a11y extract from `main` (paint stays in main).
- Re-open `src/trash/exclusions.ts` policy (already deep).
- Auto-Apply Selection filter to DIM; auto-Stage; Bungie OAuth.

## Design

### Industry practice

In-process deep module (small interface, large implementation). Callers and tests share the same seam. Pattern mirrors `createStageMirrorUseCase` locality: product ordering lives once.

### Interface

```
planStageSelection({ vaultItems, recommendations, selectedIds })
  → { pool, candidates, selectionFilter }

runStageSelection(input, stagePort)
  → plan fields + stage send outcome
```

Internal (hidden):

- `projectRecToVaultRow` — vault wins; else synthetic row with ExclusionSubject from rec
- Selection filter via `buildSelectionFilter` / existing rules
- Candidate map via `toStageCandidate` / `selectedStageCandidates`

### Main adapter

```
const out = await runStageSelection({ vault, recs, selectedIds }, (pool, ids) => client.stage(pool, ids));
// paint filter rewrite if selectionFilter !== null; paint trash/results; clear selection
```

Does **not** call `applyFilter`.

## Acceptance criteria

### Ticket C1-T1 — Stage selection plan (pure)

- [x] `planStageSelection` returns pool = vault ∪ agent-only ids (vault wins)
- [x] Agent-only pool rows keep `isExotic` / `tag` / `tierType` from recommendation when present
- [x] Non-empty selection → `selectionFilter` string (instance ids OR-joined; synthetic-only → `""`)
- [x] Empty / missing selection → `selectionFilter: null`
- [x] `candidates` = Stage candidates for selected ids from pool (exclusion fields preserved)

### Ticket C1-T2 — runStageSelection + thin main

- [x] `runStageSelection` plans then calls stage port once with pool + selectedIds
- [x] Does not Apply filter (port surface is stage only)
- [x] `main.stageSelected` uses `runStageSelection`; no multi-hop pool/filter/stage orchestration
- [x] On stage failure, returns error for paint; does not clear selection rewrite incorrectly (filter rewrite only when plan has non-null filter and stage ok — match current product: rewrite after successful stage)

### Ticket C2-T1 — Rec display projector shares exclusion continuity

- [x] `recRowsFromAgent` (or re-export from stage-selection) uses same projector: vault wins; synthetic keeps exclusion fields + optional reason
- [x] Stage of agent-only exotic/favorite via plan candidates is denied by `stageItems` / exclusions (integration through plan + trash policy)

### Ticket C1-T3 — Tests replace greps

- [x] New/updated tests exercise `planStageSelection` / `runStageSelection` with real shipped functions
- [x] Remove Stage-order source greps of `main.ts` from `tests/stage-selection-filter.test.ts`
- [x] `npm run typecheck`, `npm test`, `npm run build` pass


## Verification

```bash
npx vitest run tests/stage-selection-filter.test.ts tests/workbench-client.test.ts
npm run typecheck && npm test && npm run build
```

## References

- Architecture review 2026-07-14 C1 + C2
- `src/trash/use-case.ts` StageMirrorUseCase shape
- ADR-0001 Workbench shell IA (composer-first Selection filter)
