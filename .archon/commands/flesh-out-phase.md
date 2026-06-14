---
description: Flesh out all features for a given implementation phase into detailed feature-definition docs + GitHub issues (no code).
argument-hint: <phase id, e.g. "1">
---

# Flesh out a phase into feature definitions

You are a principal engineer turning a phase of the **Domain Knowledge Management** plan into
**buildable feature definitions**. You expand existing specs — you do **not** write application
code, scaffolding, or tests in this run.

Phase to flesh out: **$ARGUMENTS**
Workflow artifacts dir: `$ARTIFACTS_DIR`

## Authoritative inputs — READ THESE FIRST (do not re-derive what already exists)

1. **`specs/`** — the 16 component technical specs are the **primary source**. `specs/README.md`
   maps every spec to its Phase and Layer. For the target phase, expand the specs assigned to it;
   reuse their Purpose/Inputs/Outputs/Behaviour/Contracts/Key-Decisions verbatim where they hold.
   Do not invent a design a spec already states.
2. **`plan.md`** — the phase section (goal, numbered steps, TDD approach, OCP validation).
3. **`docs/phase-<N>/decisions.md`** — locked technical decisions for this phase. These are
   binding inputs; apply them to every feature. (If absent, note it and proceed.)
4. **`CLAUDE.md`** — engineering principles (TDD, OCP, PM discipline) and architecture commitments.
   These are rules, not suggestions.
5. **`docs/adr/`** — accepted decisions (e.g. ADR-0001 on JSONL vs OKF). Respect them.

## What to produce

### A. One feature-definition doc per feature → `docs/features/phase-<N>/<NN>-<slug>.md`

Derive the feature list from the phase's numbered steps in `plan.md` **and** its OCP-validation
items (each OCP target is its own feature). Map every feature to the spec(s) it expands.

Each doc MUST contain, in this order:

1. **Feature** — name, the plan step id(s) (e.g. 1.2), and the spec(s) it expands (link to `specs/...`).
2. **Summary & scope** — in scope / out of scope. Pull from the spec; don't contradict it.
3. **Dependencies** — upstream specs, Phase 0 deliverables relied on, and other phase features
   it depends on or unblocks.
4. **Applied decisions** — which `decisions.md` entries constrain this feature, and how.
5. **User stories** — `As a <role>, I want <capability>, so that <value>`.
6. **Acceptance criteria** — Given/When/Then, testable, covering edge cases the spec names.
7. **Interface contracts** — the key types/signatures (TypeScript or Python per the language
   decision), reusing the spec's interfaces where defined.
8. **TDD test plan** — the failing tests to write first: unit, contract (against ports), and
   golden-dataset/integration. Name the test files and what each asserts. Tests come first.
9. **Task breakdown** — an ordered, estimable checklist a developer can pick up.
10. **OCP extension points** — what stays open for extension and what must stay closed.
11. **Open questions / risks** — unresolved Key Decisions from the spec, surfaced for the team.

Also write `docs/features/phase-<N>/README.md` — an index table (feature, plan step, spec, one-line summary).

### B. One GitHub issue per feature

For each feature, create a tracking issue (be idempotent — first `gh issue list --search`
by title; skip if it already exists):

- **Title**: `Phase <N>.<step> — <Feature name>`
- **Body**: short summary + link to the committed feature doc + the spec(s) + acceptance-criteria
  digest. End with a checklist mirroring the task breakdown.
- **Labels**: the matching `area:*` (by layer), `type:feature` (or `type:spec` for design-heavy
  items), and `priority:*` by sequence (earlier slice steps = higher priority).
- **Milestone**: the phase's milestone (e.g. titles starting `Phase 1`). Resolve the exact title
  with `gh api repos/:owner/:repo/milestones`.

## Constraints

- **No application code, no test code, no scaffolding** in this run — definitions only.
- Honour every `decisions.md` entry and every accepted ADR. Do not reopen settled decisions;
  surface genuinely new questions under "Open questions".
- Prefer reuse: cite and expand the specs rather than restating or contradicting them.
- Commit your work with a clear message. The workflow opens the PR.

## Output

Write a concise summary of what you produced (files created, issues opened) to
`$ARTIFACTS_DIR/summary.md` and print it as your final message.
