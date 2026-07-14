# Spec: Vault projection seam (C4)

## Problem Statement

Identity + exclusion fields re-projected at every hop. Domain Stage map lives under workbench (`stage-map.ts`); agent has parallel pick helpers in `intention-to-agent-request`. Domain tests import workbench solely for Stage map.

## Goals

1. One pure projection module beside inventory/trash (not UI).
2. Callers take StageCandidate / Agent slice / ExclusionSubject shapes from there.
3. Fold or re-export `stage-map`; agent uses shared exclusion/identity projection.
4. Tests (enrichment-stage) stop importing workbench for Stage map.

## Non-goals

- Changing exclusion policy (`exclusions.ts` stays authority)
- New vault fields or enrichment behavior
- Full shell model (C5)

## Design

```
src/inventory/project.ts
  toStageCandidate(VaultItem) → StageCandidate
  selectedStageCandidates(items, ids)
  toExclusionFields(VaultItem) → ExclusionSubject | undefined
  toAgentVaultSliceRow(VaultItem) → AgentVaultSliceRow-shaped
```

Workbench `stage-map.ts` re-exports for existing import paths (or deleted if all updated).
`intentionToAgentRequest` uses shared projectors for exclusion index + vault slice.

## Acceptance criteria

### C4-T1 — Projection module

- [x] Pure projectors preserve id, itemHash, name, tierType, itemType, isExotic, tag
- [x] selectedStageCandidates filters by id set
- [x] Exported from inventory package surface

### C4-T2 — Call sites

- [x] workbench client / stage-selection use inventory projectors (direct or re-export)
- [x] intention-to-agent-request uses shared exclusion + slice projectors
- [x] enrichment-stage tests import projector without workbench package path for domain map

### C4-T3 — Tests + gates

- [x] Tests cover projector field carry + agent request still builds exclusionById
- [x] typecheck + test + build pass


## Verification

```bash
npx vitest run tests/enrichment-stage.test.ts tests/intention-to-agent-request.test.ts tests/workbench-client.test.ts
npm run typecheck && npm test && npm run build
```
