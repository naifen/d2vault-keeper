# Architecture deepening progress

Source review: architecture-review HTML (2026-07-13). Candidates C1–C5; Workbench `main` is an explicit non-candidate.

## Status

| Candidate | Status | Notes |
|-----------|--------|-------|
| C1 Stage + Mirror use-case | **done** | `createStageMirrorUseCase` in `src/trash/use-case.ts`; thin `trash-handlers` |
| C2 Favorite/Exotic exclusion locality | **done** | `filterExcludedRecommendations` + shared `exclusionDenialReason`; enforced in `runAgent` |
| C3 Collapse Mirror adapter tower | **done** | Two adapters: `createIdbMirrorBridge` / `createBrowserIdbMirrorBridge` + `createMessagingMirrorBridge` |
| C4 Light-relay dispatch | **done** | `createLightRelay` (`relay` / `relayKind`) in `src/messaging/light-relay.ts` |
| C5 Agent request-build naming | **done** | `intentionToAgentRequest`, `agentMessages`, `completionBody` |
| Workbench main | **non-candidate** | Still DOM adapter; not extracted |

## Commits (topic)

1. Deepen Stage+Mirror use-case behind injectable domain surface  
2. Share Favorite/Exotic exclusion across Stage and Agent  
3. Collapse Mirror adapters to IDB page + messaging seams  
4. Deepen Light-relay into one multi-tab select+fallback path  
5. Rename Agent request-build along product steps  
6. Thermo-nuclear hardening (parse exclusion fields, IDB write path, unstage payload)

## Architecture seams (after)

```
Workbench client
  → envelopes
Background hub
  → createLightRelay (vault/filter/mirror multi-tab)
  → StageMirrorUseCase (stage/unstage/repair/get)
       → TrashStorage + stageItems/exclusions
       → MirrorBridge (messaging adapter)
Light
  → createBrowserIdbMirrorBridge (IDB + membership)
Agent
  → intentionToAgentRequest → runAgent → completionBody → parse
  → filterExcludedRecommendations (shared with Stage)
```

## Residual risks

- Live headed DIM QA remains manual (project standard). Automated bar: typecheck + tests + dual-target build.
- Agent rec filtering without vault needs exclusion fields on the model payload (now preserved if present); Stage always enforces on Stage.
