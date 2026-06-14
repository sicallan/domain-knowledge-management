#!/usr/bin/env bash
#
# setup-github.sh — idempotent GitHub project structure for Domain Knowledge Management.
#
# Creates / updates:
#   - Milestones: one per implementation phase (0a -> 6), with due dates.
#   - Labels:     area:* (layer/module), type:*, status:*, priority:*.
#
# Prerequisites:
#   gh auth login           # or set GH_TOKEN
#   Run from anywhere inside the repo (uses the 'origin' GitHub remote).
#
# Usage:
#   ./scripts/setup-github.sh                 # apply to the repo's origin
#   START_DATE=2026-06-15 ./scripts/setup-github.sh   # anchor milestone due dates
#   DRY_RUN=1 ./scripts/setup-github.sh       # print actions without calling the API
#
set -euo pipefail

# Project start (Monday of week 1). Milestone due dates are derived from this.
START_DATE="${START_DATE:-2026-06-15}"
DRY_RUN="${DRY_RUN:-0}"

run() { if [[ "$DRY_RUN" == "1" ]]; then echo "DRY: $*"; else "$@"; fi; }

command -v gh >/dev/null || { echo "error: gh CLI not found"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "error: not authenticated — run 'gh auth login'"; exit 1; }

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "Target repo: $REPO"
echo "Project start (week 1 Monday): $START_DATE"
echo

# --- Milestones -------------------------------------------------------------
# title | end-week | description
MILESTONES=(
  "Phase 0a — Scaffold & core schemas|2|Monorepo scaffold, CI, JSON Schema for L1 inventory types, lifecycle & bi-temporal versioning."
  "Phase 0b — Relationships & extension|4|Relationship schema, OCP extension proof, graph & loader ports, quality scoring framework."
  "Phase 1 — First vertical slice|7|Source -> intermediate JSONL -> loader -> graph -> queryable Domain Map view. OCP: 2nd connector + 2nd loader."
  "Phase 2 — Behaviour & Decisions|11|Behaviour inventories and Decision as a first-class concept; cross-layer linking; behaviour flow view."
  "Phase 3 — L2 vendor/project mapping + UI begins|14|Functional realisation layer, coverage & gap views. UI/backend workstream starts (shell, GraphQL, auth, explorer)."
  "Phase 4 — Impact assessment|18|Agent turning new documents into structured, provenance-backed impact reports via graph traversal & scoring."
  "Phase 5 — Quality & scale|22|Contradiction & correction agents, confidence-based auto-merge, continuous evals, staleness detection, health dashboard."
  "Phase 6 — Strategic alignment|26|Strategic overlay: value streams, stakeholder & value-impact maps, roadmaps, cross-subdomain coordination views."
)

echo "== Milestones =="
EXISTING_MS="$(gh api --paginate "repos/$REPO/milestones?state=all" -q '.[].title')"
for entry in "${MILESTONES[@]}"; do
  IFS='|' read -r title weeks desc <<< "$entry"
  due="$(date -u -d "$START_DATE +$((weeks * 7)) days" +%Y-%m-%dT23:59:59Z)"
  if grep -Fxq "$title" <<< "$EXISTING_MS"; then
    echo "  = exists: $title (due $due)"
  else
    echo "  + create: $title (due $due)"
    run gh api --method POST "repos/$REPO/milestones" \
      -f title="$title" -f state="open" -f description="$desc" -f due_on="$due" >/dev/null
  fi
done
echo

# --- Labels -----------------------------------------------------------------
# name | color(hex) | description
LABELS=(
  # area:* — layer / module (aligned to specs/README.md layers + monorepo modules)
  "area:core|1d76db|Schemas, ontology, relationships, graph & loader ports"
  "area:ingestion|0e8a16|Source connectors, normalization, enrichment/extraction"
  "area:query|5319e7|Query interface, view projection, retrieval"
  "area:quality|fbca04|Quality scoring, evals, verification gates"
  "area:agent|d93f0b|Reasoning/impact/contradiction/correction agents"
  "area:api|006b75|GraphQL/REST API layer, auth"
  "area:ui|c5def5|Knowledge Studio UI: shell, explorer, Q&A, admin"
  "area:platform|bfdadc|Event bus, orchestration, security/governance, observability"
  "area:strategic|e99695|L0 strategic overlay: value streams, roadmaps, stakeholder maps"
  "area:infra|c2e0c6|Repo tooling, CI/CD, build, dev environment"
  # type:*
  "type:feature|0e8a16|New capability or component"
  "type:spec|1d76db|Spec authoring / refinement (specs/)"
  "type:bug|d73a4a|Defect or regression"
  "type:docs|0075ca|Documentation only"
  "type:test|bfd4f2|Tests / golden datasets / evals (TDD)"
  "type:refactor|fef2c0|Internal change, no behaviour change"
  "type:chore|ededed|Maintenance, deps, housekeeping"
  # status:*
  "status:blocked|b60205|Blocked on a dependency or external factor"
  "status:in-progress|fbca04|Actively being worked on"
  "status:needs-review|d4c5f9|Awaiting review"
  "status:ready|0e8a16|Refined and ready to pick up"
  "needs-decision|e99695|Requires an architectural decision / ADR"
  # priority:*
  "priority:critical|b60205|Drop everything"
  "priority:high|d93f0b|Important, schedule soon"
  "priority:medium|fbca04|Normal priority"
  "priority:low|0e8a16|Nice to have"
)

echo "== Labels =="
for entry in "${LABELS[@]}"; do
  IFS='|' read -r name color desc <<< "$entry"
  echo "  ~ upsert: $name"
  run gh label create "$name" --color "$color" --description "$desc" --force >/dev/null
done
echo

echo "Done. Review at: https://github.com/$REPO/labels  and  /milestones"
