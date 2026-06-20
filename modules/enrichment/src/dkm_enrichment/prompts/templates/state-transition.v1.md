## StateTransition

A change of an entity from one state to another, fired by a trigger and optionally protected by a
guard condition.

Emit a `StateTransition` when the text describes an entity moving between two named states.

Fields:

- `entity` (required) — the entity whose state changes (e.g. "Payment", "Settlement Batch").
- `fromState` (required) — the state before the transition.
- `toState` (required) — the state after the transition.
- `name` — a short label for the transition (e.g. "Payment refunded", "Settlement Batch settled").
- `trigger` — what fires the transition (an Event name or a Decision outcome), if stated.
- `guardCondition` — a predicate that must hold for the transition to occur, if stated.
