import { http, HttpResponse } from "msw";
import { setupWorker } from "msw/browser";

/**
 * The MSW **browser** worker (standalone dev, `VITE_USE_MOCKS=true`). Unlike the node/test
 * handler (`handlers.ts`), it must **not** import `@dkm/api-gateway` — that backend pulls
 * `node:fs`/`node:crypto` and cannot run in (or bundle for) the browser. Standalone dev
 * therefore serves a tiny static fixture; full seed parity in-browser (bundling the demo
 * JSONL, or running the gateway schema over a browser-safe store) is tracked as a follow-up.
 * The richer path is the **live `@dkm/api-gateway` dev server** (Feature 02), which needs no
 * worker. Requires the generated `public/mockServiceWorker.js` (`pnpm dlx msw init public/`).
 */

const STANDALONE_FIXTURE: Record<string, unknown> = {
  domainMap: {
    subdomains: [
      {
        id: "sd-payments",
        name: "Payments",
        contexts: [
          {
            id: "bc-authorisation",
            name: "Authorisation",
            conceptCount: 4,
            serviceCount: 1,
            relationships: [{ targetContextId: "bc-fraud", type: "checks" }],
          },
          { id: "bc-settlement", name: "Settlement", conceptCount: 3, serviceCount: 1, relationships: [] },
          { id: "bc-refunds", name: "Refunds", conceptCount: 2, serviceCount: 0, relationships: [] },
        ],
      },
      {
        id: "sd-risk",
        name: "Risk & Fraud",
        contexts: [{ id: "bc-fraud", name: "Fraud Scoring", conceptCount: 2, serviceCount: 1, relationships: [] }],
      },
    ],
    crossContextRelationships: [
      { source: "bc-authorisation", target: "bc-fraud", type: "checks", strength: 2 },
    ],
  },
  capabilityMap: {
    roots: [
      {
        id: "cap-payments",
        name: "Payments Processing",
        level: 1,
        orphaned: false,
        descendantCount: 2,
        counts: { rules: 0, invariants: 0, decisions: 0, concepts: 0, realisations: 0 },
        children: [
          {
            id: "cap-authz-cap",
            name: "Authorisation",
            level: 2,
            orphaned: false,
            descendantCount: 0,
            counts: { rules: 1, invariants: 0, decisions: 1, concepts: 0, realisations: 1 },
            children: [],
          },
          {
            id: "cap-settle-cap",
            name: "Settlement",
            level: 2,
            orphaned: false,
            descendantCount: 0,
            counts: { rules: 0, invariants: 0, decisions: 0, concepts: 0, realisations: 0 },
            children: [],
          },
        ],
      },
      {
        id: "cap-risk-comp",
        name: "Risk & Compliance",
        level: 1,
        orphaned: false,
        descendantCount: 1,
        counts: { rules: 0, invariants: 0, decisions: 0, concepts: 0, realisations: 0 },
        children: [
          {
            id: "cap-fraud-mgmt",
            name: "Fraud Management",
            level: 2,
            orphaned: false,
            descendantCount: 0,
            counts: { rules: 0, invariants: 1, decisions: 0, concepts: 0, realisations: 0 },
            children: [],
          },
        ],
      },
    ],
  },
  // The Business-Architecture lens (Feature 08): the same capabilities normalised into a curated
  // BIZBOK spine — a representative slice of the seed the live gateway serves (domain → capability →
  // classified function / activity), plus the rejected / unclassified buckets.
  businessArchitecture: {
    domains: [
      ref("ba-investment-management", "Investment Management", 1, 2, [
        ref("ba-trading-execution", "Trading & Execution", 2, 1, [
          classified("cap-authz-cap", "Authorisation", 3, 0.86, 0, [
            "Payment authorisation is an order/trade-execution function, not a top-level capability.",
          ]),
        ]),
      ]),
      ref("ba-operations", "Operations & Fund Administration", 1, 3, [
        ref("ba-investment-operations", "Investment Operations", 2, 2, [
          classified("cap-settle-cap", "Settlement", 3, 0.88, 1, [
            "Settlement is an investment-operations function within the operations value chain.",
            classified("cap-refunds-cap", "Refunds", 4, 0.8, 0, [
              "Refunds is an activity carried out within settlement, not a standalone capability.",
            ]),
          ]),
        ]),
      ]),
      ref("ba-risk-compliance", "Risk & Compliance", 1, 2, [
        ref("ba-enterprise-risk", "Enterprise Risk", 2, 1, [
          classified("cap-fraud-mgmt", "Fraud Management", 3, 0.9, 1, [
            "Fraud management is an operational-risk function under Enterprise Risk.",
          ]),
        ]),
      ]),
    ],
    rejected: { count: 1, byReason: [{ reason: "duplicate", count: 1 }] },
    unclassified: { count: 1, names: ["Risk & Compliance"] },
  },
  // The Vendor Coverage Map (Phase-3 view): the illustrative Payments L2 scenario the live gateway
  // seed lacks (VendorProduct/mappings live only in the in-code demo) — 5 capabilities × Adyen/Stripe,
  // mirroring demo/payments-coverage-map.md, so standalone dev shows a populated matrix.
  coverageMap: {
    columns: [
      { id: "vp-adyen", name: "Adyen Platform", vendor: "Adyen" },
      { id: "vp-stripe", name: "Stripe Payments", vendor: "Stripe" },
    ],
    rows: [
      { id: "cap-authorisation", name: "Card Authorisation", kind: "BusinessCapability", status: "covered", gap: false, domain: "payments" },
      { id: "cap-fraud", name: "Fraud Detection", kind: "BusinessCapability", status: "partial", gap: false, domain: "payments" },
      { id: "cap-payouts", name: "Payouts", kind: "BusinessCapability", status: "covered", gap: false, domain: "payments" },
      { id: "cap-reporting", name: "Regulatory Reporting", kind: "BusinessCapability", status: "uncovered", gap: true, domain: "payments" },
      { id: "cap-settlement", name: "Settlement", kind: "BusinessCapability", status: "covered", gap: false, domain: "payments" },
    ],
    cells: [
      { rowId: "cap-authorisation", columnId: "vp-adyen", status: "covered", coveragePercentage: 100, gaps: null },
      { rowId: "cap-authorisation", columnId: "vp-stripe", status: "covered", coveragePercentage: 100, gaps: null },
      { rowId: "cap-fraud", columnId: "vp-adyen", status: "partial", coveragePercentage: 55, gaps: ["no behavioural scoring"] },
      { rowId: "cap-fraud", columnId: "vp-stripe", status: "uncovered", coveragePercentage: null, gaps: null },
      { rowId: "cap-payouts", columnId: "vp-adyen", status: "uncovered", coveragePercentage: null, gaps: null },
      { rowId: "cap-payouts", columnId: "vp-stripe", status: "covered", coveragePercentage: 90, gaps: null },
      { rowId: "cap-reporting", columnId: "vp-adyen", status: "uncovered", coveragePercentage: null, gaps: null },
      { rowId: "cap-reporting", columnId: "vp-stripe", status: "uncovered", coveragePercentage: null, gaps: null },
      { rowId: "cap-settlement", columnId: "vp-adyen", status: "covered", coveragePercentage: 100, gaps: null },
      { rowId: "cap-settlement", columnId: "vp-stripe", status: "partial", coveragePercentage: 70, gaps: ["no T+0 settlement"] },
    ],
    summary: { totalCapabilities: 5, covered: 3, partial: 1, uncovered: 1, coveragePercentage: 70 },
  },
};

