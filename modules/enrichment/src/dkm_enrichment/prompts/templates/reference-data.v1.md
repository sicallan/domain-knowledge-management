## ReferenceData

A managed reference dataset consumed by rules, decisions, and services. In payments e.g.
"BIN table", "Merchant Category Codes", "Scheme fee schedule", "Sanctions list".

Emit a `ReferenceData` entry for each managed dataset the text names.

Fields:

- `name` (required) — the dataset's name.
- `owner` (required) — the owning team/authority.
- `updateFrequency` — how often it refreshes, if stated.
- `consumingConcepts` — concepts/services that consume it, if stated.
- `sourceOfTruth` — the authoritative source, if stated.
- `refreshMechanism` / `stalenessPolicy` — if stated.
