import { loadDefaultRegistry, SchemaValidator } from "../src/index";
import type { InventoryEntry } from "../src/index";

/** A registry + validator loaded from the repository's canonical /schemas directory. */
export function loadModule(): { validator: SchemaValidator; registry: ReturnType<typeof loadDefaultRegistry> } {
  const registry = loadDefaultRegistry();
  return { registry, validator: new SchemaValidator(registry) };
}

let counter = 0;
function uuid(): string {
  counter += 1;
  const n = counter.toString(16).padStart(12, "0");
  return `11111111-1111-4111-8111-${n}`;
}

/** Build a structurally valid base entry, merged with type-specific overrides. */
export function makeEntry(type: string, overrides: Record<string, unknown>): InventoryEntry {
  return {
    id: uuid(),
    type,
    version: "1.0.0",
    lifecycle_status: "active",
    validFrom: "2026-01-01T00:00:00Z",
    validTo: null,
    evidencedBy: [
      { source: "payments-spec.md", location: "§2", fetchedAt: "2026-01-01T00:00:00Z", sourceAuthority: "scheme" },
    ],
    confidence: 0.9,
    ...overrides,
  } as InventoryEntry;
}
