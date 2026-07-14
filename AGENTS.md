# AGENTS.md

Agent context for repo. Human overview: [`README.md`](./README.md). Domain glossary: [`CONTEXT.md`](./CONTEXT.md).

## Project Overview

**Vault Keeper** (`d2vault-keeper`) — MV3 extension companion for [Destiny Item Manager](https://www.destinyitemmanager.com/). Help Guardians **Stage** vault gear into extension **Trash** for later **in-game dismantle**. Never API/game delete. No Bungie/DIM OAuth v1.

- **Repo**: `naifen/d2vault-keeper`
- **Runtime**: Node.js `>=24`, TypeScript (strict), Vitest, esbuild
- **Targets**: dual-package, one source tree
  - Firefox: event page + `sidebar_action`
  - Chromium (Chrome / Edge): service worker + Side Panel (`sidePanel`)
- **Package manager**: npm (`package-lock.json`; CI: `npm ci`)

### Architecture (MVP seams)

| Module | Path | Role |
|--------|------|------|
| `background` | `src/background/` | Event page (Firefox) / service worker (Chromium); message hub; no long poll when Workbench closed |
| `content` (Light) | `src/content/` | On-page **VK** chip + dim-bridge host on DIM |
| `workbench` | `src/workbench/` | Side surface UI (Intention, filters/results, Trash) |
| `messaging` | `src/messaging/` | Typed envelopes Workbench ↔ background ↔ Light |
| `inventory` | `src/inventory/` | Vault read from DIM IDB (+ defs/tags enrichment) |
| `trash` | `src/trash/` | Local Stage SoT in `storage.local` |
| `mirror` | `src/mirror/` | Best-effort DIM `junk` tag via local `dim-api-profile` IDB |
| `agent` | `src/agent/` | BYO Intention → draft DIM filter(s); never auto-Stage |
| `dim-bridge` | `src/dim-bridge/` | Search apply + tag hooks in DIM page |
| `dim-api-profile` | `src/dim-api-profile/` | DIM profile tag helpers |
| `manifest` | `src/manifest/` + `src/manifest.base.json` | Shared + target-shaped manifests at build time |
| `shared` | `src/shared/` | Thin webext/DIM helpers (`browser` ensure shim for Chromium) |

Build: `scripts/build.mjs` → dual `dist/firefox` + `dist/chromium`. Package: `scripts/package.mjs` → zips under `artifacts/`.

### Non-goals (v1 product contract)

- No in-extension dismantle / game delete
- No Bungie OAuth / `identity` permission sprawl
- No auto-Stage; agent recs only
- No store listing / signed dist as CI gate
- Live headed DIM E2E **not** CI gate (manual QA only)

## Agent skills

### Issue tracker

Issues live in GitHub (`naifen/d2vault-keeper`). See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles mapped to GitHub labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.

## Setup Commands

```bash
npm install          # local dev (lockfile-aware)
npm ci               # CI / clean install from package-lock.json
```

Requirements:

- Node.js 24+ (see `engines` in `package.json`)
- `zip` CLI for `npm run package`
- Firefox 121+ and/or Chromium 116+ (Chrome / Edge) for temporary load + manual QA

## Development Workflow

```bash
npm run typecheck    # tsc --noEmit (strict)
npm test             # vitest run
npm run test:watch   # vitest watch
npm run build        # → dist/firefox/ + dist/chromium/
npm run package      # build + zip → artifacts/vault-keeper-{firefox,chromium}.zip
```

### Load temporary extension

Full steps: [`docs/packaging.md`](./docs/packaging.md).

- **Firefox**: `npm run build` → `about:debugging` → This Firefox → Load Temporary Add-on → `dist/firefox/manifest.json`
- **Chrome / Edge**: `npm run build` → extensions page → Developer mode → Load unpacked → `dist/chromium/` directory

Workbench open via **toolbar action** (Firefox sidebar / Chromium side panel). Light chip **status only** — does **not** open Workbench.

### Source layout

- Product: `src/**`
- Unit/contract tests: `tests/**/*.test.ts` (+ `tests/fixtures/`)
- Specs / process: `spec/`
- Agent process docs: `docs/agents/`
- Scratch / WIP (ignored): `.scratch/`

## Testing Instructions

```bash
npm test                           # full suite (CI gate)
npm run test:watch                 # local iteration
npx vitest run tests/manifest.test.ts   # single file
npx vitest run -t "partial name"       # name filter
```

- Config: `vitest.config.ts` — Node env, `tests/**/*.test.ts`, no globals
- Prefer tests assert **external contracts** (manifest keys per target, messaging kinds, Stage exclusions, Workbench-open adapter) + drive shipped modules
- Dual-manifest: `tests/manifest.test.ts`; packaging: `tests/package-zip.test.ts`; Workbench open shell: `tests/workbench-open.test.ts`
- Live DIM QA manual: [`docs/manual-qa.md`](./docs/manual-qa.md). No headed DIM in automated gates.

Before claim done on permanent feature/bugfix:

1. `npm run typecheck`
2. `npm test`
3. `npm run build` (and `npm run package` if packaging/manifest changed)

## Code Style

- **TypeScript**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (`tsconfig.json`)
- **Modules**: ESM (`"type": "module"`); `.js` extensions in relative imports for bundler resolution
- **APIs**: shared `browser.*` via ensure shim; no rewrite product code to `chrome.*` call sites
- **Messaging**: kinds + payloads in `src/messaging/types.ts` + `protocol.ts`; keep Workbench ↔ background ↔ Light typed
- **Domain language**: glossary terms from `CONTEXT.md` (Stage / Unstage / Trash / Mirror / Intention / Light / Workbench). Avoid forbidden synonyms (e.g. Stage ≠ "delete")
- **Scope**: surgical diffs; no speculative abstractions; no Bungie OAuth or auto-Stage paths
- No project ESLint/Prettier scripts — match existing style; no formatter churn

## Build and Deployment

```bash
npm run build      # dual-target; lock-protected; atomic swap into dist/
npm run package    # requires prior/implicit build; needs system `zip`
```

Outputs:

| Path | Purpose |
|------|---------|
| `dist/firefox/` | Loadable Firefox temporary add-on tree |
| `dist/chromium/` | Loadable Chromium unpacked tree |
| `artifacts/vault-keeper-firefox.zip` | Packaged Firefox tree |
| `artifacts/vault-keeper-chromium.zip` | Packaged Chromium tree |

CI (`.github/workflows/ci.yml`, spec `spec/spec-process-cicd-ci.md`):

- Triggers: push/PR to `main`, `workflow_dispatch`
- Gates: `npm ci` → `typecheck` → `test` → `build` → `package`
- Node 24, `contents: read`, no secrets, no live DIM
- On failure, may upload `dist/` debug artifact

No prod deploy workflow. Store submission (CWS / AMO / Edge Add-ons) out of scope for current CI.

## Security Considerations

- Permissions: `storage`; Chromium also `sidePanel`; hosts limited to DIM + OpenRouter (optional custom OpenRouter-compatible / localhost)
- **Never** add Bungie OAuth / `identity` / blanket `<all_urls>` without explicit product decision
- Agent BYO key (OpenRouter-compatible); no commit API keys / no inject secrets into CI
- Trash = extension-local SoT; Mirror best-effort — must not block Stage success
- Favorite / exotic exclusions: never default-Stage or auto-recommend

## Pull Request Guidelines

- Prefer small vertical slices (manifest/build, adapter, product seam, docs) over mega-ports
- Before push/merge: `npm run typecheck && npm test && npm run build` (add `npm run package` if packaging touched)
- Title: short imperative summary of user-visible or agent-facing change
- Link GitHub issue when work from tracker (`gh` conventions in `docs/agents/issue-tracker.md`)
- Update `CONTEXT.md` / ADR only when domain language or hard-to-reverse decisions change (see `docs/agents/domain.md`)
- Specs under `spec/` cover larger process/product slices (e.g. CI, Chromium MV3 port) — update relevant spec when contract changes

## Debugging and Troubleshooting

| Symptom | Check |
|---------|--------|
| Build races / half-wiped `dist/` | `scripts/build.mjs` uses `.build.lock` + staged swap; avoid kill mid-build |
| Manifest missing after package | Run `npm run build` first; package expects `dist/{firefox,chromium}/manifest.json` |
| Workbench won't open | Toolbar action path only; Light chip status-only by design |
| Chromium vs Firefox shell bugs | Inspect open adapter (`src/background/workbench-open.ts`) + dual manifests |
| Vault empty / missing cache | DIM open, logged in, inventory warm (IDB) |
| Agent fails | Settings key + host permissions; optional hosts for custom base URL |
| CI red without local repro | Match Node 24 + `npm ci`; no DIM required |

Process / product specs:

- CI: `spec/spec-process-cicd-ci.md`
- Chromium dual-target port: `spec/spec-port-chrome-mv3.md`

## Additional Notes

- Prefer domain terms from `CONTEXT.md` in code, tests, issues, PR text
- If `docs/adr/` empty or missing area, proceed; create ADRs only when decision resolved (`docs/agents/domain.md`)
- `.scratch/` = local WIP, not product source
- Agent automated bar: typecheck + tests + dual-target build. Live browser+DIM evidence = human/manual QA
