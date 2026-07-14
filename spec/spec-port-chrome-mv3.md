# Spec: Port Vault Keeper to Chromium MV3 (Chrome / Edge)

## Problem Statement

Vault Keeper is a Firefox-only MV3 extension. Guardians on Chrome or Edge cannot load it: the packaged manifest uses Firefox event-page background scripts and `sidebar_action`, which Chromium rejects or ignores in ways that prevent a working Workbench. Users who already run DIM in Chromium have no supported path to Stage gear with Vault Keeper.

## Solution

Ship dual-target MV3 packages from one source tree: a Firefox artifact that keeps today's sidebar/event-page contract, and a Chromium artifact that uses a service worker background plus the Side Panel API. Shared product logic (messaging, Trash, Light, Agent) stays the same; browser shell differences live in build-time manifests and a thin Workbench-open adapter. Docs cover temporary load for Firefox, Chrome, and Edge.

## User Stories

1. As a Guardian on Chrome, I want to load Vault Keeper as an unpacked MV3 extension, so that I can use it next to DIM without switching browsers.
2. As a Guardian on Microsoft Edge, I want the same Chromium package to load, so that Edge is a first-class client.
3. As a Guardian on Firefox, I want the existing temporary add-on path to keep working, so that the Chromium port does not abandon me.
4. As a Guardian, I want the toolbar action to open the Workbench side surface on my browser, so that I can Stage gear without hunting for UI.
5. As a Guardian, I want the Light chip on DIM to remain status-only and not open the Workbench, so that browser user-gesture rules and the product contract stay consistent.
6. As a Guardian, I want Workbench ↔ background ↔ Light messaging to work on Chromium, so that vault read, filter apply, Stage, and Agent flows still function.
7. As a Guardian, I want Trash and agent settings to persist in extension storage on Chromium, so that staged state survives reloads.
8. As a Guardian, I want content scripts still injected on DIM host patterns, so that Light and dim-bridge keep working.
9. As a developer, I want `npm run build` to produce both browser targets, so that I do not maintain two source trees.
10. As a developer, I want automated tests to assert the multi-browser manifest contract, so that regressions in service worker / side panel keys are caught in CI.
11. As a packager, I want clear packaging docs for Chrome and Edge load-unpacked, so that manual QA is unambiguous.
12. As a security-conscious user, I want host permissions still limited to DIM + OpenRouter (no Bungie OAuth / identity sprawl), so that the Chromium port does not expand the trust surface.
13. As a Guardian, I want optional custom OpenRouter-compatible hosts still available, so that BYO agent settings are unchanged.
14. As a maintainer, I want types and shims that make `browser` APIs usable under Chromium, so that shared TypeScript sources compile cleanly.

## Implementation Decisions

- **Dual-artifact build**: emit separate Firefox and Chromium packages (or `dist` subtrees) from one build. Manifest keys that cannot share a single load-valid file (`background.scripts` vs `background.service_worker`, `sidebar_action` vs `side_panel`) are shaped at build time, not runtime.
- **Chromium shell**: `background.service_worker` (+ `type: module` if ES modules), `side_panel.default_path` → Workbench HTML, permission `sidePanel`, toolbar `action` without a popup so icon click can open the panel.
- **Workbench open on Chromium**: prefer `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` at service-worker startup; optional `sidePanel.open` only where a user gesture path requires it. Do not open Workbench from the Light chip.
- **Firefox shell**: keep gecko id, `background.scripts`, `sidebar_action`, and action-click → `sidebarAction.open` (or equivalent).
- **API namespace**: thin ensure-browser shim so Chromium's `chrome` global satisfies existing `browser.*` call sites; no rewrite of product messaging/protocol.
- **Panel adapter seam**: pure `installWorkbenchOpenOnAction(api)` (or equivalent) feature-detects Side Panel vs sidebarAction so unit tests drive the shipped function with fakes.
- **Permissions**: Chromium adds only `sidePanel` beyond existing `storage` + DIM/OpenRouter hosts; still no `tabs` permission sprawl, no `identity`, no Bungie OAuth.
- **Commands**: Firefox may retain `_execute_sidebar_action`; Chromium must not rely on that Firefox-only command as the sole open path (toolbar action + Side Panel behavior is the Chromium path).
- **Types**: keep Firefox WebExt types where sufficient; augment Side Panel types minimally for the adapter.
- **Docs**: README, packaging, and manual-qa describe both targets and load paths.

## Testing Decisions

- Good tests assert external contracts (manifest keys per target, open-path adapter behavior, chip does not open Workbench, permissions still exclude OAuth sprawl) and drive real shipped modules — not re-implemented adapters inside the test.
- Manifest tests cover both built (or generated) Firefox and Chromium contracts.
- Unit tests for the Workbench-open adapter: Chromium-shaped API installs side-panel behavior; Firefox-shaped API wires action → sidebar open; neither path is invoked from the Light chip.
- Existing messaging, trash storage, and light-chip tests remain green; extend only where Chromium shell requires it.
- Prior art: `tests/manifest.test.ts`, `tests/light-chip.test.ts`, messaging/storage suites.

## Out of Scope

- Chrome Web Store / Edge Add-ons submission, icons store listing, or signing
- Safari or non-Chromium browsers beyond Firefox retention
- New product features (agent quality, Prep, DIM Sync, in-game dismantle)
- Headed live-DIM E2E as a CI gate
- Permission expansion to Bungie OAuth / `identity` / `<all_urls>`
- Full rewrite of the build toolchain beyond dual-target packaging needs

## Further Notes

Industry references: Chrome Side Panel API (`sidePanel` permission, `setPanelBehavior`, `open`); Chrome MV3 service worker migration (`background.service_worker`); dual-package preferred over single dual-background zip for Edge safety. Process tickets should stay tracer-bullet vertical slices (manifest+build first, then open adapter, then docs/types).
