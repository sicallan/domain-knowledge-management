import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PdfConnector } from "../src/pdf-connector";
import { createConnectorRegistry } from "../src/register-connectors";
import type { SourceConfig } from "../src/port";

/** Write a text PDF (one page per line) into `dir`. */
async function writePdf(dir: string, name: string, pages: string[]): Promise<void> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const line of pages) {
    const page = doc.addPage([400, 200]);
    page.drawText(line, { x: 40, y: 120, size: 12, font });
  }
  await writeFile(join(dir, name), await doc.save());
}

/** Write a PDF with a page but no text layer (a scanned-PDF stand-in). */
async function writeTextlessPdf(dir: string, name: string): Promise<void> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]); // a blank page — no drawText, so no extractable text
  await writeFile(join(dir, name), await doc.save());
}

function config(rootPath: string): SourceConfig {
  return {
    id: "pdf-test",
    type: "pdf",
    connectionDetails: { rootPath },
    filters: [],
    sourceAuthority: "operational",
  };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pdf-conn-"));
});
afterEach(() => {
  // temp dirs are reaped by the OS; nothing to clean between tests
});

describe("PdfConnector", () => {
  it("is registered as the `pdf` connector (OCP)", () => {
    const registry = createConnectorRegistry();
    expect(registry.hasConnector("pdf")).toBe(true);
    expect(registry.getConnector("pdf").supportedFormats).toContain("pdf");
  });

  it("extracts a text PDF into a Markdown CanonicalDocument with per-page sections", async () => {
    await writePdf(dir, "authorisation.pdf", [
      "Authorisation must not exceed the available balance.",
      "Settlement runs in overnight batches.",
    ]);
    const connector = new PdfConnector();
    await connector.initialize(config(dir));
    const result = await connector.ingest();

    expect(result.documents).toHaveLength(1);
    const doc = result.documents[0]!;
    expect(doc.sourceType).toBe("pdf");
    expect(doc.contentType).toBe("markdown");
    expect(doc.title).toBe("authorisation");
    expect(doc.content).toContain("Authorisation must not exceed the available balance.");
    expect(doc.content).toContain("Settlement runs in overnight batches.");
    // One section per page (## Page N) for downstream chunking (plus the H1 title section).
    const sectionTitles = doc.sections?.map((s) => s.title) ?? [];
    expect(sectionTitles).toContain("Page 1");
    expect(sectionTitles).toContain("Page 2");
    expect(doc.sourceAuthority).toBe("operational");
  });

  it("skips-and-reports a PDF with no extractable text (scanned/image-only)", async () => {
    await writeTextlessPdf(dir, "scanned.pdf");
    const connector = new PdfConnector();
    await connector.initialize(config(dir));
    const result = await connector.ingest();

    expect(result.documents).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error).toMatch(/no extractable text/i);
    expect(result.errors[0]!.documentPath).toMatch(/scanned\.pdf$/);
  });

  it("only picks up *.pdf (ignores other files in the folder)", async () => {
    await writePdf(dir, "doc.pdf", ["hello pdf"]);
    await writeFile(join(dir, "notes.md"), "# Not a PDF");
    const connector = new PdfConnector();
    await connector.initialize(config(dir));
    const result = await connector.ingest();
    expect(result.documents.map((d) => d.sourcePath.endsWith(".pdf"))).toEqual([true]);
  });

  it("incrementally skips an unchanged PDF on a second run", async () => {
    await writePdf(dir, "doc.pdf", ["hello pdf"]);
    const connector = new PdfConnector();
    await connector.initialize(config(dir));

    const first = await connector.ingest();
    expect(first.documents).toHaveLength(1);
    const second = await connector.ingest(first.state);
    expect(second.documents).toHaveLength(0);
    expect(second.stats.skipped).toBe(1);
  });
});
