## OrchestrationFlow

A runtime behaviour sequence: an ordered set of steps kicked off by a trigger and owned by a
service. In payments these are flows like "card authorisation", "settlement", "refund", or
"chargeback handling".

Emit an `OrchestrationFlow` when the text describes an end-to-end process made of ordered steps.

Fields:

- `name` (required) — the flow's canonical name.
- `steps` (required, ≥ 1) — the ordered step names that make up the flow, **in document order**.
- `trigger` — what initiates the flow (the name of an Event or Command), if stated.
- `owningService` — the service or component that owns the flow, if stated.
