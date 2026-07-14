# Workbench shell information architecture

The Workbench is a product surface next to DIM, not a debug form. **Winning shell (prototype variant C — composer-first):** Intention + primary **Suggest** near the top → editable DIM filter card (**Copy** + **Apply**) → Results (**Matches | Recs**, multi-select, **Stage selected**) → agent explanation → **Trash** as a bottom peek/expand panel (not a separate browser window). Settings (API key, vault opt-in, advanced/debug) live in a sheet/modal. Visual language is DIM-adjacent dark (navy/charcoal, brass accents)—not the blue/pink wireframe palette.

**Stage selected** always Stages explicitly (never auto) and also rewrites the query card to a **Selection filter** that exactly matches the selected Vault items. Results rows show perk details on hover when inventory data can supply them (best-effort). Suggest never auto-Applies or auto-Stages. There is no Workbench “Dismantle” control (in-game dismantle only).

**Considered options:** variant A (query-first, Intention bottom) and variant B (command rail + side drawer)—rejected after prototype in favor of C; wireframe “Dismantle” (rejected: product contract); separate browser popup for Trash (rejected: dual-surface sync cost); auto-Apply after Suggest (rejected: Apply stays intentional).
