# Feature 06 — JSON Source Connector (OCP validation: second connector)

## 1. Feature

- **Name**: JSON ingestion connector — second connector proving the ingestion OCP boundary
- **Plan step**: 1.x **OCP validation** — *"add a second connector (e.g., JSON ingestion) — must work
  without modifying core pipeline code, only adding a new adapter."*
- **Spec(s) expanded**: [specs/004-source-connector-framework.md](../../../specs/004-source-connector-framework.md)
  (a second `SourceConnector` implementation; `structuredContent` path of `CanonicalDocument`).

## 2. Summary & scope

This feature exists **to prove the Open-Closed Principle** for ingestion. It adds a `json` connector
that ingests structured JSON sources (e.g. a decision-log export, a CSV-as-JSON inventory) and emits
`CanonicalDocument`s with `contentType: 'structured'` and a populated `structuredContent`. The
acceptance bar is not just "it works" but "**it was added with zero edits** to Feature 01's connector,
the `SourceConnector` port, the registry internals, or the extraction pipeline."

**In scope**
- `json` connector implementing the **unchanged** `SourceConnector` port (spec 004).
- Structured-content canonicalisation: JSON object/array → `CanonicalDocument.structuredContent`,
  with `contentType: 'structured'` (spec 004 Decision 2).
- Registration via a **one-line addition** to `registerConnectors()` (spec 004 Decision 4).
- Document-level incremental ingestion (content hash) reusing Feature 01's state model.
- Passing the **same connector contract suite** Feature 01 defined — unmodified.

**Out of scope**
- Generic REST `api-json` connector (Phase 3, spec connector table) — this is a **file-based** JSON
  source connector for the OCP demo.
- Any change to extraction prompts/logic to "support JSON" — the extraction pipeline already handles
  `contentType: 'structured'` (Feature 02); if it needs a change, that is a finding, not a task here.

## 3. Dependencies

- **Upstream**: Feature 01 (the port, registry, contract suite, `CanonicalDocument` — all reused
  unchanged); Feature 02 consumes the structured documents downstream.
- **Unblocks**: the Phase 1 **OCP validation gate** for ingestion (CLAUDE.md principle 2: "each phase
  has an explicit OCP validation step — honour it").

## 4. Applied decisions

| decisions.md entry | How it constrains this feature |
|---|---|
| **OCP validation targets — second connector: JSON ingestion adapter** | This *is* that target. Added without modifying the core pipeline. |
| **D-P1.3 — language split** | TypeScript (connector). |
| **D-P1.4 — flesh out, don't build** | Definition only. |

## 5. User stories

- *As a knowledge engineer, I want to ingest a JSON decision-log export, so that structured sources
  enter the same pipeline as Markdown.*
- *As an architect, I want adding a new source type to require only a new adapter + one registration
  line, so that the OCP claim is demonstrably true.*

## 6. Acceptance criteria (Given/When/Then)

1. **Contract reuse** — *Given* the **unmodified** `source-connector.contract.test.ts` from Feature
   01, *when* run against the `json` connector, *then* it passes.
2. **Structured output** — *Given* a JSON file of records, *when* ingested, *then* each yields a
   `CanonicalDocument` with `contentType: 'structured'` and `structuredContent` equal to the parsed
   object/array; provenance (`sourcePath`, hash `sourceVersion`, `sourceAuthority`) is set.
3. **Zero core edits (the OCP gate)** — *Given* the diff that adds this feature, *when* reviewed,
   *then* it touches only: the new `json` connector file(s), its tests, and **one line** in
   `registerConnectors()`. Feature 01's connector, the port, and the registry are untouched.
4. **Existing tests green** — *Given* the full pre-existing test suite, *when* this feature is added,
   *then* every prior test still passes unchanged (CLAUDE.md OCP: "existing tests still pass").
5. **Registry** — *Given* the bootstrap, *when* `getConnector('json')` is called, *then* the connector
   is returned and `listConnectors()` now includes both `filesystem` and `json`.
6. **Incremental** — *Given* an unchanged JSON source, *when* re-ingested with prior state, *then* it
   is skipped (reusing Feature 01's hashing model with no change to that model).
7. **Downstream compatibility** — *Given* a structured `CanonicalDocument`, *when* passed to the
   extraction pipeline, *then* it is processed via the `structured` content path with no pipeline edit.

## 7. Interface contracts

No new interfaces. Implements spec 004 `SourceConnector` exactly:

```typescript
const jsonConnector: SourceConnector = {
  type: "json",
  supportedFormats: ["json"],
  // initialize / healthCheck / ingest / discover — same signatures as filesystem
};
```

Uses `CanonicalDocument.structuredContent` + `contentType: 'structured'` (spec 004 §Canonical
Document). Registration: one added line in `registerConnectors()`.

## 8. TDD test plan (write these first)

- **Contract — reuse `source-connector.contract.test.ts` unchanged** against the `json` connector.
  Reuse without edit is the primary OCP evidence.
- **Unit — `json-connector.test.ts`**: object vs array sources; `structuredContent` fidelity;
  provenance + deterministic id; malformed-JSON skip-and-continue; incremental skip.
- **OCP guard — `ingestion-ocp.test.ts`** (or a CI diff check): asserts the registry/port/Feature-01
  connector files are unchanged relative to their Feature 01 state (e.g. a snapshot or import-graph
  assertion that the new connector imports the port but the port doesn't import it).
- **Integration — `json-connector.int.test.ts`**: a `fixtures/decision-log.json` → `CanonicalDocument[]`
  → through extraction's structured path.

## 9. Task breakdown

1. [ ] Confirm the `SourceConnector` port + contract suite from Feature 01 are stable (no edits needed).
2. [ ] Write `json-connector` unit tests + OCP guard test (failing).
3. [ ] Implement the `json` connector (parse, canonicalise to `structuredContent`, provenance, incremental).
4. [ ] Add the one-line registration in `registerConnectors()`.
5. [ ] Run the **unmodified** connector contract suite against it.
6. [ ] Run the full prior suite to confirm nothing else changed.
7. [ ] Integration test through extraction's structured path.

## 10. OCP extension points

- **Open**: this feature *is* the open extension — a new connector with no core change.
- **Closed**: the `SourceConnector` port, the registry internals, Feature 01's connector, and the
  extraction pipeline. If any must change to land this, that change is a **spec deviation to record**
  (CLAUDE.md "if implementation forces a deviation, update the spec with rationale") — and a sign the
  port abstraction needs hardening.

## 11. Open questions / risks

- **Risk**: discovering that the `structured` content path in extraction (Feature 02) is incomplete —
  if so, the OCP demo surfaces a real gap; record it and decide whether it is a Feature 02 fix or a
  deliberate Phase 1 limitation.
- Spec Open Q3 (large-file handling) — large JSON arrays: confirm whether the connector streams records
  or loads whole-file for the pilot.
- CSV: spec mentions CSV under structured sources; Phase 1 scopes JSON only — CSV deferred.
