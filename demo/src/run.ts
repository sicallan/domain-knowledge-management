import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { concatJsonl, GraphLoader } from "@dkm/loaders";
import { GraphQueryService } from "@dkm/query";
import type { QueryContext } from "@dkm/query";
import { createConnectorRegistry } from "@dkm/source-connectors";
import type { ConnectorRegistry, IngestionResult, SourceConfig } from "@dkm/source-connectors";
import { DefaultViewEngine, DomainMapProjector } from "@dkm/view-projection";
import type { DomainMapView } from "@dkm/view-projection";
import { collectContextDetail, formatDomainMapTree, renderDomainMap } from "./domain-map-exporter";
import {
  collectBehaviourSubgraph,
  renderBehaviourFlow,
  summariseBehaviour,
} from "./behaviour-flow-exporter";

/**
 * One-command Payments demo. It runs the **real** pipeline end to end:
 *
 *   sources → [connectors] → CanonicalDocuments → [extraction, captured] → intermediate JSONL
 *           → [GraphLoader] → graph → [Query Interface] → [View Projection Engine] → views
 *
 * Two source formats — Markdown docs and a structured JSON export — are ingested through the
 * **same connector registry** (filesystem + json), proving the Open-Closed boundary: a new
 * source format is one registration line, no pipeline edits. From the graph it then renders two
 * pictures: the **Phase 1 Domain Map** (static L1 structure, projected by the View Projection
 * Engine) and the **Phase 2 Behaviour & Decisions** flow (the orchestration flow its behaviour
 * pass extracts, plus the decisions its steps invoke with their full traceability — read back
 * through the Query Interface). Deterministic: extraction is pre-captured, so there is no live
 * LLM, no secret and no external service (PNG render is best-effort via the PlantUML image).
 */

const demoDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(demoDir);
const DOC_SOURCES = join(repoRoot, "evals", "payments-golden", "documents");
const JSON_SOURCES = join(demoDir, "sources");
const EXTRACTIONS = join(demoDir, "payments-extractions.jsonl");
const RELATIONSHIPS = join(demoDir, "payments-relationships.jsonl");
const PUML = "payments-domain-map.puml";
const PNG = "payments-domain-map.png";
const VIEW_JSON = "payments-domain-map.json";
const BEHAVIOUR_PUML = "payments-behaviour-flow.puml";
const BEHAVIOUR_PNG = "payments-behaviour-flow.png";

const CONTEXT: QueryContext = {
  userId: "demo",
  roles: ["reader"],
  scopes: ["*"],
  requestId: "demo-domain-map",
};

/** Count the records a structured CanonicalDocument carries (array export vs single object). */
function recordCount(structuredContent: object | undefined): number {
  if (Array.isArray(structuredContent)) return structuredContent.length;
  return structuredContent ? 1 : 0;
}

/** Ingest one source through the registry connector for its type; return the result. */
async function ingest(registry: ConnectorRegistry, config: SourceConfig): Promise<IngestionResult> {
  const connector = registry.getConnector(config.type);
  await connector.initialize(config);
  return connector.ingest();
}

