# Architecture deepening progress

Source reviews:

- 2026-07-13: C1–C5 StageMirror / exclusions / Mirror adapters / Light-relay / Agent naming
- 2026-07-14: Workbench Stage shell, Rec exclusion continuity, Agent session, vault projection, shell Suggest, hub factories

## Status (2026-07-14 review candidates)

| Candidate | Status | Notes |
|-----------|--------|-------|
| C1 Stage selected shell | **done** | `planStageSelection` / `runStageSelection` in `src/workbench/stage-selection.ts`; main paints |
| C2 Rec → Stage exclusion continuity | **done** | `projectRecToVaultRow` preserves ExclusionSubject on agent-only rows |
| C3 Agent session use-case | **done** | `createAgentSession` in `src/agent/session.ts`; thin `agent-handlers` |
| C4 Vault projection seam | **done** | `src/inventory/project.ts`; stage-map re-exports; agent uses shared projectors |
| C5 Workbench shell model | **done (focused)** | `planAfterSuggest` only — not full DOM extract; Suggest greps replaced |
| C6 Hub + Light factories | **deferred** | Pure switch move fails deletion test; product rules already in StageMirror / AgentSession / LightRelay |

## Prior deepenings (2026-07-13)

| Candidate | Status | Notes |
|-----------|--------|-------|
| C1 Stage + Mirror use-case | **done** | `createStageMirrorUseCase` in `src/trash/use-case.ts` |
| C2 Favorite/Exotic exclusion locality | **done** | `filterExcludedRecommendations` + shared `exclusionDenialReason` |
| C3 Collapse Mirror adapter tower | **done** | Two adapters: IDB page + messaging |
| C4 Light-relay dispatch | **done** | `createLightRelay` |
| C5 Agent request-build naming | **done** | `intentionToAgentRequest`, `agentMessages`, `completionBody` |
| Workbench main full DOM extract | **non-candidate** | Paint/a11y stays in main |

## Specs / tickets

| Spec | Tickets |
|------|---------|
| `spec/spec-architecture-deepening-workbench-stage.md` | `spec/tickets/c1c2-stage-selection.md` |
| `spec/spec-architecture-deepening-agent-session.md` | `spec/tickets/c3-agent-session.md` |
| `spec/spec-architecture-deepening-vault-project.md` | `spec/tickets/c4-vault-project.md` |
| `spec/spec-architecture-deepening-shell-c5-c6.md` | C5 AC in-spec; C6 deferred in-spec |

## Architecture seams (after 2026-07-14)

```
Workbench main (paint / a11y)
  → planAfterSuggest (Suggest fill + tab)
  → runStageSelection (pool · filter · candidates · stage port)
  → createWorkbenchClient → envelopes
Background hub (composition root — switch stays)
  → createLightRelay (vault/filter/mirror multi-tab)
  → StageMirrorUseCase (stage/unstage/repair/get)
  → AgentSession (settings · run · cancel · mask)
inventory/project
  → StageCandidate · Agent vault slice · ExclusionSubject
Light
  → createBrowserIdbMirrorBridge + dim-bridge
Agent
  → intentionToAgentRequest (uses inventory projectors)
  → runAgent → completionBody → parse
  → filterExcludedRecommendations
```

## C6 deferral rationale

`background/index.ts` and `content/light.ts` kind switches are shallow composition roots. After AgentSession + StageMirror + LightRelay, product rules no longer live in those switches. Extracting `createBackgroundHub` / `createLightHandler` would only relocate the switch (deletion test: complexity does not reappear across N callers — it already sits in deep leaves). Revisit only if a second composition root (test harness hub) needs identical wiring.

## Residual risks

- Live headed DIM QA remains manual (project standard). Automated bar: typecheck + tests + dual-target build.
- Agent post-filter uses full `exclusionById` from Workbench vault (not slice-capped). Without vault items, model-supplied exclusion fields on recs are the only Agent-side signal; Stage still enforces on Stage via preserved fields on synthetic pool rows.
- Full Workbench shell state machine (all module-level lets) not extracted — deliberate scope limit; Stage + Suggest transitions cover review heat.
