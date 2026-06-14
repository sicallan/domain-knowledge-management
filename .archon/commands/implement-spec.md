# Implement a component spec (TDD-first)

You are implementing one component of the Domain Knowledge Management platform from its
technical specification. Read [CLAUDE.md](../../CLAUDE.md) first for the engineering
principles — they are rules, not suggestions.

## Inputs
- **Spec file**: `{{spec_path}}` (a file under `specs/`)

## Procedure
1. Read the spec end to end. Note its **Phase**, **Layer**, **Inputs/Outputs/Contracts**,
   **Dependencies**, and **Key Decisions**.
2. If any Key Decision is unresolved, stop and propose an ADR for `docs/adr/` rather than
   guessing.
3. **Write failing tests first** against the spec's contracts (schema validation, port
   contract tests, or golden-dataset evals as appropriate to the layer).
4. Implement the minimum code to make the tests pass. Respect OCP: extend via plugins/typed
   extension points, evolve schemas additively, never modify stable contracts.
5. Wire up CI checks so the new tests run on every PR.
6. If implementation forced a deviation from the spec, update the spec with rationale.

## Output
- Passing tests + implementation, scoped to a single spec.
- A short summary: what was built, decisions made/deferred, and any spec updates.
