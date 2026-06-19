import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SchemaRegistry } from "./registry";

export * from "./types";
export { SchemaRegistry } from "./registry";
export { SchemaValidator, buildSchemaModule } from "./validator";
export type { SchemaModule } from "./validator";
export {
  RelationshipTypeRegistry,
  registerBehaviouralRelationships,
  BEHAVIOURAL_RELATIONSHIP_DEFS,
} from "./relationships";
export type { RelationshipTypeDef } from "./relationships";

/** Absolute path to the repository's canonical `/schemas` directory. */
export function defaultSchemaDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // here = <repo>/modules/schema/src → ../../../schemas
  return resolve(here, "../../../schemas");
}

/** Convenience: a registry loaded from the repository's canonical schema directory. */
export function loadDefaultRegistry(): SchemaRegistry {
  return SchemaRegistry.fromDirectories([defaultSchemaDir()]);
}
