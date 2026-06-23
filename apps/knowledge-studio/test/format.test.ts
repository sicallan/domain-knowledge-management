import { describe, expect, it } from "vitest";
import {
  confidenceIndicator,
  formatDate,
  formatValue,
  humaniseFieldName,
  lifecycleIndicator,
} from "../src/context-panel/format";

describe("confidenceIndicator (criterion 5)", () => {
  it("bands confidence into high/medium/low with a percentage", () => {
    expect(confidenceIndicator(0.93)).toEqual({ label: "High (93%)", tone: "high" });
    expect(confidenceIndicator(0.6)).toEqual({ label: "Medium (60%)", tone: "medium" });
    expect(confidenceIndicator(0.2)).toEqual({ label: "Low (20%)", tone: "low" });
  });
  it("returns null when confidence is absent", () => {
    expect(confidenceIndicator(null)).toBeNull();
    expect(confidenceIndicator(undefined)).toBeNull();
  });
});

describe("lifecycleIndicator (criterion 5)", () => {
  it("maps statuses to friendly labels + tones", () => {
    expect(lifecycleIndicator("active")).toEqual({ label: "Active", tone: "high" });
    expect(lifecycleIndicator("deprecated")).toEqual({ label: "Deprecated", tone: "low" });
    expect(lifecycleIndicator("retired")).toEqual({ label: "Retired", tone: "neutral" });
  });
});

describe("formatters", () => {
  it("formats an ISO timestamp as a date", () => {
    expect(formatDate("2026-06-15T00:00:00Z")).toBe("2026-06-15");
    expect(formatDate(null)).toBe("—");
  });
  it("humanises field keys", () => {
    expect(humaniseFieldName("decisionType")).toBe("Decision Type");
    expect(humaniseFieldName("owning_service")).toBe("Owning service");
  });
  it("formats scalar and array values", () => {
    expect(formatValue(["Approved", "Declined"])).toBe("Approved, Declined");
    expect(formatValue("automated")).toBe("automated");
    expect(formatValue(null)).toBe("—");
  });
});
