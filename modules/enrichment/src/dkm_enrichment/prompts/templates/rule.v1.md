## Rule

A single evaluable statement: a validation, decision, or constraint. In payments these are
concrete checks like "the CVV must match", "amount must not exceed the daily limit",
"settlement occurs T+1".

Emit a `Rule` for each discrete evaluable statement.

Fields:

- `expression` (required) — the rule as a precise, self-contained statement.
- `ruleType` (required) — `validation`, `decision`, or `constraint`.
- `source` — the authority for the rule (e.g. a scheme rulebook clause), if stated.
- `effectiveDate` / `expiryDate` — ISO 8601 dates if the text gives them.
