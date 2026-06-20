## OrchestrationStep

A single step within an orchestration flow: its position in the sequence, the kind of action it
performs, and the service that performs it.

Emit an `OrchestrationStep` for each distinct step of a flow.

Fields:

- `sequence` (required) — the **zero-based** position of the step within its owning flow. Number
  steps by their order of appearance; if the document numbers them from 1, subtract 1. Preserve
  document order even when steps are unnumbered (fall back to order of appearance).
- `actionType` (required) — the kind of action (e.g. `invoke-service`, `publish-event`,
  `evaluate-decision`, `validate`, `persist`, `compensate`).
- `name` — a short label for the step (e.g. "Validate Card", "Submit To Scheme").
- `serviceOrComponent` — the service/component that performs the step, if stated.
- `input` / `output` — the step's input/output payloads, if stated.
