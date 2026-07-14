# Tickets: C1+C2 Stage selection + Rec exclusion

Part of `spec/spec-architecture-deepening-workbench-stage.md`.

## C1-T1 — Stage selection plan (pure)

**Status:** done

### Acceptance criteria

- [x] `planStageSelection` returns pool = vault ∪ agent-only ids (vault wins)
- [x] Agent-only pool rows keep `isExotic` / `tag` / `tierType` from recommendation when present
- [x] Non-empty selection → `selectionFilter` string (instance ids OR-joined; synthetic-only → `""`)
- [x] Empty / missing selection → `selectionFilter: null`
- [x] `candidates` = Stage candidates for selected ids from pool (exclusion fields preserved)

## C1-T2 — runStageSelection + thin main

**Status:** done

### Acceptance criteria

- [x] `runStageSelection` plans then calls stage port once with plan candidates
- [x] Does not Apply filter (port surface is stage only)
- [x] `main.stageSelected` uses `runStageSelection`; no multi-hop pool/filter/stage orchestration
- [x] Filter rewrite applied in main only after successful stage when `selectionFilter !== null` (current product behavior)

## C2-T1 — Rec display projector shares exclusion continuity

**Status:** done

### Acceptance criteria

- [x] Recs list projector uses same rec→row path; synthetic keeps exclusion fields + optional reason
- [x] Agent-only exotic/favorite cannot Stage when exclusion fields preserved (plan → stageItems)

## C1-T3 — Tests replace greps

**Status:** done

### Acceptance criteria

- [x] Behavioral tests on shipped `planStageSelection` / `runStageSelection`
- [x] Stage-order source greps of `main.ts` removed from stage-selection-filter tests
- [x] typecheck + test + build pass
