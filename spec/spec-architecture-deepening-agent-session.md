# Spec: Agent session use-case (C3)

## Problem Statement

Trash path is deep use-case + thin handler; Agent path keeps product rules (single-flight cancel, predecessor-finally ownership, API key mask merge) in the envelope adapter. Mask sentinel `"••••••••"` is duplicated across Workbench client and handlers.

## Goals

1. Injectable `AgentSession` deep module: `getSettings` · `setSettings` · `run` · `cancel`.
2. Handlers only unpack envelopes and pack results.
3. Mask policy lives in one place; Workbench client imports it.
4. Tests drive session with fake KvStorage / fetch — no browser.storage required for core rules.

## Non-goals

- Auto-Stage from agent recs
- Changing LLM completion / parse depth
- C6 hub factories

## Design

Ports & adapters (local-substitutable storage + inject fetch):

```
createAgentSession({ getStorage, getFetch? }) → AgentSession
```

Product rules (locality):

- Single-flight: new `run` cancels predecessor; predecessor `finally` must not clear live cancel
- Cancel registered before settings await
- Mask: transit displays mask; set ignores mask / empty as “keep current key”
- Never put raw key into logs (existing redact)

## Acceptance criteria

### C3-T1 — Session module

- [x] `createAgentSession` exposes getSettings / setSettings / run / cancel
- [x] API key mask constant + merge policy in session module (or adjacent agent mask helper)
- [x] getSettings returns masked key + hasKey; setSettings preserves key when mask/empty

### C3-T2 — Thin handlers

- [x] agent-handlers only envelope I/O over session instance
- [x] Existing cancel-slot behavioral guarantees still pass (handlers or session tests)

### C3-T3 — Tests + client mask

- [x] Session tests with injectable storage + hanging fetch for cancel races
- [x] Workbench client uses shared mask constant (no second magic string for policy)
- [x] typecheck + test + build pass

## Verification

```bash
npx vitest run tests/agent-session.test.ts tests/agent-handlers.test.ts
npm run typecheck && npm test && npm run build
```
