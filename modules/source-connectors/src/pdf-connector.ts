import { randomUUID } from "node:crypto";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import {
  computeContentHash,
  computeDocumentId,
  type CanonicalDocument,
} from "./canonical-document";
import { matchGlob } from "./glob";
import { firstHeadingTitle, parseMarkdownSections } from "./markdown-section-parser";
import type {
  DiscoveryFilter,
  DocumentReference,
  HealthStatus,
  IngestionError,
  IngestionResult,
  IngestionState,
  SourceConfig,
  SourceConnector,
  SourceFilter,
} from "./port";

/** Per-file checkpoint entry: the extracted-content hash plus a fast mtime/size pre-check. */
interface FileCheckpoint {
  hash: string;
  mtimeMs: number;
  size: number;
}

interface Candidate {
  absPath: string;
  relPath: string;
  name: string;
  ext: string;
  size: number;
  mtimeMs: number;
  mtimeISO: string;
}

const DEFAULT_FORMATS = ["pdf"] as const;

/**
 * The `pdf` connector — a **basic** text-extraction connector for PDF sources. It walks a root
 * for `*.pdf`, extracts the text layer per page (via `unpdf`/pdf.js), and emits each PDF as a
 * **Markdown** `CanonicalDocument` (`# <title>`, then a `## Page N` section per page) so it flows
 * through the same Markdown chunking as native docs. A new source format is one registration line
 * (OCP) — the pipeline below is unchanged.
 *
 * Scope (basic): text-based PDFs. **Scanned/image-only PDFs have no text layer** — they extract
 * empty and are skipped-and-reported, not silently emitted as blank. A richer layout-aware
 * connector (tables/figures, e.g. a LlamaParse-style adapter) is a future plug-in alongside this.
 */
export class PdfConnector implements SourceConnector {
  readonly type = "pdf";
  readonly supportedFormats: string[] = [...DEFAULT_FORMATS];

  private config: SourceConfig | undefined;
  private rootPath: string | undefined;

