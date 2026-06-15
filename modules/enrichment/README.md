# @dkm/enrichment — LLM Extraction Pipeline (Python)

The cognitive core of the Phase 1 vertical slice and the **single Python component**
([D-P1.3](../../docs/phase-1/decisions.md)). It takes `CanonicalDocument[]` (emitted by the
TypeScript source connectors, Feature 01) and produces schema-valid **intermediate JSONL**:

- `{runId}-extractions.jsonl` — typed inventory entries
- `{runId}-relationships.jsonl` — typed relationships referencing entity ids
- `{runId}-metadata.json` — run model, config, stats

It hands off to the TypeScript loader (Feature 03) **purely via files** — no in-process coupling.

See [specs/005-enrichment-extraction-pipeline.md](../../specs/005-enrichment-extraction-pipeline.md)
and [specs/003-intermediate-jsonl-and-loaders.md](../../specs/003-intermediate-jsonl-and-loaders.md)
and the feature doc [docs/features/phase-1/02-llm-extraction-pipeline.md](../../docs/features/phase-1/02-llm-extraction-pipeline.md).

## Architecture (spec 005 §Pipeline Stages)

```
CanonicalDocument[]
  → pre-process / chunk (section-based with size limit)
  → entity extraction        (LLMGateway, structured output)
  → relationship extraction   (LLMGateway, structured output)
  → entity resolution         (conservative name+type only)
  → confidence scoring
  → confidence gate           (below threshold → excluded + counted)
  → schema-validation gate    (invalid → excluded + counted; validates against /schemas)
  → streaming JSONL emission  (immutable; entities + relationships + metadata)
```

All model access goes through a thin, provider-agnostic **`LLMGateway`** port
([D-P1.1](../../docs/phase-1/decisions.md)) — the only Claude-aware code in the system. Default
model `claude-sonnet-4-6`; low-confidence items escalate to `claude-opus-4-8` on re-run.

## Install & test

```bash
cd modules/enrichment
python3 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"

ruff check .
mypy
pytest                     # deterministic suite — no network, the CI gate
```

The deterministic suite uses a **`FakeGateway`** (no network) and is the CI gate.

## Opt-in real-Claude golden eval (never a CI gate)

The golden-dataset eval (`evals/payments-golden/`) runs the real pipeline against Claude and
asserts the [D-P1.5](../../docs/phase-1/decisions.md) precision/recall/F1 floors. It is marked
`@pytest.mark.llm` and **auto-skips** when `ANTHROPIC_API_KEY` is absent, so CI (which has no
secrets and no network) stays green.

```bash
pip install -e ".[dev,llm]"      # adds the Anthropic SDK
export ANTHROPIC_API_KEY=sk-...  # never commit a key
pytest -m llm                    # runs the real golden eval
```

## OCP extension points

- **New inventory type** → add a JSON Schema under `/schemas` + a prompt template under
  `src/dkm_enrichment/prompts/templates/`. No pipeline-core change.
- **New provider/model** → a new `LLMGateway` implementation behind the same port.
- **New entity-resolution tier** (embedding, LLM) → a new cascade stage.

Closed for modification: the JSONL fixed-core contract, the `ExtractionPipeline` / `LLMGateway`
signatures, and the entity/relationship file split.
