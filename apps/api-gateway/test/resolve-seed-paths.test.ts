import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSeedJsonlPaths, SEED_JSONL_PATHS } from "../src/seed";

/**
 * The QUICKSTART / docker-compose data-source resolution: explicit `DKM_JSONL` →
 * `DKM_DATA_DIR/*.jsonl` → the bundled demo. This is the one piece of real logic behind
 * "point the gateway at your domain's data instead of the Payments demo".
 */
describe("resolveSeedJsonlPaths()", () => {
  it("defaults to the bundled Payments demo when no env is set", () => {
    expect(resolveSeedJsonlPaths({})).toEqual(SEED_JSONL_PATHS);
  });

  it("honours explicit comma-separated DKM_JSONL (absolutised, blanks dropped)", () => {
    const paths = resolveSeedJsonlPaths({ DKM_JSONL: " a.jsonl , ,b.jsonl " });
    expect(paths).toEqual([resolve("a.jsonl"), resolve("b.jsonl")]);
  });

  it("serves every *.jsonl in DKM_DATA_DIR, sorted, ignoring non-JSONL", () => {
    const dir = mkdtempSync(join(tmpdir(), "dkm-data-"));
    writeFileSync(join(dir, "relationships.jsonl"), "");
    writeFileSync(join(dir, "extractions.jsonl"), "");
    writeFileSync(join(dir, "notes.md"), "ignore me");

    expect(resolveSeedJsonlPaths({ DKM_DATA_DIR: dir })).toEqual([
      join(dir, "extractions.jsonl"),
      join(dir, "relationships.jsonl"),
    ]);
  });

  it("falls back to the demo when DKM_DATA_DIR holds no JSONL (fresh mount)", () => {
    const empty = mkdtempSync(join(tmpdir(), "dkm-empty-"));
    expect(resolveSeedJsonlPaths({ DKM_DATA_DIR: empty })).toEqual(SEED_JSONL_PATHS);
  });

  it("falls back to the demo when DKM_DATA_DIR does not exist", () => {
    expect(resolveSeedJsonlPaths({ DKM_DATA_DIR: "/no/such/dir/here" })).toEqual(SEED_JSONL_PATHS);
  });

  it("DKM_JSONL takes precedence over DKM_DATA_DIR", () => {
    const paths = resolveSeedJsonlPaths({ DKM_JSONL: "x.jsonl", DKM_DATA_DIR: "/whatever" });
    expect(paths).toEqual([resolve("x.jsonl")]);
  });

  it("serves a processed domain at <DKM_DATA_DIR>/<DKM_DOMAIN>/*.jsonl", () => {
    const root = mkdtempSync(join(tmpdir(), "dkm-root-"));
    const lending = join(root, "lending");
    mkdirSync(lending);
    writeFileSync(join(lending, "extractions.jsonl"), "");
    writeFileSync(join(lending, "relationships.jsonl"), "");

    expect(resolveSeedJsonlPaths({ DKM_DATA_DIR: root, DKM_DOMAIN: "lending" })).toEqual([
      join(lending, "extractions.jsonl"),
      join(lending, "relationships.jsonl"),
    ]);
  });

  it("falls back from an unprocessed DKM_DOMAIN to the data root, then the demo", () => {
    const root = mkdtempSync(join(tmpdir(), "dkm-root2-"));
    // DKM_DOMAIN points at a not-yet-processed (absent) subdir → no domain JSONL…
    writeFileSync(join(root, "extractions.jsonl"), ""); // …but the data root has some.
    expect(resolveSeedJsonlPaths({ DKM_DATA_DIR: root, DKM_DOMAIN: "absent" })).toEqual([
      join(root, "extractions.jsonl"),
    ]);
    // And with neither domain nor root populated, the demo.
    const empty = mkdtempSync(join(tmpdir(), "dkm-root3-"));
    expect(resolveSeedJsonlPaths({ DKM_DATA_DIR: empty, DKM_DOMAIN: "absent" })).toEqual(SEED_JSONL_PATHS);
  });
});
