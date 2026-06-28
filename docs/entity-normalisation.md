# Entity normalisation (the `normalise` pass)

How the LLM-adjudicated entity-resolution pass merges duplicate concepts in an extracted
knowledge graph — what it does, how it decides, and how to run and tune it.

> **TL;DR.** Extraction runs per-document, so the same concept named slightly differently
> across documents (*Conflict of Interest* / *Conflicts of Interest*) becomes several
> near-duplicate nodes. `normalise` clusters look-alike names cheaply, asks the LLM which
> clusters are *genuinely the same concept*, merges the confirmed synonyms, and remaps every
> relationship onto the survivor — editing `data/<domain>/*.jsonl` in place with a full backup
> and an audit report.

- **Run it:** [QUICKSTART → Normalise duplicate concepts](../QUICKSTART.md#normalise-duplicate-concepts-optional)
- **Spec:** [specs/005 — enrichment extraction pipeline](../specs/005-enrichment-extraction-pipeline.md), Decision 2 (entity-resolution cascade)
- **Code:** [llm_resolution.py](../modules/enrichment/src/dkm_enrichment/llm_resolution.py),
  [entity_resolution.py](../modules/enrichment/src/dkm_enrichment/entity_resolution.py),
  [cli.py](../modules/enrichment/src/dkm_enrichment/cli.py)

## Why it's needed

Extraction is per-document by design (each source contributes evidence independently). The cost
is that one real-world concept surfaces as multiple nodes when documents name it differently:

| In document A | In document B | Should be |
|---|---|---|
| `Proxy Voting Guidelines` | `WBIM Proxy Voting Guidelines` | one concept |
| `Conflict of Interest` | `Conflicts of Interest` | one concept |
| `Scope 1 Emissions` | `Scope 2 Emissions` | **two** concepts (don't merge!) |
| `Voting Policy` | `Voting Guidelines` | **two** concepts (a policy ≠ its guidelines) |

The hard part is the bottom two rows: the names are *similar* but the concepts are *distinct*.
Blind string-distance merging would collapse them and corrupt the graph. That precision problem
is exactly why the deciding tier is an LLM rather than a similarity threshold.

## Where it sits in the pipeline

Normalisation is **the second, opt-in tier of a resolution cascade** (spec 005, Decision 2 —
"name+type → embedding → LLM for ambiguous", cheap stages first):

```
dkm process <docs>          dkm normalise <domain>         docker compose up
        │                            │                            │
   connectors                   ┌────┴─────────────┐          gateway serves
   → extract  ──────────────►   │ Tier 1 (built-in)│          data/<domain>/
        │                       │ exact name+type  │ ◄──runs during extract
        ▼                       │ dedup            │
  extractions.jsonl            └────┬─────────────┘
  relationships.jsonl               │
                              ┌──────┴──────────────────────┐
                              │ Tier 2 (this pass)           │
                              │  block → adjudicate → merge  │
                              └──────────────────────────────┘
```

- **Tier 1 — exact (always on).** During extraction,
  [`resolve_entities`](../modules/enrichment/src/dkm_enrichment/entity_resolution.py) merges
  entities that share a type *and* a normalised name (lowercased, punctuation-stripped,
  whitespace-collapsed). Cheap and deterministic, but it only catches *identical* names — which
  on real cross-document extractions is almost nothing.
- **Tier 2 — LLM-adjudicated (this pass).** Closes the gap for *semantic* duplicates without the
  false merges of string similarity. This is what `dkm normalise` runs.
- **Future tier — embedding similarity** could slot in between the two as a further cascade stage
  (an [OCP extension point](../modules/enrichment/README.md#ocp-extension-points)); nothing else
  changes.

## How the LLM tier works

Three stages — only the middle one calls the model, and most entities never reach it.

### 1. Blocking (deterministic, cheap)

[`candidate_blocks`](../modules/enrichment/src/dkm_enrichment/llm_resolution.py) groups
same-type entities into small candidate clusters so the LLM only ever compares plausibly-related
names. For each entity name:

1. **Salient tokens.** Normalise the name, drop stopwords (`the`, `of`, `for`, …) and tokens
   shorter than 3 chars, and lightly singularise (`Guidelines` → `guideline`). What's left is the
   name's salient token set.
2. **Pairwise similarity.** Two names are *linked* only when their salient token sets overlap by
   **Jaccard ≥ `--min-similarity`** (default `0.67`). Crucially, a single shared common word
   (`Fund`, `Policy`, `Framework`) is **not** enough to bridge two names — otherwise everything
   with "Policy" in it would collapse into one giant cluster.
3. **Components.** A union-find groups linked names into connected components. Components of 2+
   become candidate clusters; **singletons skip the LLM entirely**. Entities of different types
   are never linked. Oversized clusters are split into ≤40-name chunks to bound each prompt (a
   trailing singleton is folded back so it can't escape adjudication).

The result: a handful of tight clusters of look-alike names, each within a single entity type.

### 2. Adjudication (one LLM call per cluster)

[`resolve_with_llm`](../modules/enrichment/src/dkm_enrichment/llm_resolution.py) sends each
cluster to the model through the provider-agnostic
[`LLMGateway`](../modules/enrichment/src/dkm_enrichment/gateway/base.py) port, using
**structured output** (the
[`EntityResolutionResult` schema](../modules/enrichment/src/dkm_enrichment/resolution_schemas.py)):

- The prompt is **precision-first**: *"Group ONLY the names that refer to the SAME concept… When
  unsure, do NOT merge."* It explicitly calls out the traps (Scope 1 ≠ Scope 2; a Policy ≠ its
  Guidelines; a concept ≠ the system implementing it).
- The model returns `groups`, each a `{ canonical, members[] }` of two-or-more names it judges to
  be the same concept. Names with no duplicate are simply omitted.
- Members are mapped back to entity ids; groups that resolve to fewer than two real ids are
  dropped.

Because the model only sees a small, same-type cluster of already-similar names, the judgement it
has to make is narrow and cheap — and distinct-but-similar names stay apart.

### 3. Merge & remap

Confirmed groups feed the shared merge machinery in
[`entity_resolution.py`](../modules/enrichment/src/dkm_enrichment/entity_resolution.py) — the same
code Tier 1 uses, so behaviour is consistent:

- **Survivor** = the member matching the canonical name (else the highest-confidence member).
- The canonical name becomes the survivor's `name`; **every other member's name is preserved as an
  `alias`** — nothing is lost.
- **Evidence is unioned** (`evidencedBy` provenance is combined) and the **highest confidence**
  across the group is kept.
- An **`id_remap`** (loser id → survivor id) is produced.
- [`dedupe_relationships`](../modules/enrichment/src/dkm_enrichment/entity_resolution.py) then
  rewrites every relationship's endpoints through the remap, **drops self-loops** a merge may have
  created, and **collapses now-identical edges** (same type + endpoints), unioning their evidence.

## Running it

```bash
# via the quickstart wrapper (runs in the processor Docker image)
./scripts/dkm normalise lending                 # LLM-adjudicated — needs ANTHROPIC_API_KEY
./scripts/dkm normalise lending --fake          # exercise the wiring with no key (merges nothing)

# or directly against a data dir
python -m dkm_enrichment normalise data/lending [--fake] [--model …] [--min-similarity 0.67]
```

| Flag | Default | Meaning |
|---|---|---|
| `--fake` | off | Use the deterministic `FakeGateway` — no key, no network. Proves the wiring end-to-end but merges nothing; used by CI and plumbing checks. |
| `--model` | `claude-sonnet-4-6` | Model used for adjudication. |
| `--min-similarity` | `0.67` | Jaccard token-set threshold for treating two names as merge *candidates*. Lower = more aggressive clustering (more pairs reach the LLM); higher = stricter. This only controls **which names are compared**, never whether they merge — the LLM always makes the final call. |

The pass needs an existing `data/<domain>/extractions.jsonl` (run `extract` / `dkm process`
first). Re-running is safe and idempotent-ish: already-merged graphs simply yield fewer
candidates.

## Outputs & safety

`normalise` edits the gateway-watched files **in place**, but never destructively:

- `data/<domain>/extractions.jsonl` and `relationships.jsonl` — rewritten with merges applied.
- `data/<domain>/pre-normalisation/` — the **originals are copied here first**, so you can always
  diff or roll back.
- `data/<domain>/normalisation-report.json` — a human-readable audit of exactly what merged:

  ```json
  {
    "entitiesMerged": 12,
    "entitiesAfter": 188,
    "relationshipsBefore": 240,
    "relationshipsAfter": 231,
    "merges": [
      { "canonical": "Proxy Voting Guidelines",
        "mergedFrom": ["Proxy Voting Guidelines", "WBIM Proxy Voting Guidelines"] }
    ]
  }
  ```

The CLI also reports counts on stdout, and — if the LLM step fails (no credits, rate limit,
network) — exits cleanly with your graph **untouched**, pointing you at `--fake` to test the
wiring without a key.

## Design notes

- **Precision over recall.** The whole design biases against false merges: blocking needs strong
  token overlap, the prompt says "when unsure, don't merge", and the deterministic tier only ever
  merges exact matches. A missed duplicate is recoverable (re-run, lower the threshold); a wrong
  merge corrupts the graph.
- **Everything goes through the `LLMGateway` port**, so the deterministic `FakeGateway` exercises
  the full pass in CI with no key or network — the CI gate stays green without secrets.
- **The cascade is open for extension** (OCP): a new tier (e.g. embedding similarity) is a new
  stage, not a modification of the existing ones. See the enrichment module's
  [OCP extension points](../modules/enrichment/README.md#ocp-extension-points).
