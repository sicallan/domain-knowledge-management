import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** A single entry fixture: validated against its inventory type schema. */
export interface EntryCase {
  name: string;
  type: string;
  expectValid: boolean;
  payload: Record<string, unknown>;
}

/** A single relationship fixture: validated against a relationship schema by $id. */
export interface RelationshipCase {
  name: string;
  schemaId: string;
  expectValid: boolean;
  payload: Record<string, unknown>;
}

interface FixtureFile {
  entries: EntryCase[];
  relationships: RelationshipCase[];
}

const here = dirname(fileURLToPath(import.meta.url));
// here = <repo>/modules/schema/test → ../../../fixtures/parity/<suite>/cases.json
const FIXTURE_ROOT = resolve(here, "../../..", "fixtures/parity");

/**
 * Load a unified cross-validator fixture suite (spec 001 Decision 3). The very same
 * file is read by the Python `jsonschema` parity test, so a divergence between the two
 * ecosystems surfaces as a failed `expectValid` assertion in one of them. Each phase
 * adds its own suite directory (`behaviour`, `l2`, …) — additive, never edits an
 * existing suite.
 */
function loadSuite(suite: string): FixtureFile {
  const raw = readFileSync(resolve(FIXTURE_ROOT, suite, "cases.json"), "utf-8");
  const parsed = JSON.parse(raw) as FixtureFile;
  return { entries: parsed.entries, relationships: parsed.relationships };
}

/** Phase 2.1 behaviour + decision suite. */
export function loadParityFixtures(): FixtureFile {
  return loadSuite("behaviour");
}

/** Phase 3.1 L2 vendor/project suite. */
export function loadL2ParityFixtures(): FixtureFile {
  return loadSuite("l2");
}

function findEntry(file: FixtureFile, name: string): EntryCase {
  const found = file.entries.find((c) => c.name === name);
  if (!found) throw new Error(`No entry fixture named '${name}'`);
  return found;
}

function findRelationship(file: FixtureFile, name: string): RelationshipCase {
  const found = file.relationships.find((c) => c.name === name);
  if (!found) throw new Error(`No relationship fixture named '${name}'`);
  return found;
}

export function entryCase(name: string): EntryCase {
  return findEntry(loadParityFixtures(), name);
}

export function relationshipCase(name: string): RelationshipCase {
  return findRelationship(loadParityFixtures(), name);
}

export function l2EntryCase(name: string): EntryCase {
  return findEntry(loadL2ParityFixtures(), name);
}

export function l2RelationshipCase(name: string): RelationshipCase {
  return findRelationship(loadL2ParityFixtures(), name);
}
