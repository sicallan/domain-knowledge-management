import { readdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import type { GraphPort } from "@dkm/knowledge-graph";
import { concatJsonl, GraphLoader } from "@dkm/loaders";
import type { LoadResult } from "@dkm/loaders";
import { GraphQueryService } from "@dkm/query";
import type { QueryService } from "@dkm/query";
import {
  BehaviourFlowProjector,
  BusinessArchitectureProjector,
  CapabilityMapProjector,
  DefaultViewEngine,
  DomainMapProjector,
  GapAnalysisProjector,
  VendorCoverageProjector,
} from "@dkm/view-projection";
import type { ViewEngine } from "@dkm/view-projection";

/**
 * The canonical Payments seed paths. Single source of truth (UI-D2): the dev server,
 * the resolver tests, and the studio's MSW handlers all seed from these same files.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DEMO_DIR = join(repoRoot, "demo");
export const SEED_JSONL_PATHS = [
  join(DEMO_DIR, "payments-extractions.jsonl"),
  join(DEMO_DIR, "payments-relationships.jsonl"),
] as const;

/**
 * The curated Business-Architecture reference spine (Feature 08, #86 — ADR-0009): the
 * hand-authored L1 domain → L2 capability skeleton the Business-Architecture Lens projects
 * over. It is **corpus-independent** — the raw capabilities of *any* domain are classified
 * into this same spine — so {@link seedInMemoryGraph} always loads it alongside whatever
 * corpus `resolveSeedJsonlPaths()` selected, not just the bundled Payments demo.
 */
export const SPINE_JSONL_PATH = join(DEMO_DIR, "business-architecture-spine.jsonl");

/** The environment knobs that point the gateway at a domain's data instead of the demo seed. */
export interface SeedEnv {
  /** Explicit, comma-separated JSONL paths (highest precedence). */
  DKM_JSONL?: string;
  /** A processed domain name — serves ``<DKM_DATA_DIR or ./data>/<DKM_DOMAIN>/*.jsonl``. */
  DKM_DOMAIN?: string;
  /** A directory whose ``*.jsonl`` files are served (e.g. a `dkm process` output dir / data root). */
  DKM_DATA_DIR?: string;
}

/** All ``*.jsonl`` directly in ``dir`` (non-recursive), sorted, absolute; ``[]`` if unreadable. */
function jsonlInDir(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".jsonl"))
      .sort()
      .map((name) => join(dir, name));
  } catch {
    return []; // missing/unreadable dir
  }
}

/**
 * Resolve which JSONL files the gateway should seed from (QUICKSTART / docker-compose). Order:
 * explicit ``DKM_JSONL`` → the processed domain ``<DKM_DATA_DIR>/<DKM_DOMAIN>/*.jsonl`` →
 * every ``*.jsonl`` in ``DKM_DATA_DIR`` → the bundled Payments demo.
 *
 * A selected source that exists but holds no JSONL (e.g. a freshly-mounted, not-yet-processed
 * volume) **falls back to the demo** so ``docker compose up`` always shows *something* — the
 * "see it in two minutes" path. Returns absolute paths.
 */
export function resolveSeedJsonlPaths(env: SeedEnv = process.env): readonly string[] {
  const toAbsolute = (path: string): string => (isAbsolute(path) ? path : resolve(path));

  if (env.DKM_JSONL && env.DKM_JSONL.trim()) {
    return env.DKM_JSONL.split(",")
      .map((path) => path.trim())
      .filter((path) => path.length > 0)
      .map(toAbsolute);
  }

  const dataRoot = env.DKM_DATA_DIR && env.DKM_DATA_DIR.trim() ? toAbsolute(env.DKM_DATA_DIR.trim()) : null;

  // A processed domain: <data root, default ./data>/<domain>/*.jsonl.
  if (env.DKM_DOMAIN && env.DKM_DOMAIN.trim()) {
    const domainDir = join(dataRoot ?? toAbsolute("data"), env.DKM_DOMAIN.trim());
    const jsonl = jsonlInDir(domainDir);
    if (jsonl.length > 0) return jsonl;
  }

  if (dataRoot) {
    const jsonl = jsonlInDir(dataRoot);
    if (jsonl.length > 0) return jsonl;
  }

  return SEED_JSONL_PATHS;
}

/** The injectable read-path backend the gateway resolvers delegate to (UI-D3). */
export interface SeededBackend {
  /** The ephemeral in-memory store the seed was loaded into. */
  graph: GraphPort;
  /** The Query Interface (entry/entries/traverse/paths) over {@link graph}. */
  queryService: QueryService;
  /** The View Projection engine with the four Phase-1–3 projectors registered. */
  views: ViewEngine;
  /** The loader's report — `loaded`/`skipped`/`failed` counts for the seed. */
  loadResult: LoadResult;
}

export interface SeedOptions {
  /** Override the JSONL files to seed from (defaults to the Payments demo seed). */
  jsonlPaths?: readonly string[];
  /** A pre-built graph to load into (defaults to a fresh {@link InMemoryGraphAdapter}). */
  graph?: GraphPort;
  /** The run id recorded by the loader (idempotency key). Defaults to `api-gateway-seed`. */
  runId?: string;
}

/**
 * Build the gateway's read-path backend by loading the canonical `demo/*.jsonl` seed
 * into an in-memory graph **through the real `GraphLoader`** (UI-D2 / UI-D3) — the
 * exact pipeline the demo runs, not a hand-rolled fixture. Returns the wired
 * `QueryService` + `ViewEngine` the resolvers delegate to.
 *
 * This is the **one shared seed**: the Yoga dev server, the resolver tests, and the
 * studio's MSW handlers all call it, so dev/test/mock can never diverge. Swapping the
 * `graph` option for a `Neo4jGraphAdapter` (D-P1.2) re-seeds the same data over Neo4j
 * with no other change — the parity the gateway tests prove.
 */
export async function seedInMemoryGraph(options: SeedOptions = {}): Promise<SeededBackend> {
  const graph = options.graph ?? new InMemoryGraphAdapter();
  // The Business-Architecture spine is corpus-independent (ADR-0009): always load it alongside
  // whatever corpus was selected, so the EA lens works over the stewardship data too — not just
  // the Payments demo. Appended once; a caller that already listed it is not double-loaded.
  const corpus = options.jsonlPaths ?? SEED_JSONL_PATHS;
  const paths = corpus.includes(SPINE_JSONL_PATH) ? corpus : [...corpus, SPINE_JSONL_PATH];

  const loader = new GraphLoader(graph);
  await loader.initialize({});
  const loadResult = await loader.load(concatJsonl([...paths]), options.runId ?? "api-gateway-seed");

  const queryService = new GraphQueryService(graph);
  const views = new DefaultViewEngine(queryService);
  views.registerProjector(new DomainMapProjector(queryService));
  views.registerProjector(new CapabilityMapProjector(queryService));
  views.registerProjector(new BusinessArchitectureProjector(queryService));
  views.registerProjector(new BehaviourFlowProjector(queryService));
  views.registerProjector(new VendorCoverageProjector(queryService));
  views.registerProjector(new GapAnalysisProjector(queryService));

  return { graph, queryService, views, loadResult };
}
