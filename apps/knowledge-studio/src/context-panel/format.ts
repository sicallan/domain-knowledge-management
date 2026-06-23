/**
 * Presentation helpers for the context panel — turning raw values into the user-friendly
 * indicators the spec calls for (confidence/lifecycle as words, not bare enums; D-P1.5's
 * two-tier quality model). Pure + unit-tested.
 */

export type Tone = "high" | "medium" | "low" | "neutral";

export interface Indicator {
  label: string;
  tone: Tone;
}

/** Confidence (0–1) → a high/medium/low band (criterion 5). */
export function confidenceIndicator(confidence?: number | null): Indicator | null {
  if (confidence === null || confidence === undefined || Number.isNaN(confidence)) return null;
  const pct = Math.round(confidence * 100);
  if (confidence >= 0.8) return { label: `High (${pct}%)`, tone: "high" };
  if (confidence >= 0.5) return { label: `Medium (${pct}%)`, tone: "medium" };
  return { label: `Low (${pct}%)`, tone: "low" };
}

/** Lifecycle status → a friendly label + tone (criterion 5). British spelling preserved. */
export function lifecycleIndicator(status?: string | null): Indicator {
  switch (status) {
    case "active":
      return { label: "Active", tone: "high" };
    case "draft":
      return { label: "Draft", tone: "medium" };
    case "deprecated":
      return { label: "Deprecated", tone: "low" };
    case "retired":
      return { label: "Retired", tone: "neutral" };
    default:
      return { label: status ?? "Unknown", tone: "neutral" };
  }
}

/** Format an ISO timestamp as a plain date; falls back to the raw value / em dash. */
export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 10);
}

/** `camelCase`/`snake_case` field key → "Title Case" label for display. */
export function humaniseFieldName(key: string): string {
  const spaced = key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Base/meta keys excluded from the "type-specific fields" view (shown elsewhere or internal). */
export const BASE_ENTRY_KEYS = new Set([
  "id",
  "type",
  "version",
  "lifecycle_status",
  "lifecycleStatus",
  "validFrom",
  "validTo",
  "transactionTime",
  "confidence",
  "createdAt",
  "updatedAt",
  "createdBy",
  "evidencedBy",
]);

/** Render an arbitrary JSON value compactly for a detail row. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