async function main(): Promise<void> {
  // 1 — Ingestion. Two formats, one pipeline (the OCP boundary made visible).
  console.log("▶ Ingesting sources through the connector registry (two formats, one pipeline)…");
  const registry = createConnectorRegistry();
  console.log(`  registered connectors: ${registry.listConnectors().map((c) => c.type).join(", ")}`);

  const docs = await ingest(registry, {
    id: "payments-docs",
    type: "filesystem",
    connectionDetails: { rootPath: DOC_SOURCES },
    filters: [],
    sourceAuthority: "scheme",
  });
  if (docs.documents.length === 0) {
    throw new Error(`expected Payments Markdown sources under ${DOC_SOURCES}`);
  }

  const refData = await ingest(registry, {
    id: "payments-reference-data",
    type: "json",
    connectionDetails: { rootPath: JSON_SOURCES },
    filters: [],
    sourceAuthority: "operational",
  });
  const jsonDoc = refData.documents[0];

  console.log(`  filesystem · ${docs.documents.length} Markdown docs → CanonicalDocuments (contentType=markdown)`);
  console.log(
    `  json       · ${refData.documents.length} structured source → CanonicalDocuments ` +
      `(contentType=${jsonDoc?.contentType}, ${recordCount(jsonDoc?.structuredContent)} records)`,
  );
  console.log("  → a new source format is one registration line — the pipeline below is unchanged.");

  // 2 — Extraction (pre-captured) → intermediate JSONL → graph.
  console.log("▶ Extraction (captured deterministically — no LLM/secret) → JSONL → real GraphLoader…");
  const graph = new InMemoryGraphAdapter();
  const loader = new GraphLoader(graph);
  await loader.initialize({});
  const result = await loader.load(concatJsonl([EXTRACTIONS, RELATIONSHIPS]), "demo-payments");
  console.log(`  loaded ${result.loaded}, skipped ${result.skipped}, failed ${result.failed}`);
  if (result.failed > 0) {
    for (const error of result.errors) console.error(`  ✗ ${error.entryId}: ${error.error}`);
    throw new Error("demo load reported failures — fix the pre-baked JSONL");
  }

  // 3 — Projection through the real View Projection Engine.
  console.log("▶ Projecting the Domain Map through the View Projection Engine (@dkm/view-projection)…");
  const service = new GraphQueryService(graph);
  const engine = new DefaultViewEngine(service);
  engine.registerProjector(new DomainMapProjector(service));

  const viewResult = await engine.getView<DomainMapView>("domain-map", {}, CONTEXT);
  const view = viewResult.data;
  const contextCount = view.subdomains.reduce((sum, sub) => sum + sub.contexts.length, 0);
  console.log(
    `  ${view.subdomains.length} subdomains, ${contextCount} bounded contexts, ` +
      `${view.crossContextRelationships.length} cross-context relationships ` +
      `(computed ${viewResult.metadata.computedAt}, ${viewResult.metadata.entriesIncluded} entries, ` +
      `cacheHit=${viewResult.metadata.cacheHit})`,
  );

  // 4 — The UI-ready structure: print it, and write it for stakeholders to inspect.
  console.log("▶ Domain Map (UI-ready DomainMapView the product consumes):");
  console.log(formatDomainMapTree(view));
  writeFileSync(join(demoDir, VIEW_JSON), `${JSON.stringify(view, null, 2)}\n`, "utf8");
  console.log(`▶ Wrote demo/${VIEW_JSON}`);

  // 5 — The picture: decisions-first PlantUML, grouped by subdomain → bounded context.
  console.log("▶ Rendering the projected view as a decisions-first PlantUML domain map…");
  const detail = await collectContextDetail(service, view);
  const puml = renderDomainMap(view, detail);
  writeFileSync(join(demoDir, PUML), `${puml}\n`, "utf8");
  console.log(`▶ Wrote demo/${PUML}`);

  renderPng(PUML, PNG);

  // 6 — Phase 2: the behaviour + decision layer, read back through the same Query Interface.
  console.log("▶ Phase 2 — Behaviour & Decisions (behaviour pass 2.2 + decision pass 2.3):");
  const behaviour = await collectBehaviourSubgraph(service);
  if (behaviour) {
    console.log(`  ${summariseBehaviour(behaviour)}`);
    writeFileSync(join(demoDir, BEHAVIOUR_PUML), `${renderBehaviourFlow(behaviour)}\n`, "utf8");
    console.log(
      `▶ Wrote demo/${BEHAVIOUR_PUML} (the Card Authorisation flow + its decisions' traceability)`,
    );
    renderPng(BEHAVIOUR_PUML, BEHAVIOUR_PNG);
  } else {
    console.log("  (no orchestration flows in the graph — nothing to render)");
  }

  console.log("✓ Demo complete.");
}

/** Best-effort PlantUML → PNG render via the public plantuml Docker image (skips if unavailable). */
function renderPng(puml: string, png: string): void {
  try {
    execFileSync(
      "docker",
      ["run", "--rm", "-v", `${demoDir}:/work`, "-w", "/work", "plantuml/plantuml", "-tpng", puml],
      { stdio: "inherit" },
    );
    console.log(`▶ Rendered demo/${png}`);
  } catch {
    console.log(
      `ℹ Skipped PNG render (Docker / plantuml image unavailable). ` +
        `Render demo/${puml} at https://www.plantuml.com/plantuml or with the plantuml CLI.`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
