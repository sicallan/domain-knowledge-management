# 016 — Administration Console

## Purpose & Scope

The Administration Console provides Knowledge Administrators with tools to manage the platform's operational lifecycle: source configuration, ingestion monitoring, quality oversight, contradiction resolution, schema management, user administration, and system health monitoring.

**In scope:**
- Source management (CRUD, ingestion history, manual triggers)
- Quality dashboard (aggregate scores, trends, alerts)
- Corrections queue (review, approve/reject proposed changes)
- Schema management (view versions, preview changes)
- User & role management (CRUD, role assignments)
- API key management
- Audit log viewer
- System health monitoring

**Out of scope:**
- Knowledge exploration and browsing (that's the Knowledge Explorer)
- Impact assessment (that's a separate workflow)
- Question answering interface
- The actual correction/contradiction detection logic (that's the agent specs)

---

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| Admin actions | Administrator (via UI) | CRUD operations, approvals, triggers |
| Source configurations | Admin input | Connection details, schedules, filters |
| Correction proposals | Contradiction/correction agents | Proposed changes with rationale |
| System metrics | Backend services | Health, queue depths, latencies |
| Audit events | All platform operations | Structured audit log entries |

---

## Outputs

| Output | Consumer | Format |
|--------|----------|--------|
| Source configuration changes | Source Connector Framework | Updated source configs |
| Correction decisions | Graph Persistence Port (via correction service) | Approve/reject with rationale |
| Role assignments | Auth service | User-role-scope mappings |
| API key grants | Auth service | New API key with scope |
| Manual ingestion triggers | Ingestion orchestrator | Run request |

---

## Behaviour

### Source Management

#### Source List View
- Table of all configured sources with: name, type, status (active/paused/error), last run, next scheduled run, document count
- Status indicators: green (healthy), yellow (degraded), red (error)
- Actions: Edit, Pause/Resume, Delete, Trigger Now

#### Source Detail / Edit
- Connection configuration (type-specific fields)
- Credential reference (link to secret store, not raw credentials)
- Filter patterns (include/exclude)
- Schedule configuration (cron-like or interval)
- Source authority assignment
- Ingestion history (list of runs with outcomes)

#### Ingestion Run Detail
- Start time, duration, status (running/success/partial/failed)
- Documents processed / skipped / failed
- Error list with document references
- Extracted entity counts per type
- Link to resulting JSONL files

### Quality Dashboard

#### Overview Panel
- Aggregate composite score (system-wide)
- Score distribution chart (how many entries at each quality level)
- Trend line (last 30 days)
- Active alerts count

#### By-Dimension View
- Each quality dimension shown separately with aggregates and trends
- Worst-performing entries per dimension (actionable list)

#### By-Scope Drilldown
- Filter by: inventory type, layer, bounded context, source
- Comparative view (which contexts have lowest quality?)

#### Staleness Report
- Entries with timeliness score below threshold
- Grouped by source (which sources haven't been refreshed?)
- Action: trigger re-ingestion for stale sources

### Corrections Queue

#### Queue List
- Proposed corrections from agents, sorted by priority (impact × confidence)
- Columns: Affected entity, proposed change, reason, confidence, impact, agent, date
- Bulk selection for batch approve/reject
- Filters: type, confidence range, agent source, date range

#### Correction Detail
- **Current state**: The entry as it exists today
- **Proposed state**: What the correction agent suggests
- **Diff view**: Side-by-side or inline diff highlighting changes
- **Rationale**: Why the agent proposed this (contradiction detected, staleness, new evidence)
- **Confidence**: Agent's confidence in the correction
- **Impact**: What else changes if this is approved (affected relationships, downstream views)
- **Actions**: Approve, Reject (with reason), Edit-and-Approve, Escalate

#### Correction History
- Log of all resolved corrections with: decision, who decided, when, rationale
- Filterable for audit purposes

### Schema Management

- List all inventory type schemas with current version
- View schema definition (rendered JSON Schema with descriptions)
- Version history per schema
- Preview proposed changes (what would the next version look like)
- **Read-only**: Schema changes go through the code repository (PR-based)

### User & Role Management

- User list: name, email, roles, last active, status
- Role assignment: assign/remove roles with scope
- Invitation management (if applicable)
- Role template: pre-defined role+scope combinations for common personas

### API Key Management

- List active API keys: name, scope, created, expires, last used
- Create new key: name, scope (operations), expiry date
- Revoke key: immediate invalidation

### Audit Log Viewer

- Searchable, filterable log of all administrative actions
- Columns: timestamp, actor, action, resource, outcome, details
- Filters: actor, action type, date range, resource type
- Export capability (for compliance reporting)

### System Health

- Service status: all backend services with health/ready status
- Queue depths: ingestion queue, correction queue, event processing
- Processing latencies: P50/P95/P99 for key operations
- Storage health: graph DB, vector store, PostgreSQL connection status and capacity
- Recent errors: last N errors across all services

---

## Interfaces & Contracts

### Admin API Operations (GraphQL)

```graphql
# Source Management
type Source {
  id: ID!
  name: String!
  type: String!
  status: SourceStatus!
  config: JSON!
  schedule: String
  lastRun: IngestionRun
  nextRun: DateTime
  documentCount: Int!
}

type Mutation {
  addSource(input: AddSourceInput!): Source!
  updateSource(id: ID!, input: UpdateSourceInput!): Source!
  deleteSource(id: ID!): Boolean!
  triggerIngestion(sourceId: ID!): IngestionRun!
  pauseSource(id: ID!): Source!
  resumeSource(id: ID!): Source!
}

# Corrections
type Correction {
  id: ID!
  affectedEntry: InventoryEntry!
  currentState: JSON!
  proposedState: JSON!
  diff: JSON!
  rationale: String!
  confidence: Float!
  impact: ImpactSummary!
  agent: String!
  createdAt: DateTime!
  status: CorrectionStatus!
}

type Mutation {
  approveCorrection(id: ID!): CorrectionResult!
  rejectCorrection(id: ID!, reason: String!): CorrectionResult!
  batchApproveCorrections(ids: [ID!]!): [CorrectionResult!]!
  escalateCorrection(id: ID!, to: String!): CorrectionResult!
}

# User/Role Management
type Mutation {
  assignRole(userId: ID!, role: String!, scope: String): User!
  removeRole(userId: ID!, role: String!, scope: String): User!
  createApiKey(input: CreateApiKeyInput!): ApiKeyResult!
  revokeApiKey(keyId: ID!): Boolean!
}
```

### Dashboard Data Contracts

```typescript
interface QualityDashboardData {
  overview: {
    compositeAverage: number;
    entryCount: number;
    alertCount: number;
    distribution: { excellent: number; good: number; acceptable: number; poor: number };
  };
  trends: {
    period: string;
    dataPoints: { date: string; score: number }[];
  };
  byDimension: Record<string, { average: number; worst: { entryId: string; score: number }[] }>;
  byScope: { scope: string; average: number; entryCount: number }[];
}

interface SystemHealthData {
  services: { name: string; status: 'healthy' | 'degraded' | 'down'; lastCheck: string }[];
  queues: { name: string; depth: number; processingRate: number }[];
  latencies: { operation: string; p50: number; p95: number; p99: number }[];
  storage: { name: string; status: string; capacity: string; usage: string }[];
  recentErrors: { timestamp: string; service: string; message: string; count: number }[];
}
```

---

## Dependencies

| Depends on | Reason |
|------------|--------|
| GraphQL API Layer | All admin operations via API |
| Authentication & Authorisation | Admin role enforcement |
| Source Connector Framework | Source CRUD operations |
| Quality Scoring Framework | Dashboard data |
| Contradiction/Correction agents | Correction queue data |
| Schema Module | Schema viewing |
| Audit log store | Audit data |
| System health endpoints | Service status |

| Depended on by | Reason |
|----------------|--------|
| No downstream components | Terminal consumer (end-user facing) |

---

## Key Decisions

### Decision 1: Admin Console Architecture

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Integrated in main app (same SPA, admin routes)** | Single deployment; shared components; consistent UX; shared auth | Admin code shipped to all users (bundle size); harder to restrict access at build level; same performance budget |
| **Separate application (dedicated admin SPA)** | Independent deployment; smaller bundle for non-admins; can have different performance characteristics | Two apps to maintain; shared components duplicated or packaged separately; separate deployment pipeline |
| **Embedded admin section (lazy-loaded routes)** | Single deployment but admin code only loaded for admins; best of both | Still same bundle (code-split but present); route-level access control needed; slightly complex chunking |

**Recommendation: Integrated with lazy-loaded routes**

*Rationale*: The admin console shares substantial infrastructure with the main app (auth, GraphQL client, component library, theming). A separate app would duplicate all of this. Lazy-loaded routes ensure admin code (webpack chunks) are only downloaded for users who navigate to admin sections. Route guards prevent non-admins from accessing admin routes. This keeps deployment simple while avoiding bundle bloat for non-admin users.

---

### Decision 2: Correction Queue Prioritisation

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **FIFO (first in, first out)** | Simple; fair; predictable | High-impact corrections may languish behind trivial ones; no urgency differentiation |
| **Confidence-based (highest confidence first)** | Easy wins first; quick queue reduction; builds trust in automation | Low-confidence (potentially critical) items deprioritised; may miss time-sensitive issues |
| **Impact-weighted priority (impact × confidence)** | Critical items surface first; efficient use of reviewer time; risk-aware | More complex scoring; may overwhelm reviewers with critical items; need to define impact |
| **Configurable per steward (each steward sets their priority)** | Personalised; each steward works their way; flexible | Inconsistent handling; some items may never get reviewed; harder to track SLAs |

**Recommendation: Impact-weighted priority (impact × confidence)**

*Rationale*: A correction to a regulatory-impacting decision (high impact) with high confidence should be reviewed before a cosmetic correction to an operational log entry (low impact). The formula `priority = impact × confidence` naturally surfaces items where quick action yields the most value. Stewards can still filter by their scope — priority determines order within their filtered view.

---

### Decision 3: Dashboard Refresh Strategy

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Manual refresh (user clicks reload)** | Simple; no background load; predictable | Stale data; poor DX for monitoring; user must remember to refresh |
| **Auto-refresh on interval (poll every N seconds)** | Simple implementation; always reasonably fresh | Unnecessary load when not watching; may miss events between polls; N/2 average staleness |
| **Real-time (WebSocket push for metric changes)** | Always current; immediate visibility of issues; best monitoring UX | Complex; constant connection; server must push metric changes; battery/performance impact |
| **Hybrid (WebSocket for alerts, interval for metrics)** | Alerts are immediate (critical); metrics refresh periodically (acceptable lag); balanced | More complex; two update mechanisms; must decide what's "alert-worthy" |

**Recommendation: Hybrid (WebSocket for alerts, 30-second interval for metrics)**

*Rationale*: Quality alerts and new corrections need immediate visibility — a steward should see "new contradiction detected" within seconds. Aggregate metrics (average scores, queue depths) change slowly and don't need sub-second freshness — a 30-second refresh interval is fine. This balances responsiveness with server/client load. The WebSocket subscription is already available from the platform's real-time update infrastructure.

---

## Open Questions

1. **Batch operations safety**: For batch approval of corrections, should there be a confirmation step showing aggregate impact before committing?
2. **Admin permissions granularity**: Should admin operations be further scoped (e.g., "source admin" vs "user admin" vs "quality admin") or is a single admin role sufficient?
3. **Dashboard customisation**: Should admins be able to customise their dashboard layout (choose which panels, rearrange) or is a fixed layout preferred for consistency?
