# Feature 03 — Authentication Integration

## 1. Feature

- **Name**: Authentication at the gateway edge — an **OIDC/OAuth 2.0** login flow, session management,
  and the mapping of IdP claims → `QueryContext.{userId, roles, scopes}`, plus an env-gated **dev fake
  identity** so the Studio is fully clickable with no IdP. RBAC *enforcement* is explicitly **not** here
  (Phase 5) — this feature populates the identity the existing `AccessFilter` seam will later enforce.
- **Plan step**: UI-3.3 — *Authentication integration: OIDC flow, session management, role mapping*
  ([ui-backend-plan.md §Authentication & Authorisation](../../../ui-backend-plan.md)).
- **Specs/ADRs expanded**: [ui-backend-plan.md §AuthN/AuthZ](../../../ui-backend-plan.md);
  [spec 006 §Access Filtering](../../../specs/README.md) (the `AccessFilter`/`QueryContext` seam already
  in `@dkm/query-interface`). Realises UI-D4 (RBAC deferred) and UI-D8 (dev fake identity).

## 2. Summary & scope

Identity for the gateway and the Studio. The platform already has the **authorisation seam**: every
`QueryService` call takes a `QueryContext` and funnels results through an `AccessFilter`
(`PassThroughAccessFilter` today). This feature fills the *authentication* half — proving who the caller
is and producing a populated `QueryContext` — without yet enforcing scopes (that pass-through stays
until Phase 5).

> **Fill the existing seam, don't build RBAC yet.** `QueryContext` and `AccessFilter` already exist and
> are on the hot path of every query (spec 006). This feature produces a real `QueryContext` from an
> OIDC session (and a fake one in dev), so that when a scope-enforcing `AccessFilter` lands in Phase 5
> it has correct identity to enforce **behind the same interface** — no resolver or query rework.

**In scope**
- **OIDC/OAuth2 flow** at the gateway: authorisation-code + PKCE against a corporate IdP (Azure
  AD/Okta/Keycloak), redirect/callback REST endpoints on the same Yoga HTTP server.
- **Session management**: a signed, stateless session token (no PostgreSQL — UI-D4); refresh handling;
  logout. A durable session store is deferred to Phase 5 with the RBAC ADR.
- **Claim → `QueryContext` mapping**: IdP groups/claims → `roles` (`viewer`/`contributor`/
  `domain_steward`/`admin`) + `scopes` (e.g. `payments.*`); attached to every resolver's context.
- **Studio auth UI**: login redirect, the user slot the shell (Feature 01) exposes, logout; an
  authenticated GraphQL client (token attached).
- **Dev fake identity** (UI-D8): env-gated (`DEV_FAKE_IDENTITY`), off by default, injects a configurable
  `QueryContext` so the app runs end-to-end with no IdP. The real flow supersedes it when its env is set.

**Out of scope**
- **RBAC enforcement** (Phase 5 — a scope-enforcing `AccessFilter`); this feature leaves pass-through.
- API keys for CI/programmatic access, and the audit log (Phase 5 — need a durable store).
- User/role *management* UI (Phase 5 admin console). This feature only *consumes* IdP-provided roles.
- Multi-tenancy isolation beyond scope tagging.

## 3. Dependencies

