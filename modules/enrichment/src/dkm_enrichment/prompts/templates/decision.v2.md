## Decision

A point where logic selects a path or outcome from inputs, rules, and context — the
**highest-value node type**, where regulation bites and business logic concentrates. In payments
these are points like "authorisation decision", "fraud hold decision", "routing decision",
"retry-or-reject decision".

Emit a `Decision` when the text describes a *choice* the system or a person makes between outcomes.

Fields:

- `name` (required) — the decision's name (e.g. "Authorise Payment", "Place Fraud Hold").
- `decisionType` (required) — `automated`, `manual`, or `hybrid`.
- `outcomes` (required, ≥ 1) — the possible results (e.g. `["approve", "decline", "refer"]`).
- `inputs` — the signals/data the decision consumes.
- `owner` — the team or role accountable, if stated.
- `frequency` — how often it occurs, if stated.
- `latencyBudget` — any stated time budget (e.g. "under 200ms").

### Decision vs Rule — do not collapse the two

A Decision **uses** rules but **is not a rule**. A *Rule* is a single evaluable statement (a
validation, a constraint, a yes/no test — e.g. "block the card after three consecutive CVV
failures"). A *Decision* is the choice point that **evaluates** one or more such rules and selects
an `outcome`. Prose often blurs this — "the rule that decides whether to block" names a *Rule*,
while "the card-block decision" names the *Decision* that evaluates it. When in doubt: if it
reduces to a single true/false test, it is a Rule; if it selects between outcomes, it is a Decision.
Emit each as its own entity and connect them with an `evaluates` edge — never merge a Rule into a
Decision (or vice versa).

### Decision-specific relationships

When you emit a Decision, also surface the edges that make it traceable (only those the passage
supports), pointing at the relevant entities:

- `evaluates` → a `Rule` or `BusinessInvariant` the decision applies.
- `consumes` → a `ReferenceData` set the decision reads.
- `constrainedBy` → a `BusinessInvariant` that bounds the decision.
- `triggeredBy` ← the `Event` or `OrchestrationStep` that invokes the decision.
- `produces` → the `Event`, command, or `StateTransition` the decision causes.
- `realizedBy` → the service or component that implements the decision.
