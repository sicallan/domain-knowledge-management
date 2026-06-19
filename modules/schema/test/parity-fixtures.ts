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
// here = <repo>/modules/schema/test → ../../../fixtures/parity/behaviour
const FIXTURE_PATH = resolve(here, "../../..", "fixtures/parity/behaviour/cases.json");

/**
 * Load the unified cross-validator fixture set (spec 001 Decision 3). The very same
 * file is read by the Python `jsonschema` parity test, so a divergence between the two
 * ecosystems surfaces as a failed `expectValid` assertion in one of them.
 */
export function loadParityFixtures(): FixtureFile {
  const raw = readFileSync(FIXTURE_PATH, "utf-8");
  const parsed = JSON.parse(raw) as FixtureFile;
  return { entries: parsed.entries, relationships: parsed.relationships };
}

export function entryCase(name: string): EntryCase {
  const found = loadParityFixtures().entries.find((c) => c.name === name);
  if (!found) throw new Error(`No entry fixture named '${name}'`);
  return found;
}

export function relationshipCase(name: string): RelationshipCase {
  const found = loadParityFixtures().relationships.find((c) => c.name === name);
  if (!found) throw new Error(`No relationship fixture named '${name}'`);
  return found;
}
