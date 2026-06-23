import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoverageLegend } from "../src/components/CoverageLegend";

const tokensCss = readFileSync(join(import.meta.dirname, "../src/styles/tokens.css"), "utf8");

describe("design tokens (criterion 5)", () => {
  it("defines the RAG coverage palette + base shadcn tokens", () => {
    for (const token of [
      "--coverage-covered",
      "--coverage-partial",
      "--coverage-uncovered",
      "--background",
      "--foreground",
      "--primary",
      "--border",
    ]) {
      expect(tokensCss).toContain(token);
    }
  });

  it("a sample component applies the RAG palette token classes", () => {
    const { container, getByText } = render(<CoverageLegend />);
    expect(getByText("Covered")).toBeInTheDocument();
    // The legend swatches consume the shared coverage tokens (Tailwind colour classes).
    expect(container.innerHTML).toContain("bg-coverage-covered");
    expect(container.innerHTML).toContain("bg-coverage-uncovered");
  });
});
