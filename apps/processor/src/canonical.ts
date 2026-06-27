import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CanonicalDocument } from "@dkm/source-connectors";

/**
 * Serialise canonical documents as JSONL (one document per line) — the bridge file the Python
 * extraction CLI (`python -m dkm_enrichment extract`) reads. JSONL keeps the hand-off streaming
 * and line-addressable, matching the intermediate-JSONL convention used everywhere else.
 */
export function serialiseCanonicalDocs(documents: CanonicalDocument[]): string {
  if (documents.length === 0) return "";
  return documents.map((document) => JSON.stringify(document)).join("\n") + "\n";
}

/** Write the canonical-docs JSONL to ``path`` (creating parent directories). */
export function writeCanonicalDocsJsonl(documents: CanonicalDocument[], path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serialiseCanonicalDocs(documents), "utf8");
}
