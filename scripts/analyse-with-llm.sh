#!/usr/bin/env bash
# analyse-with-llm.sh — assemble a self-contained prompt over a processed domain's intermediate
# JSONL, so you can analyse the knowledge graph with your own LLM.
#
#   ./scripts/analyse-with-llm.sh <domain> [question...]    # prints a prompt to stdout
#   ./scripts/analyse-with-llm.sh lending "Where are the gaps?" | claude -p
#
# Plain text in, plain text out — pipe it to any LLM CLI, or redirect to a file and paste it
# into a chat. Nothing here is Claude-specific.
set -euo pipefail

domain="${1:-}"
[ -n "$domain" ] || { echo "usage: ./scripts/analyse-with-llm.sh <domain> [question]" >&2; exit 1; }
shift
question="${*:-Summarise this knowledge graph: the main areas, the key decisions, and any gaps, risks or contradictions.}"

data_dir="${DKM_DATA_DIR:-data}/${domain}"
entries="${data_dir}/extractions.jsonl"
relationships="${data_dir}/relationships.jsonl"

if [ ! -f "$entries" ]; then
  echo "✗ no extractions at ${entries}" >&2
  echo "  run: ./scripts/dkm process <docs-dir> --domain ${domain}" >&2
  exit 1
fi

cat <<EOF
You are a domain analyst. Below is a knowledge graph extracted from a set of source documents,
as two JSONL files: typed inventory entries (the assertions) and relationships (typed edges
between them). Each entry has a type, a confidence (0-1), a lifecycle status, and provenance
(evidencedBy). Decisions are the highest-value nodes — where regulation and business logic concentrate.

Answer the QUESTION below using ONLY the graph that follows. Cite entry ids/names and their
evidence where relevant, and explicitly flag anything unsupported, low-confidence, or contradictory.

QUESTION:
${question}

=== ENTRIES (extractions.jsonl) ===
$(cat "$entries")

=== RELATIONSHIPS (relationships.jsonl) ===
$([ -f "$relationships" ] && cat "$relationships" || echo "(none)")
EOF
