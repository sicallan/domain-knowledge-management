import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
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

/** The minimum a document needs to get a stable, readable `.md` filename. */
type NamedDocument = Pick<CanonicalDocument, "sourcePath" | "id">;

/**
 * A readable `.md` filename for a document, derived from its source basename (so a PDF's
 * extracted text lands at `<Report>.md`). `used` tracks already-emitted names; a collision
 * (same basename from a different source dir) is disambiguated with a short id suffix so neither
 * file overwrites the other. The chosen name is added to `used`.
 */
export function markdownFileName(document: NamedDocument, used: Set<string>): string {
  const stem = basename(document.sourcePath, extname(document.sourcePath)) || "document";
  let name = `${stem}.md`;
  if (used.has(name)) name = `${stem}-${document.id.slice(0, 8)}.md`;
  used.add(name);
  return name;
}

/**
 * Write each document's extracted Markdown (`content`) to `<dir>/<name>.md` — the human-readable
 * companion to the canonical JSONL, so a `dkm process` run is verifiable by eye (especially the
 * PDF text layer) without parsing JSONL. Returns the filenames written.
 */
export function writeCanonicalMarkdown(documents: CanonicalDocument[], dir: string): string[] {
  if (documents.length === 0) return [];
  mkdirSync(dir, { recursive: true });
  const used = new Set<string>();
  const written: string[] = [];
  for (const document of documents) {
    const name = markdownFileName(document, used);
    writeFileSync(join(dir, name), document.content, "utf8");
    written.push(name);
  }
  return written;
}
