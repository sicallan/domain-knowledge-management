import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { concatJsonl, GraphLoader } from "@dkm/loaders";
import { GraphQueryService } from "@dkm/query";
import { buildDomainMapModel, renderPlantUml } from "./domain-map-exporter";

/**
 * One-command Payments demo (Phase 1.6 spike): pre-baked intermediate JSONL —
 * exactly what the LLM extraction step emits from the source docs — is loaded through
 * the **real** GraphLoader into the graph, queried through the **real** Query Interface,
 * and rendered as a decisions-first PlantUML domain map. Deterministic: no live LLM,
 * no secrets, no external services (PNG render is best-effort via the PlantUML image).
 */

const demoDir = dirname(dirname(fileURLToPath(import.meta.url)));
const EXTRACTIONS = join(demoDir, "payments-extractions.jsonl");
const RELATIONSHIPS = join(demoDir, "payments-relationships.jsonl");
const PUML = "payments-domain-map.puml";
const PNG = "payments-domain-map.png";

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

  console.log("▶ Querying the graph through the Query Interface (@dkm/query)…");
  const service = new GraphQueryService(graph);
  const model = await buildDomainMapModel(service);
  console.log(
    `  ${model.nodeCount} nodes across ${model.nodesByDoc.size} documents, ` +
      `${model.edges.length} relationships, ${model.decisionIds.size} decisions`,
  );

  const puml = renderPlantUml(model);
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
