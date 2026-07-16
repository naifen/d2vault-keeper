# Tickets: C3 Agent session

Part of `spec/spec-architecture-deepening-agent-session.md`.

## C3-T1 — Session module

**Status:** done

- [x] createAgentSession with getSettings / setSettings / run / cancel
- [x] Mask constant + merge policy colocated
- [x] getSettings masked; setSettings keeps key on mask/empty

## C3-T2 — Thin handlers

**Status:** done

- [x] Handlers are envelope adapters over session
- [x] Cancel-slot guarantees hold

## C3-T3 — Tests + client

**Status:** done

- [x] Session tests with fakes
- [x] Client imports shared mask
- [x] Gates pass
