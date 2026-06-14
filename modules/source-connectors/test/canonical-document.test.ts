import { describe, expect, it } from "vitest";
import {
  computeContentHash,
  computeDocumentId,
  inferContentType,
} from "../src/canonical-document";

describe("computeDocumentId", () => {
  it("is deterministic for identical source coordinates", () => {
    const a = computeDocumentId("filesystem", "/docs/x.md", "v1");
    const b = computeDocumentId("filesystem", "/docs/x.md", "v1");
    expect(a).toBe(b);
  });

  it("changes when any coordinate changes", () => {
    const base = computeDocumentId("filesystem", "/docs/x.md", "v1");
    expect(computeDocumentId("json", "/docs/x.md", "v1")).not.toBe(base);
    expect(computeDocumentId("filesystem", "/docs/y.md", "v1")).not.toBe(base);
    expect(computeDocumentId("filesystem", "/docs/x.md", "v2")).not.toBe(base);
  });

  it("does not collide across coordinate-boundary shifts", () => {
    // "a|b","c" vs "a","b|c" must not hash the same.
    expect(computeDocumentId("a", "b", "c")).not.toBe(computeDocumentId("a b", "", "c"));
  });
});

describe("computeContentHash", () => {
  it("is stable for identical content and differs otherwise", () => {
    expect(computeContentHash("hello")).toBe(computeContentHash("hello"));
    expect(computeContentHash("hello")).not.toBe(computeContentHash("world"));
  });
});

describe("inferContentType", () => {
  it("treats Markdown extensions as markdown", () => {
    expect(inferContentType("md")).toBe("markdown");
    expect(inferContentType(".markdown")).toBe("markdown");
    expect(inferContentType("MD")).toBe("markdown");
  });

  it("treats everything else as plaintext", () => {
    expect(inferContentType("txt")).toBe("plaintext");
    expect(inferContentType("text")).toBe("plaintext");
  });
});
