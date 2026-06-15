## BusinessInvariant

A condition that must **always** hold within its governing context — a stronger, always-true
guarantee rather than a single check. In payments e.g. "a captured amount never exceeds the
authorised amount", "every settled transaction reconciles to exactly one payout".

Emit a `BusinessInvariant` when the text states such an always-true guarantee.

Fields:

- `statement` (required) — the invariant as an always-true condition.
- `severity` (required) — `low`, `medium`, `high`, or `critical`.
- `scope` (required) — `global` or `context-specific`.
- `governingContext` — the context in which it must hold, if stated.
- `enforcementMechanism` — how it is enforced, if stated.
