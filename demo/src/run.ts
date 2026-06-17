import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { concatJsonl, GraphLoader } from "@dkm/loaders";
import { GraphQueryService } from "@dkm/query";
import type { QueryContext } from "@dkm/query";
import { DefaultViewEngine, DomainMapProjector } from "@dkm/view-projection";
import type { DomainMapView } from "@dkm/view-projection";
import { collectContextDetail, renderDomainMap } from "./domain-map-exporter";

/**
 * One-command Payments demo (the visible end of the Phase 1 slice): pre-baked
 * intermediate JSONL — exactly what the LLM extraction step emits from the source docs —
 * is loaded through the **real** GraphLoader into the graph, queried through the **real**
 * Query Interface, projected by the **real** View Projection Engine (`getView('domain-map')`),
 * and the resulting DomainMapView rendered as a decisions-first PlantUML domain map.
 * Deterministic: no live LLM, no secrets, no external services (PNG render is best-effort).
 */

const demoDir = dirname(dirname(fileURLToPath(import.meta.url)));
const EXTRACTIONS = join(demoDir, "payments-extractions.jsonl");
const RELATIONSHIPS = join(demoDir, "payments-relationships.jsonl");
const PUML = "payments-domain-map.puml";
const PNG = "payments-domain-map.png";

const CONTEXT: QueryContext = {
  userId: "demo",
  roles: ["reader"],
  scopes: ["*"],
  requestId: "demo-domain-map",
};

async function main(): Promise<void> {
  console.log("▶ Loading pre-baked Payments extractions through the real GraphLoader…");
  const graph = new InMemoryGraphAdapter();
  const loader = new GraphLoader(graph);
  await loader.initialize({});
  const result = await loader.load(concatJsonl([EXTRACTIONS, RELATIONSHIPS]), "demo-payments");
  console.log(`  loaded ${result.loaded}, skipped ${result.skipped}, failed ${result.failed}`);
  if (result.failed > 0) {
    for (const error of result.errors) console.error(`  ✗ ${error.entryId}: ${error.error}`);
    throw new Error("demo load reported failures — fix the pre-baked JSONL");
  }

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

  console.log("▶ Rendering the projected view as a decisions-first PlantUML domain map…");
  const detail = await collectContextDetail(service, view);
  const puml = renderDomainMap(view, detail);
  writeFileSync(join(demoDir, PUML), `${puml}\n`, "utf8");
  console.log(`▶ Wrote demo/${PUML}`);

  try {
    execFileSync(
      "docker",
      ["run", "--rm", "-v", `${demoDir}:/work`, "-w", "/work", "plantuml/plantuml", "-tpng", PUML],
      { stdio: "inherit" },
    );
    console.log(`▶ Rendered demo/${PNG}`);
  } catch {
    console.log(
      `ℹ Skipped PNG render (Docker / plantuml image unavailable). ` +
        `Render demo/${PUML} at https://www.plantuml.com/plantuml or with the plantuml CLI.`,
    );
  }

  console.log("✓ Demo complete.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
