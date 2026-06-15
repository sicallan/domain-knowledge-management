import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { JsonlEntry } from "@dkm/schema";

/** Diagnostic for a line that could not be parsed as JSON. */
export interface MalformedLine {
  lineNumber: number;
  line: string;
  error: Error;
}

export interface JsonlReaderOptions {
  /**
   * Skip lines that fail to parse as JSON (default `true`). When `false`, the
   * first malformed line throws. Blank/whitespace-only lines are always skipped.
   */
  skipMalformed?: boolean;
  /** Invoked for each skipped malformed line (only when `skipMalformed`). */
  onMalformed?: (info: MalformedLine) => void;
}

/**
 * Stream a JSONL file as an `AsyncIterable<JsonlEntry>` (spec 003 Decision 4 —
 * mandatory streaming). Lines are read one at a time via `readline`, so the whole
 * file is never buffered into memory and entries are yielded in file order
 * (extraction sequence → entity-first ordering is preserved by the file itself).
 *
 * Malformed bytes are a reader concern (distinct from a well-formed entry that
 * fails schema validation — that is the loader's job); by default they are skipped
 * and surfaced via `onMalformed` so the stream of `JsonlEntry` stays well-typed.
 */
export async function* readJsonl(
  path: string,
  options: JsonlReaderOptions = {},
): AsyncIterable<JsonlEntry> {
  const skipMalformed = options.skipMalformed ?? true;
  const stream = createReadStream(path, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;
  try {
    for await (const raw of rl) {
      lineNumber += 1;
      const line = raw.trim();
      if (line === "") continue;
      let parsed: JsonlEntry;
      try {
        parsed = JSON.parse(line) as JsonlEntry;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (skipMalformed) {
          options.onMalformed?.({ lineNumber, line, error });
          continue;
        }
        throw new Error(`Malformed JSONL at ${path}:${lineNumber}: ${error.message}`);
      }
      yield parsed;
    }
  } finally {
    rl.close();
    stream.destroy();
  }
}

/**
 * Stream several JSONL files back-to-back as a single ordered `AsyncIterable`
 * (undefined paths are ignored). The orchestrator uses this to feed a run's
 * `extractions` file before its `relationships` file, giving entity-first
 * ordering without buffering either file.
 */
export async function* concatJsonl(
  paths: Array<string | undefined>,
  options: JsonlReaderOptions = {},
): AsyncIterable<JsonlEntry> {
  for (const path of paths) {
    if (!path) continue;
    yield* readJsonl(path, options);
  }
}