  async initialize(config: SourceConfig): Promise<void> {
    const root = config.connectionDetails.rootPath;
    if (typeof root !== "string" || root.length === 0) {
      throw new Error("pdf connector requires connectionDetails.rootPath (non-empty string).");
    }
    this.config = config;
    this.rootPath = isAbsolute(root) ? root : resolve(root);
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.rootPath) {
      return { healthy: false, detail: "Connector not initialised." };
    }
    try {
      const st = await stat(this.rootPath);
      if (!st.isDirectory()) {
        return { healthy: false, detail: `Root path is not a directory: ${this.rootPath}` };
      }
      return { healthy: true };
    } catch (error) {
      return { healthy: false, detail: `Root path inaccessible: ${describeError(error)}` };
    }
  }

  async discover(filters?: DiscoveryFilter[]): Promise<DocumentReference[]> {
    const candidates = await this.collectCandidates(filters);
    return candidates.map((c) => ({ sourcePath: c.absPath, lastModified: c.mtimeISO, sizeBytes: c.size }));
  }

  async ingest(state?: IngestionState): Promise<IngestionResult> {
    const config = this.requireConfig();
    const runId = randomUUID();
    const startedAt = Date.now();

    const previous = (state?.checkpoint ?? {}) as Record<string, FileCheckpoint | undefined>;
    const checkpoint: Record<string, FileCheckpoint> = {};
    const documents: CanonicalDocument[] = [];
    const errors: IngestionError[] = [];
    let skipped = 0;
    let lastDocumentId = state?.lastDocumentId ?? "";

    for (const candidate of await this.collectCandidates()) {
      let current: { mtimeMs: number; size: number };
      try {
        const st = await stat(candidate.absPath);
        current = { mtimeMs: st.mtimeMs, size: st.size };
      } catch (error) {
        errors.push({ documentPath: candidate.absPath, error: describeError(error), retriable: true });
        continue;
      }

      const prior = previous[candidate.absPath];
      // Fast path: unchanged mtime + size ⇒ skip without re-extracting.
      if (prior && prior.mtimeMs === current.mtimeMs && prior.size === current.size) {
        checkpoint[candidate.absPath] = prior;
        skipped += 1;
        continue;
      }

      let markdown: string;
      try {
        markdown = await this.extractMarkdown(candidate.absPath, candidate.name);
      } catch (error) {
        errors.push({ documentPath: candidate.absPath, error: describeError(error), retriable: false });
        continue;
      }

      const hash = computeContentHash(markdown);
      // Content identical despite a touched mtime ⇒ still a skip (refresh checkpoint).
      if (prior && prior.hash === hash) {
        checkpoint[candidate.absPath] = { hash, mtimeMs: current.mtimeMs, size: current.size };
        skipped += 1;
        continue;
      }

      const document = this.toCanonicalDocument(candidate, markdown, hash, config);
      documents.push(document);
      lastDocumentId = document.id;
      checkpoint[candidate.absPath] = { hash, mtimeMs: current.mtimeMs, size: current.size };
    }

    const fetched = documents.length;
    const failed = errors.length;
    return {
      runId,
      documents,
      state: {
        sourceId: config.id,
        lastRunId: runId,
        lastRunAt: new Date().toISOString(),
        checkpoint,
        documentsProcessed: (state?.documentsProcessed ?? 0) + fetched,
        lastDocumentId,
      },
      errors,
      stats: { total: fetched + skipped + failed, fetched, skipped, failed, duration: Date.now() - startedAt },
    };
  }

  /** Extract the PDF's text layer and render it as Markdown (one `## Page N` section per page). */
  private async extractMarkdown(absPath: string, name: string): Promise<string> {
    const buffer = await readFile(absPath);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [text];

    if (!pages.some((page) => page.trim().length > 0)) {
      throw new Error("no extractable text (scanned/image-only PDF?)");
    }

    const title = basename(name, extname(name));
    const parts = [`# ${title}`];
    pages.forEach((page, index) => {
      parts.push(`## Page ${index + 1}`);
      parts.push(page.trim().length > 0 ? page.trim() : "_(no extractable text on this page)_");
    });
    return `${parts.join("\n\n")}\n`;
  }

  private toCanonicalDocument(
    candidate: Candidate,
    markdown: string,
    hash: string,
    config: SourceConfig,
  ): CanonicalDocument {
    const id = computeDocumentId(this.type, candidate.absPath, hash);
    const fallbackTitle = basename(candidate.name, extname(candidate.name));
    return {
      id,
      sourceType: this.type,
      sourcePath: candidate.absPath,
      sourceVersion: hash,
      fetchedAt: new Date().toISOString(),
      sourceAuthority: config.sourceAuthority,
      content: markdown,
      contentType: "markdown",
      title: firstHeadingTitle(markdown) ?? fallbackTitle,
      lastModified: candidate.mtimeISO,
      sections: parseMarkdownSections(markdown, id),
    };
  }

  private async collectCandidates(extraFilters?: SourceFilter[]): Promise<Candidate[]> {
    const root = this.requireRoot();
    const config = this.requireConfig();
    const filters = [...config.filters, ...(extraFilters ?? [])];
    const supported = new Set(this.supportedFormats.map((f) => f.toLowerCase()));
    const out: Candidate[] = [];

    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const absPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(absPath);
          continue;
        }
        if (!entry.isFile() && !entry.isSymbolicLink()) continue;
        const ext = extname(entry.name).replace(/^\./, "").toLowerCase();
        if (!supported.has(ext)) continue;
        const relPath = relative(root, absPath).split(sep).join("/");
        if (!passesFilters(relPath, entry.name, ext, filters)) continue;
        const meta = await lstat(absPath).catch(() => undefined);
        out.push({
          absPath,
          relPath,
          name: entry.name,
          ext,
          size: meta?.size ?? 0,
          mtimeMs: meta?.mtimeMs ?? 0,
          mtimeISO: meta ? meta.mtime.toISOString() : new Date(0).toISOString(),
        });
      }
    };

    await walk(root);
    out.sort((a, b) => a.relPath.localeCompare(b.relPath));
    return out;
  }

  private requireConfig(): SourceConfig {
    if (!this.config) throw new Error("pdf connector not initialised; call initialize() first.");
    return this.config;
  }

  private requireRoot(): string {
    if (!this.rootPath) throw new Error("pdf connector not initialised; call initialize() first.");
    return this.rootPath;
  }
}

function filterValue(field: SourceFilter["field"], relPath: string, name: string, ext: string): string | undefined {
  switch (field) {
    case "path":
      return relPath;
    case "name":
      return name;
    case "extension":
      return ext;
    case "tag":
      return undefined;
  }
}

function passesFilters(relPath: string, name: string, ext: string, filters: SourceFilter[]): boolean {
  const includes = filters.filter((f) => f.type === "include");
  const excludes = filters.filter((f) => f.type === "exclude");

  for (const filter of excludes) {
    const value = filterValue(filter.field, relPath, name, ext);
    if (value !== undefined && matchGlob(filter.pattern, value)) return false;
  }
  if (includes.length === 0) return true;
  return includes.some((filter) => {
    const value = filterValue(filter.field, relPath, name, ext);
    return value !== undefined && matchGlob(filter.pattern, value);
  });
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