- **Upstream**: Feature 02 (the gateway + its `context` seam), Feature 01 (the shell's user slot);
  `@dkm/query-interface` (`QueryContext`, `AccessFilter`). An IdP (real flow) or the dev-fake env.
- **Unblocks**: per-user context for every query now; the Phase 5 RBAC enforcement + admin console.
- **Cross-feature**: produces the `QueryContext` Feature 02's resolvers already thread; the dev-fake
  mode keeps Features 04–06 unblocked without an IdP.

## 4. Applied decisions

| Decision | How it constrains this feature |
|---|---|
| **UI-D4** | RBAC *enforcement* deferred to Phase 5; this fills identity only. No PostgreSQL — stateless session token. |
| **UI-D8** | Env-gated dev fake identity is the default dev path; real OIDC supersedes when configured. |
| **UI-D5** | A real-OIDC integration test auto-skips unless IdP env is set; the dev-fake + claim-mapping unit tests are the CI gate. Real-world verification = follow-up issue. |
| **spec 006 — AccessFilter on the hot path** | Identity flows into the existing seam; pass-through stays until Phase 5 — no resolver change. |

## 5. User stories

- *As a user, I want to log in with my corporate identity, so that the platform knows who I am.*
- *As a developer, I want a dev mode with a fake identity, so that I can run the whole app without
  standing up an IdP.*
- *As a platform engineer, I want IdP groups mapped to roles/scopes on every request, so that Phase 5
  can enforce access without reworking queries.*
- *As a security reviewer, I want unauthenticated requests rejected (real mode), so that the gateway is
  not open by default in production.*

## 6. Acceptance criteria (Given/When/Then)

1. **OIDC flow completes** — *Given* a configured IdP, *when* a user completes authorisation-code+PKCE,
   *then* a valid session token is issued and the callback redirects into the Studio authenticated
   (covered by the skip-guarded integration test).
2. **Unauthenticated rejected (real mode)** — *Given* real mode (no dev-fake), *when* a request lacks a
   valid session, *then* the gateway rejects it (401) — except explicitly public endpoints (health).
3. **Claim mapping** — *Given* IdP claims/groups, *when* mapped, *then* `QueryContext.roles`/`scopes`
   match the configured mapping (pure unit test, no IdP).
4. **Context attached** — *Given* an authenticated request, *then* every resolver receives the caller's
   `QueryContext` (asserted via a resolver that echoes context).
5. **Dev fake identity** — *Given* `DEV_FAKE_IDENTITY` set, *then* a configured `QueryContext` is
   injected with no IdP and the app is fully usable; *given* it unset + real config present, *then* the
   real flow is used (dev-fake never the prod path).
6. **No enforcement yet** — *Given* any role/scope, *then* query *results* are unchanged from
   pass-through (RBAC enforcement is Phase 5) — documented and asserted (no silent filtering).
7. **CI green, no IdP** — *Given* CI, *then* unit tests (claim mapping, dev-fake, context attach) pass
   with no IdP/secret; the real-OIDC e2e auto-skips (UI-D5).

## 7. Interface contracts

```
mapClaims(claims: IdpClaims): { roles: string[]; scopes: string[] }     // pure, unit-tested
buildContext(session | devFake): QueryContext                            // { userId, roles, scopes, requestId }
// gateway: REST on the Yoga server — GET /auth/login, GET /auth/callback, POST /auth/logout, GET /healthz (public)
// studio: <AuthProvider>, login redirect, user slot, authenticated GraphQL client (token attached)
```

New files (indicative): `apps/api-gateway/src/auth/{oidc,session,claims,context}.ts`,
`apps/knowledge-studio/src/auth/{AuthProvider,useAuth}.tsx`, tests alongside.

## 8. TDD test plan (write these first)

- **Claim mapping — `claims.test.ts`**: representative IdP claim sets → expected roles/scopes (3).
- **Context build — `context.test.ts`**: session/dev-fake → well-formed `QueryContext` (4, 5).
- **Dev-fake switch — `auth-mode.test.ts`**: env on/off selects fake vs real path (5).
- **Rejection — `gateway-auth.test.ts`**: unauthenticated request rejected in real mode; health public (2).
- **No-enforcement — `passthrough.test.ts`**: results identical regardless of roles/scopes (6).
- **OIDC e2e (skip-guarded)**: full flow against a test IdP; auto-skip unless env set (1, 7) + follow-up.

## 9. Task breakdown

1. [ ] OIDC authorisation-code+PKCE flow + callback/login/logout REST endpoints on the Yoga server.
2. [ ] Stateless signed session token + refresh/logout (no DB — UI-D4).
3. [ ] `mapClaims` + `buildContext`; thread `QueryContext` into the gateway context (replacing dev-fake).
4. [ ] Dev fake identity (env-gated) — keep Features 04–06 unblocked.
5. [ ] Studio `AuthProvider`, login redirect, user slot, authenticated GraphQL client.
6. [ ] Tests first (mapping, context, mode switch, rejection, no-enforcement, skip-guarded e2e).

## 10. OCP extension points

- **Open**: additional IdPs/claim mappings (config, not code change); a scope-enforcing `AccessFilter`
  pushed in later (Phase 5) behind the same interface; API-key auth added as a second context source.
- **Closed**: the `QueryContext`/`AccessFilter` interfaces; the resolver signatures (context already
  threaded). Adding enforcement must not change them.

## 11. Open questions / risks

- **IdP for dev/CI.** *Recommendation:* a containerised **Keycloak** for the skip-guarded e2e; CI uses
  dev-fake + unit tests only (no container on the required path). Confirm the dev IdP.
- **Session strategy.** Stateless signed token now (UI-D4, no DB). Risk: revocation/refresh nuances.
  *Mitigation:* short-lived access + refresh; durable session store arrives with the Phase 5 RBAC ADR.
- **Role granularity.** The plan lists inventory/context/layer-scoped permissions. *Recommendation:*
  Phase 3 maps **coarse roles + a `scopes` list**; fine-grained scope *enforcement* is Phase 5 — don't
  over-model the policy now (ui-backend-plan risk: "RBAC complexity slows development").
