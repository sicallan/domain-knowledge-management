# 012 — Authentication & Authorisation

## Purpose & Scope

This component provides identity verification (AuthN) and access control (AuthZ) for the platform. It integrates with corporate identity providers via OIDC/OAuth 2.0 and enforces role-based access control scoped to inventory types and bounded contexts.

**In scope:**
- OIDC/OAuth 2.0 integration (corporate IdP)
- Session management (tokens, refresh, expiry)
- Role-Based Access Control (RBAC) model
- Permission scoping (by inventory type, bounded context, layer)
- API key management (for programmatic access)
- Audit logging of all access and mutations

**Out of scope:**
- Identity provider administration (that's the IdP's concern)
- UI login flow implementation (that's the UI Shell spec — this defines the contract)
- Network security (TLS, firewalls, VPN) — infrastructure concern

---

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| OIDC tokens | Identity Provider (via redirect) | JWT (id_token, access_token) |
| API keys | Programmatic clients | ****** in Authorization header |
| Role assignments | Admin console | `{ userId, role, scope }` |
| Permission check request | Any authenticated operation | `{ userId, action, resource }` |

---

## Outputs

| Output | Consumer | Format |
|--------|----------|--------|
| Authentication result | Middleware (all requests) | `{ authenticated: boolean, identity: UserIdentity }` |
| Authorisation decision | GraphQL resolvers, API endpoints | `{ permitted: boolean, reason?: string }` |
| Audit events | Audit log (append-only store) | `{ timestamp, actor, action, resource, outcome }` |
| Session tokens | Client | JWT (access + refresh tokens) |

---

## Behaviour

### Authentication Flow

```
Client                    Platform                     Identity Provider
  │                         │                              │
  ├──── Request ──────────► │                              │
  │                         ├── No valid session ─────────►│
  │  ◄─── Redirect to IdP ─┤                              │
  │                         │                              │
  ├──── Login at IdP ──────────────────────────────────────►│
  │  ◄─── Auth code + redirect ────────────────────────────┤
  │                         │                              │
  ├──── Auth code ────────► │                              │
  │                         ├── Exchange code for tokens ──►│
  │                         │◄── id_token + access_token ──┤
  │                         │                              │
  │                         ├── Validate token             │
  │                         ├── Map claims to roles        │
  │                         ├── Create session             │
  │  ◄─── Session token ───┤                              │
  │                         │                              │
  ├──── Subsequent requests (with session token) ────────►│
  │                         ├── Validate session           │
  │                         ├── Check permissions          │
  │  ◄─── Response ────────┤                              │
```

### RBAC Model

#### Roles

| Role | Description | Typical User |
|------|-------------|-------------|
| `viewer` | Read-only access to all non-restricted entries | Developer, analyst |
| `contributor` | Can propose corrections, add evidence, annotate | Domain expert, BA |
| `domain_steward` | Can approve corrections within their scope; manage quality | Domain architect |
| `admin` | Full platform access; user/role management; system configuration | Platform team |

#### Permission Model

Permissions are defined as: `action:resource_type:scope`

**Actions**: `read`, `write`, `approve`, `delete`, `admin`

**Resource types**: inventory type names (e.g., `Decision`, `Service`), `view`, `source`, `user`

**Scope**: bounded context, layer, or `*` (all)

Example permissions:
- `read:*:*` — viewer can read everything
- `write:Decision:payments` — contributor can modify decisions in Payments context
- `approve:*:payments` — domain steward can approve corrections in Payments
- `admin:*:*` — platform admin

#### Scope Resolution

When checking permissions:
1. Check explicit grants for the specific resource
2. Check wildcard grants (scope `*`)
3. Check role-inherited permissions
4. Default: deny

### API Key Management

For CI/CD and programmatic access:
- Keys are scoped to specific operations (e.g., "read-only access to export API")
- Keys have expiry dates (mandatory)
- Keys can be revoked immediately
- Each key is associated with a service identity (not a human user)
- API key requests are subject to the same RBAC checks as user requests

### Audit Logging

Every authenticated action is logged:

```typescript
interface AuditEvent {
  id: string;
  timestamp: string;
  actor: {
    type: 'user' | 'apikey' | 'system';
    id: string;
    name: string;
    roles: string[];
  };
  action: string;
  resource: {
    type: string;
    id: string;
    scope?: string;
  };
  outcome: 'success' | 'denied' | 'error';
  details?: Record<string, unknown>;
  requestId: string;
  ipAddress: string;
}
```

---

## Interfaces & Contracts

### AuthService

```typescript
interface AuthService {
  // Authentication
  initiateLogin(redirectUrl: string): Promise<{ authUrl: string }>;
  handleCallback(code: string, state: string): Promise<SessionToken>;
  validateSession(token: string): Promise<UserIdentity | null>;
  refreshSession(refreshToken: string): Promise<SessionToken>;
  logout(sessionId: string): Promise<void>;
  
  // Authorisation
  checkPermission(identity: UserIdentity, action: string, resource: Resource): Promise<AuthzDecision>;
  getUserPermissions(userId: string): Promise<Permission[]>;
  
  // API Keys
  createApiKey(params: CreateApiKeyParams): Promise<ApiKey>;
  revokeApiKey(keyId: string): Promise<void>;
  validateApiKey(key: string): Promise<ApiKeyIdentity | null>;
  
  // Role management
  assignRole(userId: string, role: string, scope?: string): Promise<void>;
  removeRole(userId: string, role: string, scope?: string): Promise<void>;
  listRoles(userId: string): Promise<RoleAssignment[]>;
}

interface UserIdentity {
  id: string;
  email: string;
  name: string;
  roles: RoleAssignment[];
  permissions: Permission[];           // Computed from roles
}

interface RoleAssignment {
  role: string;
  scope: string;                       // Bounded context or '*'
  grantedAt: string;
  grantedBy: string;
}

interface AuthzDecision {
  permitted: boolean;
  reason?: string;                     // Why denied (for logging, not for client)
  matchedPermission?: string;          // Which permission grant allowed it
}

interface SessionToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  identity: UserIdentity;
}
```

### Middleware Interface

```typescript
// Applied to every request before resolvers execute
interface AuthMiddleware {
  // Extracts and validates identity from request
  authenticate(request: Request): Promise<UserIdentity | null>;
  
  // Checks if identity can perform the operation (used in resolvers)
  authorize(identity: UserIdentity, action: string, resource: Resource): Promise<void>; // throws if denied
}
```

---

## Dependencies

| Depends on | Reason |
|------------|--------|
| External Identity Provider (Azure AD, Okta, Keycloak) | Source of user identity |
| PostgreSQL | Store role assignments, API keys, audit log, sessions |

| Depended on by | Reason |
|----------------|--------|
| GraphQL API Layer | Middleware for all requests |
| REST endpoints | Authentication validation |
| Query Interface | Access filtering context |
| Admin Console | Role management UI |
| All mutations | Audit logging |

---

## Key Decisions

### Decision 1: Session Management Strategy

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Stateless JWT (no server-side session)** | Scalable; no session store; self-contained; fast validation | Can't revoke tokens instantly; token size grows with claims; refresh flow complex |
| **Server-side sessions (session store)** | Instant revocation; small token (just session ID); full control over session lifecycle | Requires session store (Redis/DB); lookup on every request; scaling considerations |
| **Hybrid (short-lived JWT + server-side refresh token)** | Fast validation (JWT); revocable (via refresh token); good balance | More complex; two storage concerns; must handle token rotation |

**Recommendation: Hybrid (short-lived JWT + server-side refresh token)**

*Rationale*: Short-lived JWTs (15-minute expiry) allow stateless validation for most requests (fast, scalable). The refresh token (stored server-side in PostgreSQL) enables revocation — revoking a user's refresh token means they can't get new access tokens after the current one expires. This gives us both performance and security without the full overhead of server-side sessions.

---

### Decision 2: Role Granularity

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Global roles only (viewer, contributor, admin)** | Simple; easy to understand; few roles to manage | No scope control; a contributor can modify anything; doesn't support domain stewardship model |
| **Scoped roles (role + bounded context)** | Fine-grained; supports domain stewardship; least-privilege | More complex; more assignments to manage; scope resolution logic needed |
| **Attribute-Based Access Control (ABAC)** | Maximum flexibility; arbitrary policies; handles complex scenarios | Very complex; hard to reason about; difficult to audit; overkill for our needs |

**Recommendation: Scoped roles (RBAC with bounded context scope)**

*Rationale*: The governance model requires domain stewards who can approve corrections within their bounded context but not others. Global roles can't express this. ABAC is overkill — our access patterns are role-based with scope being the only additional dimension. Scoped roles give us the necessary granularity with manageable complexity.

---

### Decision 3: Identity Provider Integration

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Single IdP support (pick one: Azure AD)** | Simpler integration; fewer edge cases; optimised for one provider | Lock-in; can't serve organisations using different IdPs; limits adoption |
| **Multi-IdP via OIDC standard** | Any OIDC-compliant IdP works; flexible for different organisations; standards-based | Must handle IdP-specific quirks; claim mapping varies; more testing needed |
| **Built-in user management (own auth)** | Full control; no external dependency; works offline | Security risk (managing passwords); not enterprise-grade; reinventing the wheel |

**Recommendation: Multi-IdP via OIDC standard**

*Rationale*: Enterprise environments use diverse IdPs (Azure AD, Okta, Keycloak, Auth0). The OIDC standard provides a consistent interface regardless of provider. Our integration layer maps IdP-specific claims to our internal role model. Configuration specifies which IdP(s) are active and how their claims map to platform roles.

---

### Decision 4: Audit Log Implementation

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Application-level logging (structured logs)** | Simple; uses existing logging infrastructure; searchable via log aggregation | Not queryable as structured data; retention tied to log infrastructure; harder to correlate |
| **Dedicated audit table (PostgreSQL)** | Structured; queryable; long retention; supports compliance reporting | Additional storage; must manage retention; insert overhead on every operation |
| **Event stream (Kafka / event bus)** | Real-time consumption; scalable; multiple consumers; replay | Infrastructure dependency; operational complexity; overkill for our scale |

**Recommendation: Dedicated audit table (PostgreSQL)**

*Rationale*: Regulatory compliance (which this platform supports) requires auditable records of who accessed and modified what. A structured audit table supports compliance queries ("show me all changes to Decision X in the last year"), is trivially queryable, and survives infrastructure changes. PostgreSQL is already in the stack. The insert overhead is acceptable for our write volume.

---

## Open Questions

1. **Multi-tenancy**: If multiple organisations use the platform, is tenancy at the role-scope level or do we need a higher-level tenant concept?
2. **Service-to-service auth**: When internal services (agents, loaders) call the API, do they use API keys or a separate service mesh identity?
3. **Permission inheritance**: If a user is steward for "Payments", do they automatically have steward access to sub-contexts within Payments?
