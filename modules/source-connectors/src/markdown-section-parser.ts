import type { DocumentSection } from "./canonical-document";

const ATX_HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

interface HeadingHit {
  level: number;
  title: string;
  startOffset: number;
}

/**
 * Parse Markdown into a flat list of {@link DocumentSection}s, one per ATX
 * heading (`#`…`######`). The heading hierarchy is captured by each section's
 * `level`; a section spans from its heading to the start of the next heading
 * (or end of document). Hash characters inside fenced code blocks are ignored.
 *
 * When the document has no headings, a single section covering the whole content
 * is returned (level 1) so every document yields at least one section.
 */
export function parseMarkdownSections(content: string, idPrefix = "section"): DocumentSection[] {
  const headings: HeadingHit[] = [];
  let offset = 0;
  let inFence = false;

  for (const line of content.split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence;
    } else if (!inFence) {
      const match = ATX_HEADING.exec(line);
      if (match) {
        headings.push({
          level: match[1]!.length,
          title: match[2]!.trim(),
          startOffset: offset,
        });
      }
    }
    // +1 restores the newline removed by split.
    offset += line.length + 1;
  }

  if (headings.length === 0) {
    return [
      {
        id: `${idPrefix}-0`,
        title: "",
        content,
        startOffset: 0,
        endOffset: content.length,
        level: 1,
      },
    ];
  }

  return headings.map((heading, index) => {
    const startOffset = heading.startOffset;
    const endOffset = headings[index + 1]?.startOffset ?? content.length;
    return {
      id: `${idPrefix}-${index}`,
      title: heading.title,
      content: content.slice(startOffset, endOffset),
      startOffset,
      endOffset,
      level: heading.level,
    };
  });
}

/** The first H1 (or, failing that, the first heading of any level), if present. */
export function firstHeadingTitle(content: string): string | undefined {
  const sections = parseMarkdownSections(content);
  const h1 = sections.find((s) => s.level === 1 && s.title.length > 0);
  if (h1) return h1.title;
  const any = sections.find((s) => s.title.length > 0);
  return any?.title;
}
