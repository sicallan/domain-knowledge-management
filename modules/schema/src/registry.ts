import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import type { JsonSchema, SchemaLayer, SchemaVersion, TypeMetadata } from "./types";

interface DiscoveredSchema {
  schema: JsonSchema;
  path: string;
  schemaId: string;
  layer: SchemaLayer;
  type?: string;
  title?: string;
  version: string;
}

const DEFAULT_ENTRY_VERSION = "1.0.0";

/**
 * SchemaRegistry — auto-discovers JSON Schema files from the filesystem (pure
 * convention, per spec 001 Decision 4). Adding a new inventory type means adding
 * a `.schema.json` file with a `type` const; no registry code changes (OCP).
 */
export class SchemaRegistry {
  private readonly byType = new Map<string, DiscoveredSchema>();
  private readonly all: DiscoveredSchema[] = [];

  private constructor(discovered: DiscoveredSchema[]) {
    for (const d of discovered) {
      this.all.push(d);
      if (d.type) {
        this.byType.set(d.type, d);
      }
    }
  }

  /** Build a registry by recursively discovering schemas under the given directories. */
  static fromDirectories(dirs: string[]): SchemaRegistry {
    const discovered: DiscoveredSchema[] = [];
    const seenIds = new Set<string>();
    for (const dir of dirs) {
      for (const file of walk(dir)) {
        const raw = readFileSync(file, "utf-8");
        const schema = JSON.parse(raw) as JsonSchema;
        const schemaId = typeof schema.$id === "string" ? schema.$id : file;
        if (seenIds.has(schemaId)) {
          throw new Error(`Duplicate schema $id discovered: ${schemaId}`);
        }
        seenIds.add(schemaId);
        discovered.push({
          schema,
          path: file,
          schemaId,
          layer: layerFromPath(file),
          type: extractTypeConst(schema),
          title: typeof schema.title === "string" ? schema.title : undefined,
          version: typeof schema["x-version"] === "string" ? schema["x-version"] : DEFAULT_ENTRY_VERSION,
        });
      }
    }
    return new SchemaRegistry(discovered);
  }

  /** Every discovered schema (including non-typed support schemas like base-entry). */
  allSchemas(): JsonSchema[] {
    return this.all.map((d) => d.schema);
  }

  getSchema(type: string, _version?: string): JsonSchema {
    const found = this.byType.get(type);
    if (!found) {
      throw new Error(`Unknown inventory type: ${type}`);
    }
    return found.schema;
  }

  /** The $id used to look the schema up in the validator. */
  getSchemaId(type: string): string {
    const found = this.byType.get(type);
    if (!found) {
      throw new Error(`Unknown inventory type: ${type}`);
    }
    return found.schemaId;
  }

  listTypes(): TypeMetadata[] {
    return [...this.byType.values()]
      .map((d) => ({
        type: d.type as string,
        layer: d.layer,
        schemaId: d.schemaId,
        title: d.title,
        version: d.version,
      }))
      .sort((a, b) => a.type.localeCompare(b.type));
  }

  getVersionHistory(type: string): SchemaVersion[] {
    const found = this.byType.get(type);
    if (!found) {
      return [];
    }
    return [{ version: found.version, schemaId: found.schemaId }];
  }

  hasType(type: string): boolean {
    return this.byType.has(type);
  }

  layerOf(type: string): SchemaLayer {
    return this.byType.get(type)?.layer ?? "unknown";
  }
}

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (entry.endsWith(".schema.json")) {
      yield full;
    }
  }
}

function layerFromPath(file: string): SchemaLayer {
  const parts = file.split(sep);
  if (parts.includes("relationships")) return "relationships";
  if (parts.includes("common")) return "common";
  for (const layer of ["L0", "L1", "L2", "L3"] as const) {
    if (parts.includes(layer)) return layer;
  }
  return "unknown";
}

/**
 * Extract the `type` discriminator a schema pins via `const`, whether declared
 * at the top level or inside an `allOf` branch. Support schemas (base-entry,
 * provenance, temporal) have no such const and return undefined.
 */
function extractTypeConst(schema: JsonSchema): string | undefined {
  const fromProps = (s: unknown): string | undefined => {
    if (!s || typeof s !== "object") return undefined;
    const props = (s as { properties?: Record<string, unknown> }).properties;
    const typeProp = props?.type as { const?: unknown } | undefined;
    return typeof typeProp?.const === "string" ? typeProp.const : undefined;
  };

  const direct = fromProps(schema);
  if (direct) return direct;

  const allOf = (schema as { allOf?: unknown[] }).allOf;
  if (Array.isArray(allOf)) {
    for (const branch of allOf) {
      const t = fromProps(branch);
      if (t) return t;
    }
  }
  return undefined;
}
