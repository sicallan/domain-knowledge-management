---
name: ship-feature
description: |
  Use when: shipping a planned Phase feature in this repo end-to-end via Archon —
  brief → launch → monitor → recover → review → merge → cleanup → close issue → next.
  Triggers: "ship feature", "build feature #N", "build the next feature", "do feature N",
            "ship the next phase feature", "implement feature #N via archon",
            "continue the feature build", "next feature in the slice".
  Capability: orchestrates an Archon `archon-feature-development` run for one feature doc,
            then reviews CI, merges, cleans up the worktree, and closes its issue.
  NOT for: authoring Archon workflows/commands (use the `archon` skill); ad-hoc edits not
            tied to a `docs/features/phase-*/` feature.
---

# ship-feature

Ship **one** planned feature (a `docs/features/phase-<N>/*.md` brief) from spec to merged PR via
Archon. This codifies the loop run repeatedly in this repo. Read
[CLAUDE.md](../../../CLAUDE.md) "Building with Archon" + "Operational gotchas" first — every gotcha
below references it.

## When to stop and ask
- The feature has an unresolved **Key Decision** / needs an ADR → raise it first.
- A feature needs a **live external service** (LLM, Neo4j) in CI → confirm the approach
  (default: deterministic/fake gates CI, real test auto-skips on a missing env var, verification
  tracked as a follow-up issue — see CLAUDE.md Conventions).
- Build order is ambiguous → confirm against the phase README's dependency order.

## Steps

### 1. Prep
- Open the feature doc + its spec(s) + `docs/phase-<N>/decisions.md`. Note **Phase, Layer,
  in/out of scope, applied decisions, the §8 TDD plan, and OCP open/closed surfaces**.
- Confirm what the foundation already provides so the brief says *reuse, don't re-scaffold*
  (grep `modules/`).

### 2. Brief & launch
- Compose a tight brief that states: implement **only** this feature; **build on** the named
  existing modules (don't re-scaffold); **TDD-first** per the doc's §8; honour the **OCP**
  open/closed surfaces; **CI green without secrets/services** (skip-without-env + follow-up
  issue); **British spelling**; explicit **out-of-scope** list; end with "open a PR".
- Launch as a **harness-tracked background task** with an unbuffered log (gotcha #1):
  `ARCHON_SUPPRESS_NESTED_CLAUDE_WARNING=1 archon workflow run archon-feature-development \
   --branch feat/phase<N>-<n>-<slug> "<brief>" > logs/archon/<branch>-<ts>.log 2>&1`
  (or `scripts/start-archon.sh <workflow> <branch> "<brief>"` + a PID-watcher).

### 3. Monitor → recover
- Wait for completion (notification / PID-watcher). Confirm a worktree was created and the
  `implement` node is progressing (don't mistake `tail` buffering for a hang).
- **On session-limit failure (gotcha #8):** the partial work survives in the worktree.
  `--resume` won't work. If only commit/PR remain → **finish by hand** (verify green, commit,
  push, `gh pr create`). Else `archon continue <branch> "<precise what's-left; open the PR
  yourself>"`.

### 4. Review (don't trust the self-report)
- Verify **CI green on GitHub** (`gh pr checks <pr>`) **and** `pnpm run validate` locally
  (`pnpm install` first if the main checkout lacks `node_modules` — gotcha #10).
- Check this feature's **architectural boundary**: OCP closed surfaces untouched; no
  provider/DB API leaks above its port; the reusable contract suite is reused, not forked.
- Read the diff for correctness + scope creep.

### 5. Merge & clean (gotcha #5)
- `gh pr merge <pr> --squash --delete-branch` (local-branch delete will fail while the worktree
  holds it — expected).
- `archon complete <branch> --force` → then sync `main` (`git checkout main && git pull --ff-only`)
  and delete any leftover local branch.

### 6. Close out
- Close the feature's GitHub issue with the PR/commit refs.
- File a **follow-up issue** for any deferred live-service verification (LLM eval, Neo4j parity).

### 7. Advance
- Move to the next feature in the phase README's dependency order. Features are sequential and
  share the foundation — review+merge between each; do **not** run them in parallel.