interface BANode {
  id: string;
  name: string;
  level: number;
  origin: "reference" | "classified";
  framework: string | null;
  confidence: number | null;
  rationale: string | null;
  descendantCount: number;
  counts: Record<string, number> | null;
  children: BANode[];
}

/** A curated spine (reference) node — carries a framework, no classifier confidence/rationale. */
function ref(id: string, name: string, level: number, descendantCount: number, children: BANode[]): BANode {
  return {
    id, name, level, origin: "reference", framework: "BIZBOK",
    confidence: null, rationale: null, descendantCount, counts: null, children,
  };
}

/** A classified raw capability — carries confidence + rationale; `rest` is `[rationale, ...children]`. */
function classified(
  id: string, name: string, level: number, confidence: number, invariants: number,
  rest: (string | BANode)[],
): BANode {
  const [rationale, ...children] = rest as [string, ...BANode[]];
  return {
    id, name, level, origin: "classified", framework: null, confidence, rationale,
    descendantCount: children.length,
    counts: { rules: 0, invariants, decisions: 0, concepts: 0, realisations: 0 },
    children,
  };
}

export const browserHandlers = [
  http.post(/\/graphql$/, async ({ request }) => {
    const { query } = (await request.json()) as { query: string };
    const data: Record<string, unknown> = {};
    for (const key of Object.keys(STANDALONE_FIXTURE)) {
      if (query.includes(key)) data[key] = STANDALONE_FIXTURE[key];
    }
    return HttpResponse.json({ data });
  }),
];

export const worker = setupWorker(...browserHandlers);

export async function startMockWorker(): Promise<void> {
  await worker.start({ onUnhandledRequest: "bypass" });
}
