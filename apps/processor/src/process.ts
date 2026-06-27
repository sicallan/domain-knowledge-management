import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SourceAuthority } from "@dkm/source-connectors";
import { writeCanonicalDocsJsonl } from "./canonical";
import { runConnectors } from "./connectors";

/**
 * `dkm process` — the Tier-B orchestrator (QUICKSTART). It turns a folder of documents into the
 * typed knowledge-graph JSONL the gateway serves:
 *
 *   docs → [connectors] → canonical-docs.jsonl → [python -m dkm_enrichment extract] → data/<domain>/*.jsonl
 *
 * The TS connectors and the Python extraction live in different runtimes, so this bridges them
 * with a JSONL file and a subprocess. The extraction hand-off is injectable ({@link ProcessDeps})
 * so the orchestration is unit-testable without a Python toolchain.
 */

export interface ProcessArgs {
  /** Folder of source documents (Markdown / plaintext / JSON). */
  docsDir: string;
  /** Domain name — names the output dir `data/<domain>/` and the graph it serves. */
  domain: string;
  /** Provenance authority stamped on every extracted assertion. */
  authority: SourceAuthority;
  /** Use the deterministic fake gateway (no LLM / key) — plumbing checks. */
  fake: boolean;
  /** Output data root (default `DKM_DATA_DIR` or `data`). */
  dataDir: string;
  /** Python interpreter for the extraction subprocess. */
  python: string;
}

export interface ExtractRequest {
  canonicalPath: string;
  outDir: string;
  fake: boolean;
  python: string;
}

export interface ProcessDeps {
  /** Run the Python extraction over the canonical-docs file → the graph JSONL in `outDir`. */
  extract: (request: ExtractRequest) => void;
}

const AUTHORITIES: ReadonlySet<string> = new Set([
  "regulatory",
  "scheme",
  "vendor",
  "project",
  "operational",
]);

/** Default extraction hand-off: `python -m dkm_enrichment extract <canonical> --out <dir> [--fake]`. */
export function defaultExtract({ canonicalPath, outDir, fake, python }: ExtractRequest): void {
  const args = ["-m", "dkm_enrichment", "extract", canonicalPath, "--out", outDir];
  if (fake) args.push("--fake");
  execFileSync(python, args, { stdio: "inherit" });
}

export function parseArgs(argv: string[]): ProcessArgs {
  const positionals: string[] = [];
  let domain: string | undefined;
  let authority = "operational";
  let fake = false;
  let dataDir = process.env.DKM_DATA_DIR ?? "data";
  let python = "python3";

  const value = (index: number, flag: string): string => {
    const next = argv[index];
    if (next === undefined) throw new Error(`${flag} expects a value`);
    return next;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--domain":
        domain = value((i += 1), "--domain");
        break;
      case "--authority":
        authority = value((i += 1), "--authority");
        break;
      case "--data-dir":
        dataDir = value((i += 1), "--data-dir");
        break;
      case "--python":
        python = value((i += 1), "--python");
        break;
      case "--fake":
        fake = true;
        break;
      default:
        if (arg !== undefined) positionals.push(arg);
    }
  }

  const [docsDir] = positionals;
  if (docsDir === undefined) throw new Error("missing <docs-dir>");
  if (domain === undefined) throw new Error("missing --domain <name>");
  if (!AUTHORITIES.has(authority)) {
    throw new Error(`invalid --authority '${authority}' (one of: ${[...AUTHORITIES].join(", ")})`);
  }
  return { docsDir, domain, authority: authority as SourceAuthority, fake, dataDir, python };
}

export interface ProcessResult {
  outDir: string;
  canonicalPath: string;
  documentCount: number;
}

export async function runProcess(
  args: ProcessArgs,
  deps: ProcessDeps = { extract: defaultExtract },
): Promise<ProcessResult> {
  const documents = await runConnectors(args.docsDir, args.authority);
  if (documents.length === 0) {
    throw new Error(`no supported documents (.md / .txt / .json) under ${args.docsDir}`);
  }

  const outDir = join(args.dataDir, args.domain);
  const canonicalPath = join(outDir, "canonical", "canonical-docs.jsonl");
  writeCanonicalDocsJsonl(documents, canonicalPath);

  deps.extract({ canonicalPath, outDir, fake: args.fake, python: args.python });

  return { outDir, canonicalPath, documentCount: documents.length };
}

async function main(): Promise<void> {
  let args: ProcessArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`✗ ${(error as Error).message}`);
    console.error("usage: dkm process <docs-dir> --domain <name> [--authority <a>] [--fake]");
    process.exitCode = 1;
    return;
  }

  console.log(`▶ Processing '${args.domain}' from ${args.docsDir}…`);
  console.log("  1/2 connectors → canonical documents");
  const result = await runProcess(args, {
    extract: (request) => {
      console.log("  2/2 extraction → knowledge-graph JSONL");
      defaultExtract(request);
    },
  });

  console.log(
    `\n▶ Done — ${result.documentCount} document(s) → ${result.outDir}/{extractions,relationships}.jsonl`,
  );
  console.log("  Explore it:");
  console.log(`    DKM_DOMAIN=${args.domain} docker compose up   →  http://localhost:5173`);
  console.log(`  Or analyse the intermediate JSONL with your own LLM (see QUICKSTART.md).`);
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  void main().catch((error: unknown) => {
    console.error(`✗ ${(error as Error).message}`);
    process.exitCode = 1;
  });
}
