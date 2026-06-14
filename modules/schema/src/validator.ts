import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { SchemaRegistry } from "./registry";
import type { JsonSchema, ValidationError, ValidationResult } from "./types";

const RELATIONSHIP_SCHEMA_ID = "https://dkm.dev/schemas/relationships/relationship.schema.json";

/**
 * Allowed lifecycle state transitions. A status may always stay the same.
 * draft → active → deprecated → retired, with draft → retired permitted (abandon).
 */
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["draft", "active", "retired"],
  active: ["active", "deprecated", "retired"],
  deprecated: ["deprecated", "active", "retired"],
  retired: ["retired"],
};

/**
 * SchemaValidator — wraps Ajv (Draft 2020-12) with every registered schema loaded
 * so cross-file `$ref`s resolve. Validates entries by inventory type, relationships,
 * and lifecycle transitions.
 */
export class SchemaValidator {
  private readonly ajv: Ajv2020;

  constructor(private readonly registry: SchemaRegistry) {
    this.ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(this.ajv);
    for (const schema of registry.allSchemas()) {
      const id = (schema as { $id?: string }).$id;
      // Skip re-adding if Ajv already knows this $id (idempotent across instances).
      if (id && this.ajv.getSchema(id)) continue;
      this.ajv.addSchema(schema as object);
    }
  }

  validate(entry: unknown, type: string, version?: string): ValidationResult {
    if (!this.registry.hasType(type)) {
      return {
        valid: false,
        errors: [
          {
            path: "/type",
            message: `Unknown inventory type: ${type}`,
            schemaPath: "",
            keyword: "type",
          },
        ],
      };
    }
    const schemaId = this.registry.getSchemaId(type);
    return this.runById(schemaId, entry, version);
  }

  validateRelationship(relationship: unknown): ValidationResult {
    return this.runById(RELATIONSHIP_SCHEMA_ID, relationship);
  }

  validateTransition(currentStatus: string, newStatus: string, _type?: string): ValidationResult {
    const allowed = ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed) {
      return {
        valid: false,
        errors: [
          {
            path: "/lifecycle_status",
            message: `Unknown lifecycle status: ${currentStatus}`,
            schemaPath: "",
            keyword: "enum",
          },
        ],
      };
    }
    if (!allowed.includes(newStatus)) {
      return {
        valid: false,
        errors: [
          {
            path: "/lifecycle_status",
            message: `Illegal lifecycle transition: ${currentStatus} → ${newStatus}`,
            schemaPath: "",
            keyword: "transition",
          },
        ],
      };
    }
    return { valid: true, errors: [] };
  }

  /** Validate against an arbitrary registered schema (used for ad-hoc support schemas). */
  validateAgainstSchemaId(schemaId: string, value: unknown): ValidationResult {
    return this.runById(schemaId, value);
  }

  private runById(schemaId: string, value: unknown, _version?: string): ValidationResult {
    const validateFn = this.ajv.getSchema(schemaId) as ValidateFunction | undefined;
    if (!validateFn) {
      return {
        valid: false,
        errors: [{ path: "", message: `No compiled schema for ${schemaId}`, schemaPath: "", keyword: "schema" }],
      };
    }
    const valid = validateFn(value) as boolean;
    if (valid) {
      return { valid: true, errors: [] };
    }
    return { valid: false, errors: (validateFn.errors ?? []).map(toValidationError) };
  }
}

function toValidationError(err: ErrorObject): ValidationError {
  return {
    path: err.instancePath || "/",
    message: err.message ?? "validation error",
    schemaPath: err.schemaPath,
    keyword: err.keyword,
  };
}

/** Convenience: a single object exposing the two registry-backed building blocks. */
export interface SchemaModule {
  registry: SchemaRegistry;
  validator: SchemaValidator;
}

export function buildSchemaModule(registry: SchemaRegistry): { registry: SchemaRegistry; validator: SchemaValidator } {
  return { registry, validator: new SchemaValidator(registry) };
}

export type { JsonSchema };
