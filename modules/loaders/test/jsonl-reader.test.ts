import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { JsonlEntry } from "@dkm/schema";
import { concatJsonl, readJsonl } from "../src/index";
import type { MalformedLine } from "../src/index";

let dir: string;

function line(id: string, type = "DomainConcept"): string {
  const entry: JsonlEntry = {
    id,
    type,
    version: "1.0.0",
    source: { file: "f.md", location: "§1", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "scheme" },
    confidence: 0.9,
    extractedAt: "2026-01-02T00:00:00Z",
    data: { name: id },
  };
  return JSON.stringify(entry);
}

async function collect(iter: AsyncIterable<JsonlEntry>): Promise<JsonlEntry[]> {
  const out: JsonlEntry[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "jsonl-reader-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("readJsonl — streaming parse", () => {
  it("parses each line into an entry and preserves file order", async () => {
    const path = join(dir, "ordered.jsonl");
    await writeFile(path, [line("a"), line("b"), line("c")].join("\n") + "\n");
    const entries = await collect(readJsonl(path));
    expect(entries.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(entries[0]?.data.name).toBe("a");
  });

  it("exposes an AsyncIterable (streaming, not an eagerly-built array)", () => {
    const path = join(dir, "ordered.jsonl");
    const iter = readJsonl(path);
    expect(typeof iter[Symbol.asyncIterator]).toBe("function");
  });

  it("skips blank lines and trailing whitespace", async () => {
    const path = join(dir, "blanks.jsonl");
    await writeFile(path, ["", line("a"), "   ", line("b"), ""].join("\n"));
    const entries = await collect(readJsonl(path));
    expect(entries.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("skips a malformed line by default and reports it via onMalformed", async () => {
    const path = join(dir, "malformed.jsonl");
    await writeFile(path, [line("a"), "{not json", line("b")].join("\n"));
    const malformed: MalformedLine[] = [];
    const entries = await collect(readJsonl(path, { onMalformed: (m) => malformed.push(m) }));
    expect(entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(malformed).toHaveLength(1);
    expect(malformed[0]?.lineNumber).toBe(2);
  });

  it("throws on a malformed line when skipMalformed is false", async () => {
    const path = join(dir, "malformed.jsonl");
    await writeFile(path, [line("a"), "{not json", line("b")].join("\n"));
    await expect(collect(readJsonl(path, { skipMalformed: false }))).rejects.toThrow(/Malformed JSONL/);
  });

  it("streams a large file without buffering it whole", async () => {
    const path = join(dir, "large.jsonl");
    const n = 5000;
    await writeFile(path, Array.from({ length: n }, (_, i) => line(`e-${i}`)).join("\n") + "\n");
    let count = 0;
    let firstId: string | undefined;
    let lastId: string | undefined;
    for await (const e of readJsonl(path)) {
      if (count === 0) firstId = e.id;
      lastId = e.id;
      count += 1;
    }
    expect(count).toBe(n);
    expect(firstId).toBe("e-0");
    expect(lastId).toBe(`e-${n - 1}`);
  });
});

describe("concatJsonl — entities then relationships", () => {
  it("streams several files back-to-back in order, ignoring undefined paths", async () => {
    const a = join(dir, "first.jsonl");
    const b = join(dir, "second.jsonl");
    await writeFile(a, [line("a1"), line("a2")].join("\n"));
    await writeFile(b, [line("b1")].join("\n"));
    const entries = await collect(concatJsonl([a, undefined, b]));
    expect(entries.map((e) => e.id)).toEqual(["a1", "a2", "b1"]);
  });
});
