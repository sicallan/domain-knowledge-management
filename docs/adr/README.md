# Architecture Decision Records

This directory records significant architectural decisions for the Domain Knowledge
Management platform. Each ADR captures the context, the decision, and its consequences at
a point in time. ADRs are immutable once accepted — supersede rather than rewrite.

Format: `NNNN-short-title.md`. Status one of: *Proposed*, *Accepted*, *Accepted (direction)*,
*Superseded by NNNN*, *Deprecated*.

| ADR | Title | Status |
|-----|-------|--------|
| [0001](./0001-intermediate-jsonl-vs-okf-interchange.md) | Intermediate format (typed JSONL) vs OKF interchange | Accepted (direction) |
| [0002](./0002-vector-store-selection-deferred.md) | Vector store selection (deferred behind the loader port) | Proposed (deferred) |
| [0003](./0003-workflow-engine-deferred.md) | Workflow engine (deferred — in-process orchestration for Phase 2) | Proposed (deferred) |
| [0004](./0004-ui-framework.md) | UI framework for the Knowledge Studio (React) | Accepted |
| [0005](./0005-graph-visualisation-library.md) | Graph visualisation library (Cytoscape.js) | Accepted |
| [0006](./0006-graphql-server-framework.md) | GraphQL server framework (GraphQL Yoga + Pothos) | Accepted |
| [0007](./0007-component-library.md) | Component library / design system (shadcn/ui + Radix + Tailwind) | Accepted |
| [0008](./0008-projection-first-vs-synthesis.md) | Projection-first: derive views, materialise new knowledge only at three triggers | Accepted |
