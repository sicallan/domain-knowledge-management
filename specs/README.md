# Technical Specifications

This directory contains per-component technical specifications for the Domain Knowledge Management platform. Each spec is written from the perspective of a principal engineer articulating the design to their team.

## Spec Structure

Each specification follows a consistent format:

1. **Purpose & Scope** — What the component does and its boundaries
2. **Inputs** — What the component receives (data, events, configuration)
3. **Outputs** — What the component produces (data, events, side effects)
4. **Behaviour** — How it processes inputs into outputs, including edge cases
5. **Interfaces & Contracts** — API surface, types, protocols
6. **Dependencies** — What it depends on and what depends on it
7. **Key Decisions** — Design choices requiring agreement, with pros/cons/recommendation

## Component Map

| Spec | Phase | Layer | Description |
|------|-------|-------|-------------|
| [Schema Module](./001-schema-module.md) | 0a | Core | JSON Schema definitions for all inventory types |
| [Graph Persistence Port](./002-graph-persistence-port.md) | 0b | Core | Abstract interface for graph storage with event log |
| [Intermediate JSONL & Loaders](./003-intermediate-jsonl-and-loaders.md) | 0b–1 | Core | Canonical extraction output format and pluggable loader architecture |
| [Source Connector Framework](./004-source-connector-framework.md) | 1 | Ingestion | Plugin-based source document ingestion |
| [Enrichment & Extraction Pipeline](./005-enrichment-extraction-pipeline.md) | 1–2 | Ingestion | LLM-based knowledge extraction from source documents |
| [Query Interface](./006-query-interface.md) | 1 | Query | API for retrieving inventory items and traversing relationships |
| [View Projection Engine](./007-view-projection-engine.md) | 1–3 | Query | Materialises typed views from graph data |
| [Quality Scoring Framework](./008-quality-scoring-framework.md) | 0b–5 | Quality | Composite quality measurement and scoring |
| [Impact Assessment Agent](./009-impact-assessment-agent.md) | 4 | Agent | Graph traversal for change impact analysis |
| [Contradiction Detection Agent](./010-contradiction-detection-agent.md) | 5 | Agent | Detects conflicting facts across sources |
| [GraphQL API Layer](./011-graphql-api-layer.md) | 3 | API | Backend service layer between stores and UI |
| [Authentication & Authorisation](./012-authentication-authorisation.md) | 3 | API | OIDC/RBAC identity and access control |
| [UI Application Shell](./013-ui-application-shell.md) | 3 | UI | Navigation, search, context panel, notifications |
| [Knowledge Explorer](./014-knowledge-explorer.md) | 3 | UI | Interactive graph canvas and list browsing |
| [Question Answering Pipeline](./015-question-answering-pipeline.md) | 4 | Query/UI | Natural-language question → structured answer |
| [Administration Console](./016-administration-console.md) | 5 | UI | Source management, quality, corrections, governance |

## How to Use These Specs

1. **Before implementation**: Review the spec, confirm key decisions with the team, resolve any open questions
2. **During implementation**: Use the spec as a reference for expected behaviour, inputs/outputs, and contracts
3. **After implementation**: Update the spec if implementation revealed necessary deviations (with rationale)

## Relationship to Plan

These specs decompose the [main implementation plan](../plan.md) into buildable units. The plan defines *what* and *when*; these specs define *how* at the component level, with enough detail to write tests and implement confidently.
