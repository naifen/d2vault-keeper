# Spec: C5 shell model (focused) + C6 hub factories reassessment

## C5 — Suggest after-transition (ship)

### Problem

After C1–C2, Stage greps are gone; Suggest path still proven by grepping `main.ts` `runSuggest` body. Full shell owning all lets is a mega-rewrite (prior non-candidate if overscoped).

### Solution (narrow)

Deepen **after-Suggest** pure transition only:

```
planAfterSuggest(AgentResult) → { filterText, resultsTab, recommendations }
```

Rules: no Apply, no Stage. main paints from the plan. Behavioral tests replace Suggest body greps.

### Non-goals

- Extract all DOM/a11y from main
- Own full vault/trash mutation machine (not required once Stage transition is deep)

### Acceptance criteria

- [x] `planAfterSuggest` returns filter text + tab + recs from AgentResult
- [x] main `runSuggest` uses plan (no Apply/Stage on success path)
- [x] workbench-shell tests assert plan behavior; remove runSuggest body source greps
- [x] typecheck + test + build pass

## C6 — Hub + Light factories (defer)

### Deletion test

`background/index.ts` and `content/light.ts` kind switches are shallow composition roots. After C3, product rules live in AgentSession / StageMirror / LightRelay. Extracting `createBackgroundHub` would **move** the switch without concentrating new complexity. Second adapter for hub routing does not exist beyond tests that can already inject leaf handlers.

### Decision

**Defer** C6. Documented rationale: pure move fails deletion test; revisit only if a second composition root (e.g. test harness hub) needs the same wiring.

### Acceptance criteria (deferral)

- [x] Written rationale in `docs/architecture-deepening.md` (this spec + progress doc)
- [x] No silent skip — status explicit
