# ADR-0001 — Intermediate format (typed JSONL, internal) vs interchange format (OKF, edges)

- **Status**: Accepted (direction)
- **Date**: 2026-06-14
- **Deciders**: Platform architecture
- **Related**: [specs/003 — Intermediate JSONL & Loaders](../../specs/003-intermediate-jsonl-and-loaders.md), [specs/004 — Source Connectors](../../specs/004-source-connector-framework.md), [specs/005 — Enrichment Pipeline](../../specs/005-enrichment-extraction-pipeline.md), [specs/007 — View Projection Engine](../../specs/007-view-projection-engine.md), README Decision Log (D1, D7)

## Context

Google Cloud's **Open Knowledge Format (OKF)** ([spec](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md), [readme](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/README.md)) is an emerging standard for representing knowledge as a directory of **Markdown files with YAML frontmatter** ("Knowledge Bundles" of "Concepts"). It is explicitly human- and agent-friendly, git-distributable, and read natively by common tools (Obsidian, Notion, MkDocs) and LLMs. It defines a producer/consumer model: an *enrichment agent* writes OKF; a *consumption agent* reads it.

We already committed (D1) to an internal **intermediate JSONL** format ([spec 003](../../specs/003-intermediate-jsonl-and-loaders.md)) as the "extract once, load many" integration boundary between extraction and the graph/vector/relational loaders. The question: does OKF replace, change, or complement that decision?

## Decision

**Keep typed JSONL as the internal extraction→loader backbone, unchanged. Adopt OKF at the edges** — as an ingestion *source* type and a publication/interchange *output* (view projection) — via a DKM-defined OKF **profile** that preserves our typing for lossless round-trip.

OKF is **not** adopted as a replacement for the intermediate format.

## Rationale

OKF and our JSONL are optimised for opposite jobs. OKF is a *human/agent publication & interchange* format; our JSONL is a *deterministic machine integration boundary*.

| Dimension | OKF | Intermediate JSONL (spec 003) | Why it matters |
|---|---|---|---|
| **Relationships** | Markdown links; kind conveyed by **prose, untyped**. Visualizer colours nodes by type but edges are untyped cross-links. | First-class **typed** edges (`relationshipType`, `sourceEntityId`→`targetEntityId`) with cardinality constraints | Typed traversal underpins impact assessment, contradiction detection, and our whole graph value. Untyped edges cannot drive that. **Dealbreaker for the core path.** |
| **Schema** | No registry; consumers "tolerate unknown types" | JSON Schema validated; additive/OCP; closed `InventoryType` enum | Quality gates and contract tests require strictness. |
| **Provenance** | `timestamp` + free-text `# Citations` | Per-fact `SourceProvenance` (file, location, fetchedAt, `sourceAuthority`) + `confidence` 0–1 | Confidence-based auto-merge and the evidence layer need fact-grained provenance OKF does not carry. |
| **Grain** | Concept = one Markdown **document** | Entry = one typed **assertion** (many per document) | Different units; OKF is coarser. |
| **Maturity** | v0.1, explicit proof-of-concept, GCP/Gemini-coupled reference impl, no governance body / registry / roadmap | Our own stable contract | Safe to bet on at adapters; not as the schema backbone. |

So replacing JSONL with OKF would be a downgrade for the extraction→loader path. But OKF's producer/consumer model maps cleanly onto our pipeline edges, and the format is genuinely useful there.

## Where OKF fits (additive, OCP-clean)

```
OKF bundle (source) ─┐
docs / logs / APM ───┼─► connectors ─► normalization ─► extraction ─► JSONL (typed, validated) ─► loaders ─► graph / vector / pg
                     ┘    (OKF = a source type)                          [internal backbone]              │
                                                                                                  view projection
                                                                                          OKF exporter ─► Knowledge Bundle
                                                                                       (publish · agent-consume · builder hand-off)
```

1. **Output / view projection** ([spec 007](../../specs/007-view-projection-engine.md)) — an OKF Knowledge Bundle is a new projection target consuming the graph (RAG-friendly markdown, human browsing, cross-org exchange, builder-agent hand-off). Consistent with "extract once, load many".
2. **Ingestion source** ([spec 004](../../specs/004-source-connector-framework.md)) — ingest OKF bundles as a source type. Reinforced by OKF naming Dataplex / Unity Catalog / Collibra exports as producers.
3. **Canonical narrative/evidence layer** — OKF frontmatter conventions (`type`, `resource`, `timestamp`, `# Citations`) standardise our canonical-markdown lake / `EvidenceArtifact` storage.

### The OKF profile (lossless round-trip)

OKF permits arbitrary extra frontmatter keys ("Producers MAY include any additional keys; Consumers SHOULD preserve unknown keys"). We exploit this with a **DKM OKF profile** adding a typed `relationships:` block plus `sourceAuthority` and `confidence`:
- **Lossless** for DKM↔DKM exchange (our typing survives).
- **Lossy-but-valid** plain OKF for the wider ecosystem (relationships degrade to markdown links).

Mapping: OKF `Concept` ↔ a projected inventory entry · OKF `type` ↔ `InventoryType` · `resource` ↔ entry id/URI · `# Citations` ↔ `evidencedBy`/provenance · bundle ↔ a published view scope (bounded context, domain map).

## Consequences

**Positive**
- No change to the proven internal format; no rework of spec 003.
- Standards-based interop at both ends; potential free consumption surface (OKF's `visualize` graph viewer) ahead of our own Knowledge Explorer.
- Reuses existing markdown tooling for human browsing/evidence.

**Negative / risks**
- OKF is v0.1 and unstable; we mitigate by binding it only at adapters (low regret), never the schema backbone.
- Plain-OKF export is lossy on relationship typing; mitigated by the profile for DKM↔DKM exchange and accepted for generic exchange.
- Two representations of "the same" knowledge (typed graph vs OKF bundle) must be kept consistent; the OKF bundle is always a *projection of* the graph, never an independent source of truth (except when ingested as an external source, where it re-enters via extraction).

## Scope bound now vs deferred

**Bound now (low-regret, additive):**
- This ADR (status *Accepted — direction*).
- Clarifying note in spec 003; *proposed* notes in specs 004 and 007; README D7 + canonical-formats update.

**Deferred (pending OKF trajectory):**
- A full `spec 017 — OKF Import/Export Adapter` defining the profile, type mapping, and lossy/lossless modes. Tracked as a `needs-decision` backlog item, not committed work, until OKF stabilises.

## Open questions

1. Versioning alignment: how does `okf_version` relate to our schema semver when ingesting/exporting?
2. Identity: reconcile OKF concept IDs (file path) with our UUIDs/URIs on round-trip.
3. Do we publish per-bounded-context bundles, per-view bundles, or both?
