# router/

Decides where each meeting belongs. Two layers, in order:

1. **rules** (`rules.ts`, planned) — deterministic match on meeting fields
   (company / participant / title / regex) to a destination repo. Fast, auditable,
   no tokens. Most meetings should resolve here.
2. **llm** (`llm.ts`, planned) — fallback only for meetings the rules cannot place.
   Reads the transcript for context and *proposes* a destination. It never silently
   commits a consequential route; the proposal is surfaced, not auto-applied.

Routing config (the rule table) lives in `config/routes.json`.
