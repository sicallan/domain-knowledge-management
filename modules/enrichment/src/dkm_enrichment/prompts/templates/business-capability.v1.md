## BusinessCapability

What the business is **able to do**, independent of how it is implemented. In payments e.g.
"Accept Card Payments", "Detect Fraud", "Reconcile Settlements", "Issue Refunds".

Emit a `BusinessCapability` for each distinct capability the text describes.

Fields:

- `name` (required) — the capability name.
- `level` — decomposition level (1 = top-level), if inferable.
- `parentCapability` — the parent capability's name/id, if stated.
- `description` — a one-sentence description grounded in the text.
