import { cn } from "../lib/cn";
import {
  BASE_ENTRY_KEYS,
  confidenceIndicator,
  formatDate,
  formatValue,
  humaniseFieldName,
  type Indicator,
  lifecycleIndicator,
  type Tone,
} from "./format";
import type { EntryDetail as EntryDetailData } from "./useEntry";

const TONE_CLASS: Record<Tone, string> = {
  high: "bg-coverage-covered/15 text-coverage-covered",
  medium: "bg-coverage-partial/20 text-coverage-partial",
  low: "bg-coverage-uncovered/15 text-coverage-uncovered",
  neutral: "bg-muted text-muted-foreground",
};

function Badge({ indicator }: { indicator: Indicator }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", TONE_CLASS[indicator.tone])}>
      {indicator.label}
    </span>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className={cn("break-words", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}

/**
 * The entry detail (criteria 1 + 5): base-entry metadata + type-specific fields (from the
 * `data` JSON), with confidence/lifecycle shown as user-friendly indicators. British-spelling
 * domain terms are preserved as stored.
 */
export function EntryDetail({ entry }: { entry: EntryDetailData }) {
  const lifecycle = lifecycleIndicator(entry.lifecycleStatus);
  const confidence = confidenceIndicator(entry.confidence);
  const name = typeof entry.data.name === "string" ? entry.data.name : entry.id;
  const typeSpecific = Object.entries(entry.data).filter(
    ([key]) => !BASE_ENTRY_KEYS.has(key) && key !== "name",
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase text-muted-foreground">{entry.type}</div>
        <h3 className="text-lg font-semibold">{name}</h3>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge indicator={lifecycle} />
        {confidence && <Badge indicator={confidence} />}
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <Field label="Version" value={entry.version} />
        <Field label="Valid from" value={formatDate(entry.validFrom)} />
        {entry.validTo ? <Field label="Valid to" value={formatDate(entry.validTo)} /> : null}
        <Field label="ID" value={entry.id} mono />
      </dl>

      {typeSpecific.length > 0 && (
        <div>
          <h4 className="text-xs uppercase text-muted-foreground">Details</h4>
          <dl className="mt-1 space-y-1 text-sm">
            {typeSpecific.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{humaniseFieldName(key)}</dt>
                <dd className="break-words text-right">{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
