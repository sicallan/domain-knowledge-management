## Decision

A point where logic selects a path or outcome from inputs, rules, and context — the
highest-value node type. In payments these are points like "authorisation decision", "fraud
hold decision", "routing decision", "retry-or-reject decision".

Emit a `Decision` when the text describes a choice the system or a person makes.

Fields:

- `name` (required) — the decision's name.
- `decisionType` (required) — `automated`, `manual`, or `hybrid`.
- `outcomes` (required, ≥ 1) — the possible results (e.g. `["approve", "decline", "refer"]`).
- `inputs` — the signals/data the decision consumes.
- `owner` — the team or role accountable, if stated.
- `frequency` — how often it occurs, if stated.
- `latencyBudget` — any stated time budget (e.g. "under 200ms").
