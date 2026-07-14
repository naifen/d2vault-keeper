# Progress: Workbench composer-first redesign (#33)

**Status:** Implementation tickets #34–#39 complete (shipping code + tests + docs). GitHub issues closed with all AC checkboxes `[x]`.  
**Date:** 2026-07-14  
**Ship commit:** `1cd7b78`  
**Spec:** [#33](https://github.com/naifen/d2vault-keeper/issues/33) · ADR [`adr/0001-workbench-shell-ia.md`](./adr/0001-workbench-shell-ia.md)

## Tickets

| # | Title | Status |
|---|--------|--------|
| #34 | Selection filter pure builder + tests | Closed — `src/workbench/selection-filter.ts`, `tests/selection-filter.test.ts` |
| #35 | Vault perk enrichment (best-effort) | Closed — `perks?` on `VaultItem`, `plugHashesFromProfile` / `applyPerks`, `tests/perk-enrichment.test.ts` |
| #36 | Composer-first Workbench shell (variant C) | Closed — `src/workbench/index.html` / `styles.css` / `main.ts`, `tests/workbench-shell.test.ts` |
| #37 | Stage selected writes Selection filter | Closed — `selectionFilterAfterStage` + stageSelected wiring, `tests/stage-selection-filter.test.ts` |
| #38 | Results perk hover | Closed — `perk-display.ts` + row title/aria, `tests/perk-hover.test.ts` |
| #39 | Manual QA + docs | Closed — `docs/manual-qa.md` updated for composer-first path |

## Product contracts retained

- Suggest never auto-Applies or auto-Stages
- No Workbench Dismantle; Trash safe copy only
- Favorite / Exotic Stage exclusions unchanged
- Light chip status-only; no protocol redesign
- Virtualized Results list retained

## Gates

```bash
npm run typecheck
npm test
npm run build
```
