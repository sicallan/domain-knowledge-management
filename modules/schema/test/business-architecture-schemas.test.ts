import { describe, expect, it } from "vitest";
import { loadModule, makeEntry } from "./helpers";

// Feature 08 (#86) scope addition — the Business-Architecture Lens (ADR-0009).
// Two additive L1 schemas underpin the lens; both are new files only, auto-discovered
// by the registry (the OCP point). These tests are written first and must pass once the
// two schema files exist.
//
//   ReferenceCapability      — the curated, versioned spine (L1 domain / L2 capability),
//                              hand-authored + framework-attributed; NOT extracted evidence.
//   CapabilityClassification — one per raw BusinessCapability: places it under the spine
//                              (assignedLevel 2–4) or rejects it (with a reason). The
//                              materialised judgment the EA tree projects over.

const { registry, validator } = loadModule();

describe("Business-architecture schemas are auto-discovered (OCP)", () => {
  it("registers both new L1 types without any registry code change", () => {
    expect(registry.hasType("ReferenceCapability")).toBe(true);
    expect(registry.hasType("CapabilityClassification")).toBe(true);
    expect(registry.layerOf("ReferenceCapability")).toBe("L1");
    expect(registry.layerOf("CapabilityClassification")).toBe("L1");
  });
});

describe("ReferenceCapability schema validation", () => {
  it("accepts a valid L1 enterprise domain", () => {
    const result = validator.validate(
      makeEntry("ReferenceCapability", { name: "Investment Management", level: 1, framework: "BIZBOK" }),
      "ReferenceCapability",
    );
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("accepts a valid L2 capability with a parent domain", () => {
    const result = validator.validate(
      makeEntry("ReferenceCapability", {
        name: "Portfolio Management",
        level: 2,
        parent: "Investment Management",
        framework: "APQC",
      }),
      "ReferenceCapability",
    );
    expect(result.valid).toBe(true);
  });

  it("rejects a ReferenceCapability missing the required name", () => {
    const result = validator.validate(
      makeEntry("ReferenceCapability", { level: 1, framework: "BIZBOK" }),
      "ReferenceCapability",
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "required")).toBe(true);
  });

  it("rejects a ReferenceCapability missing the required level", () => {
    const result = validator.validate(
      makeEntry("ReferenceCapability", { name: "Investment Management", framework: "BIZBOK" }),
      "ReferenceCapability",
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "required")).toBe(true);
  });

  it("rejects a spine node below L2 — the spine is L1+L2 only (level max 2)", () => {
    const result = validator.validate(
      makeEntry("ReferenceCapability", { name: "Portfolio Construction", level: 3, framework: "BIZBOK" }),
      "ReferenceCapability",
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "maximum")).toBe(true);
  });

  it("rejects an unknown framework", () => {
    const result = validator.validate(
      makeEntry("ReferenceCapability", { name: "Investment Management", level: 1, framework: "MadeUp" }),
      "ReferenceCapability",
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "enum")).toBe(true);
  });

  it("enforces the type const (rejects a wrong discriminator)", () => {
    const entry = makeEntry("ReferenceCapability", {
      name: "Investment Management",
      level: 1,
      framework: "BIZBOK",
      type: "BusinessCapability",
    });
    const result = validator.validate(entry, "ReferenceCapability");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "const")).toBe(true);
  });
});

describe("CapabilityClassification schema validation", () => {
  it("accepts a valid 'placed' classification (an L4 activity under a capability)", () => {
    const result = validator.validate(
      makeEntry("CapabilityClassification", {
        subject: "bc-agm-engagement",
        disposition: "placed",
        assignedParent: "Stewardship",
        assignedLevel: 4,
        rationale: "AGM engagement is an activity carried out under Stewardship, not a capability.",
      }),
      "CapabilityClassification",
    );
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("accepts a valid 'rejected' classification with a reason", () => {
    const result = validator.validate(
      makeEntry("CapabilityClassification", {
        subject: "bc-vanguard-investor-choice",
        disposition: "rejected",
        rejectionReason: "generic-mention",
        rationale: "A vendor-branded programme name, not a capability of the business.",
      }),
      "CapabilityClassification",
    );
    expect(result.valid).toBe(true);
  });

  it("rejects a classification missing the required subject", () => {
    const result = validator.validate(
      makeEntry("CapabilityClassification", { disposition: "rejected", rationale: "x" }),
      "CapabilityClassification",
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "required")).toBe(true);
  });

  it("rejects a classification missing the required rationale", () => {
    const result = validator.validate(
      makeEntry("CapabilityClassification", { subject: "bc-x", disposition: "placed", assignedLevel: 3 }),
      "CapabilityClassification",
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "required")).toBe(true);
  });

  it("rejects an unknown disposition", () => {
    const result = validator.validate(
      makeEntry("CapabilityClassification", { subject: "bc-x", disposition: "maybe", rationale: "x" }),
      "CapabilityClassification",
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "enum")).toBe(true);
  });

  it("rejects an unknown rejectionReason", () => {
    const result = validator.validate(
      makeEntry("CapabilityClassification", {
        subject: "bc-x",
        disposition: "rejected",
        rejectionReason: "dunno",
        rationale: "x",
      }),
      "CapabilityClassification",
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "enum")).toBe(true);
  });

  it("rejects an assignedLevel outside the 2–4 tree range", () => {
    const result = validator.validate(
      makeEntry("CapabilityClassification", {
        subject: "bc-x",
        disposition: "placed",
        assignedParent: "Stewardship",
        assignedLevel: 5,
        rationale: "x",
      }),
      "CapabilityClassification",
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "maximum")).toBe(true);
  });

  it("enforces the type const (rejects a wrong discriminator)", () => {
    const entry = makeEntry("CapabilityClassification", {
      subject: "bc-x",
      disposition: "rejected",
      rationale: "x",
      type: "BusinessCapability",
    });
    const result = validator.validate(entry, "CapabilityClassification");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "const")).toBe(true);
  });
});
