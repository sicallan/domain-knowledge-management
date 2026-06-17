import { describe, expect, it } from "vitest";
import { loadModule, makeEntry } from "./helpers";

// Feature #9 scope addition: Subdomain and BoundedContext are introduced as real,
// first-class, additive L1 inventory schemas (new files only — the registry
// auto-discovers them, which is the OCP point). These tests are written first and
// must pass once the two schema files exist; they assert the schemas validate
// correct instances, pin the `type` const, and require the mandatory properties.

const { registry, validator } = loadModule();

describe("Subdomain / BoundedContext schemas are auto-discovered (OCP)", () => {
  it("registers both new L1 types without any registry code change", () => {
    expect(registry.hasType("Subdomain")).toBe(true);
    expect(registry.hasType("BoundedContext")).toBe(true);
    expect(registry.layerOf("Subdomain")).toBe("L1");
    expect(registry.layerOf("BoundedContext")).toBe("L1");
  });
});

describe("Subdomain schema validation", () => {
  it("accepts a valid Subdomain", () => {
    const result = validator.validate(
      makeEntry("Subdomain", { name: "Payments", description: "Core payments subdomain" }),
      "Subdomain",
    );
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("accepts a minimal Subdomain (name only)", () => {
    const result = validator.validate(makeEntry("Subdomain", { name: "Risk & Fraud" }), "Subdomain");
    expect(result.valid).toBe(true);
  });

  it("rejects a Subdomain missing the required name", () => {
    const result = validator.validate(makeEntry("Subdomain", {}), "Subdomain");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "required")).toBe(true);
  });

  it("enforces the type const (rejects a wrong discriminator)", () => {
    const entry = makeEntry("Subdomain", { name: "Payments", type: "NotSubdomain" });
    const result = validator.validate(entry, "Subdomain");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "const")).toBe(true);
  });
});

describe("BoundedContext schema validation", () => {
  it("accepts a valid BoundedContext with its denormalised subdomain", () => {
    const result = validator.validate(
      makeEntry("BoundedContext", {
        name: "Authorisation",
        subdomain: "sd-payments",
        description: "Authorisation bounded context",
      }),
      "BoundedContext",
    );
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("accepts a minimal BoundedContext (name only)", () => {
    const result = validator.validate(makeEntry("BoundedContext", { name: "Settlement" }), "BoundedContext");
    expect(result.valid).toBe(true);
  });

  it("rejects a BoundedContext missing the required name", () => {
    const result = validator.validate(makeEntry("BoundedContext", { subdomain: "sd-payments" }), "BoundedContext");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "required")).toBe(true);
  });

  it("enforces the type const (rejects a wrong discriminator)", () => {
    const entry = makeEntry("BoundedContext", { name: "Authorisation", type: "Subdomain" });
    const result = validator.validate(entry, "BoundedContext");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "const")).toBe(true);
  });
});
