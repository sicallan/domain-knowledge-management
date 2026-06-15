import type { JsonlEntry } from "@dkm/schema";
import { concatJsonl } from "./jsonl-reader";
import type {
  LoaderOrchestrator,
  LoaderPort,
  LoadResult,
  OrchestratorResult,
  RunFiles,
  RunState,
  RunStatus,
} from "./port";

/**
 * MultiLoaderOrchestrator — the minimal {@link LoaderOrchestrator} (spec 003). It
 * fans a run's JSONL out to every registered loader. Each loader receives its **own
 * fresh stream** (entities file before relationships file → entity-first ordering)
 * built lazily with {@link concatJsonl}, so no file is ever buffered whole and one
 * loader's progress never depends on another's.
 *
 * Adding a loader is `registerLoader(loader)` — the orchestrator iterates whatever is
 * registered, so a future vector/PostgreSQL loader needs **zero changes here** (OCP).
 */
export class MultiLoaderOrchestrator implements LoaderOrchestrator {
  private readonly loaders: LoaderPort[] = [];
  private readonly statuses = new Map<string, RunStatus>();

  registerLoader(loader: LoaderPort): void {
    if (this.loaders.some((l) => l.name === loader.name)) {
      throw new Error(`a loader named '${loader.name}' is already registered`);
    }
    this.loaders.push(loader);
  }

  async executeRun(files: RunFiles, runId: string): Promise<OrchestratorResult> {
    const startedAt = new Date().toISOString();
    this.statuses.set(runId, { runId, state: "running", results: [], startedAt });

    // Independent failure: one loader throwing must not block the others.
    const settled = await Promise.allSettled(
      this.loaders.map((loader) => loader.load(this.stream(files), runId)),
    );

    const results: LoadResult[] = [];
    let threw = false;
    settled.forEach((outcome, index) => {
      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
      } else {
        threw = true;
        const loader = this.loaders[index]!;
        const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        results.push({
          runId,
          totalEntries: 0,
          loaded: 0,
          skipped: 0,
          failed: 0,
          errors: [{ entryId: `(loader:${loader.name})`, error: reason, retriable: true }],
          duration: 0,
        });
      }
    });

    const succeeded = !threw && results.every((r) => r.failed === 0);
    const state: RunState = succeeded ? "completed" : threw ? "failed" : "partial";
    const completedAt = new Date().toISOString();
    this.statuses.set(runId, { runId, state, results, startedAt, completedAt });
    return { runId, results, succeeded };
  }

  async replayLoader(loaderName: string, files: RunFiles, runId: string): Promise<LoadResult> {
    const loader = this.loaders.find((l) => l.name === loaderName);
    if (!loader) {
      throw new Error(`no loader named '${loaderName}' is registered`);
    }
    // Replay relies on the loader's own idempotency: already-processed entries skip.
    return loader.load(this.stream(files), runId);
  }

  async getRunStatus(runId: string): Promise<RunStatus | null> {
    return this.statuses.get(runId) ?? null;
  }

  /** A fresh, single-use stream per loader (entities then relationships). */
  private stream(files: RunFiles): AsyncIterable<JsonlEntry> {
    return concatJsonl([files.entities, files.relationships]);
  }
}
