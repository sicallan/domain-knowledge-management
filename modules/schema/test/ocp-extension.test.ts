import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defaultSchemaDir, SchemaRegistry, SchemaValidator } from "../src/index";

const here = dirname(fileURLToPath(import.meta.url));
const extensionDir = resolve(here, "fixtures/extension-schemas");

/**
 * OCP proof: a brand-new inventory type ("Widget") is introduced ONLY by adding a
 * schema file under an extra directory. No registry, validator, or existing-schema
 * code is touched, yet the new type is discovered and validated correctly.
 */
describe("OCP — new inventory type added without modifying existing code", () => {
  const registry = SchemaRegistry.fromDirectories([defaultSchemaDir(), extensionDir]);
  const validator = new SchemaValidator(registry);

  it("auto-discovers the new Widget type", () => {
    expect(registry.hasType("Widget")).toBe(true);
    expect(registry.listTypes().map((t) => t.type)).toContain("Widget");
  });

  it("still discovers all the original core types (no regression)", () => {
    expect(registry.hasType("Decision")).toBe(true);
    expect(registry.hasType("DomainConcept")).toBe(true);
  });

  it("validates a valid Widget entry (reusing the shared base-entry schema)", () => {
    const widget = {
      id: "33333333-3333-4333-8333-333333333333",
      type: "Widget",
      version: "1.0.0",
      lifecycle_status: "draft",
      validFrom: "2026-01-01T00:00:00Z",
      validTo: null,
      evidencedBy: [{ source: "widget-catalogue.md", fetchedAt: "2026-01-01T00:00:00Z" }],
      name: "Left-handed sprocket",
      widgetKind: "sprocket",
    };
    expect(validator.validate(widget, "Widget").valid).toBe(true);
  });

  it("rejects an invalid Widget entry (bad widgetKind enum)", () => {
    const widget = {
      id: "44444444-4444-4444-8444-444444444444",
      type: "Widget",
      version: "1.0.0",
      lifecycle_status: "draft",
      validFrom: "2026-01-01T00:00:00Z",
      evidencedBy: [{ source: "widget-catalogue.md", fetchedAt: "2026-01-01T00:00:00Z" }],
      name: "Mystery widget",
      widgetKind: "banana",
    };
    expect(validator.validate(widget, "Widget").valid).toBe(false);
  });
});
