import { randomUUID } from "node:crypto";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  computeContentHash,
  computeDocumentId,
  type CanonicalDocument,
} from "./canonical-document";
import { matchGlob } from "./glob";
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

/** Per-file checkpoint entry: the content hash plus a fast mtime/size pre-check. */
interface FileCheckpoint {
  hash: string;
  mtimeMs: number;
  size: number;
}

/** A discovered candidate file (no content read yet). */
interface Candidate {
  absPath: string;
  relPath: string;
  name: string;
  /** Extension without the leading dot, lower-cased. */
  ext: string;
  size: number;
  mtimeMs: number;
  mtimeISO: string;
}

const SUPPORTED_FORMATS = ["json"] as const;

/**
 * The `json` connector (spec 004, Phase 1 Feature 06) — the *second* source
 * connector, added purely to prove the Open-Closed boundary for ingestion. It
 * walks a configured root for `*.json` files, parses each whole-file, and emits
 * `CanonicalDocument`s with `contentType: 'structured'` and the parsed value in
 * `structuredContent` (spec 004 Decision 2). It implements the **unchanged**
 * `SourceConnector` port and reuses Feature 01's deterministic-id / content-hash
 * helpers and document-level incremental model (Decision 3) without modifying
 * them — the registry, the port, and the filesystem connector are untouched.
 *
 * Whole-file-per-document is deliberate for the pilot; streaming very large JSON
 * arrays record-by-record is a deferred concern (spec Open Question 3). A
 * file-based JSON source only — the generic REST `api-json` connector is Phase 3.
 */
export class JsonConnector implements SourceConnector {
  readonly type = "json";
  readonly supportedFormats: string[] = [...SUPPORTED_FORMATS];

  private config: SourceConfig | undefined;
  private rootPath: string | undefined;

  async initialize(config: SourceConfig): Promise<void> {
    const root = config.connectionDetails.rootPath;
    if (typeof root !== "string" || root.length === 0) {
      throw new Error("json connector requires connectionDetails.rootPath (non-empty string).");
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
    return candidates.map((c) => ({
      sourcePath: c.absPath,
      lastModified: c.mtimeISO,
      sizeBytes: c.size,
    }));
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

    const candidates = await this.collectCandidates();

    for (const candidate of candidates) {
      let current: { mtimeMs: number; size: number };
      try {
        // `stat` follows symlinks, so a broken link surfaces here as a failure.
        const st = await stat(candidate.absPath);
        current = { mtimeMs: st.mtimeMs, size: st.size };
      } catch (error) {
        errors.push({ documentPath: candidate.absPath, error: describeError(error), retriable: true });
        continue;
      }

      const prior = previous[candidate.absPath];
      // Fast path: unchanged mtime + size ⇒ skip without reading.
      if (prior && prior.mtimeMs === current.mtimeMs && prior.size === current.size) {
        checkpoint[candidate.absPath] = prior;
        skipped += 1;
        continue;
      }

      let content: string;
      try {
        content = await readFile(candidate.absPath, "utf8");
      } catch (error) {
        errors.push({ documentPath: candidate.absPath, error: describeError(error), retriable: true });
        continue;
      }

      const hash = computeContentHash(content);
      // Content identical despite a touched mtime ⇒ still a skip (refresh checkpoint).
      if (prior && prior.hash === hash) {
        checkpoint[candidate.absPath] = { hash, mtimeMs: current.mtimeMs, size: current.size };
        skipped += 1;
        continue;
      }

      let structuredContent: object;
      try {
        structuredContent = JSON.parse(content) as object;
      } catch (error) {
        // Malformed JSON is skipped and reported, never aborting the run. Re-parsing
        // the same bytes cannot succeed, so the error is non-retriable. The file is
        // left out of the checkpoint so a later *edit* is re-attempted.
        errors.push({ documentPath: candidate.absPath, error: describeError(error), retriable: false });
        continue;
      }

      const document = this.toCanonicalDocument(candidate, content, structuredContent, hash, config);
      documents.push(document);
      lastDocumentId = document.id;
      checkpoint[candidate.absPath] = { hash, mtimeMs: current.mtimeMs, size: current.size };
    }

    const fetched = documents.length;
    const failed = errors.length;
    const total = fetched + skipped + failed;

    const nextState: IngestionState = {
      sourceId: config.id,
      lastRunId: runId,
      lastRunAt: new Date().toISOString(),
      checkpoint,
      documentsProcessed: (state?.documentsProcessed ?? 0) + fetched,
      lastDocumentId,
    };

    return {
      runId,
      documents,
      state: nextState,
      errors,
      stats: { total, fetched, skipped, failed, duration: Date.now() - startedAt },
    };
  }

  private toCanonicalDocument(
    candidate: Candidate,
    content: string,
    structuredContent: object,
    hash: string,
    config: SourceConfig,
  ): CanonicalDocument {
    const id = computeDocumentId(this.type, candidate.absPath, hash);
    const title = basename(candidate.name, extname(candidate.name));

    return {
      id,
      sourceType: this.type,
      sourcePath: candidate.absPath,
      sourceVersion: hash,
      fetchedAt: new Date().toISOString(),
      sourceAuthority: config.sourceAuthority,
      content,
      contentType: "structured",
      structuredContent,
      title,
      lastModified: candidate.mtimeISO,
    };
  }

  /** Recursively walk the root, returning supported files that pass the filters. */
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
        return; // An unreadable directory is skipped; individual files report below.
      }
      for (const entry of entries) {
        const absPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(absPath);
          continue;
        }
        if (!entry.isFile() && !entry.isSymbolicLink()) {
          continue;
        }
        const ext = extname(entry.name).replace(/^\./, "").toLowerCase();
        if (!supported.has(ext)) {
          continue;
        }
        const relPath = relative(root, absPath).split(sep).join("/");
        if (!passesFilters(relPath, entry.name, ext, filters)) {
          continue;
        }
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
    if (!this.config) {
      throw new Error("json connector not initialised; call initialize() first.");
    }
    return this.config;
  }

  private requireRoot(): string {
    if (!this.rootPath) {
      throw new Error("json connector not initialised; call initialize() first.");
    }
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
      return undefined; // JSON files carry no tags at discovery time.
  }
}

function passesFilters(relPath: string, name: string, ext: string, filters: SourceFilter[]): boolean {
  const includes = filters.filter((f) => f.type === "include");
  const excludes = filters.filter((f) => f.type === "exclude");

  for (const filter of excludes) {
    const value = filterValue(filter.field, relPath, name, ext);
    if (value !== undefined && matchGlob(filter.pattern, value)) {
      return false;
    }
  }

  if (includes.length === 0) {
    return true;
  }
  return includes.some((filter) => {
    const value = filterValue(filter.field, relPath, name, ext);
    return value !== undefined && matchGlob(filter.pattern, value);
  });
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
