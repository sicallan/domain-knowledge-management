import { describe, expect, it } from "vitest";
import { parseMarkdownSections } from "../src/markdown-section-parser";

describe("parseMarkdownSections", () => {
  it("maps a heading hierarchy to flat sections with correct levels and titles", () => {
    const md = ["# Title", "intro", "## Section A", "body a", "## Section B", "body b"].join("\n");
    const sections = parseMarkdownSections(md);
    expect(sections.map((s) => [s.level, s.title])).toEqual([
      [1, "Title"],
      [2, "Section A"],
      [2, "Section B"],
    ]);
  });

  it("produces offsets that slice back to the section content and are contiguous", () => {
    const md = ["# A", "alpha", "## B", "beta"].join("\n");
    const sections = parseMarkdownSections(md);
    expect(sections[0]?.startOffset).toBe(0);
    for (const s of sections) {
      expect(md.slice(s.startOffset, s.endOffset)).toBe(s.content);
      expect(s.endOffset).toBeGreaterThan(s.startOffset);
    }
    // Contiguous: each section ends where the next begins; last reaches EOF.
    expect(sections[0]?.endOffset).toBe(sections[1]?.startOffset);
    expect(sections[sections.length - 1]?.endOffset).toBe(md.length);
  });

  it("supports deeper nesting levels", () => {
    const md = ["# H1", "## H2", "### H3"].join("\n");
    expect(parseMarkdownSections(md).map((s) => s.level)).toEqual([1, 2, 3]);
  });

  it("ignores hash characters inside fenced code blocks", () => {
    const md = ["# Real", "```", "# not a heading", "```", "## Also Real"].join("\n");
    const sections = parseMarkdownSections(md);
    expect(sections.map((s) => s.title)).toEqual(["Real", "Also Real"]);
  });

  it("falls back to a single section when there are no headings", () => {
    const md = "just some plain text\nwith two lines";
    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.level).toBe(1);
    expect(sections[0]?.startOffset).toBe(0);
    expect(sections[0]?.endOffset).toBe(md.length);
    expect(sections[0]?.content).toBe(md);
  });

  it("derives deterministic, unique section ids from the prefix", () => {
    const md = ["# A", "## B"].join("\n");
    const first = parseMarkdownSections(md, "doc1");
    const again = parseMarkdownSections(md, "doc1");
    expect(first.map((s) => s.id)).toEqual(again.map((s) => s.id));
    expect(new Set(first.map((s) => s.id)).size).toBe(first.length);
    expect(first[0]?.id).toContain("doc1");
  });
});
