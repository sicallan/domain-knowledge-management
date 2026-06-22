## Vendor & project realisation (L2)

This pass reads **vendor documentation** (product datasheets, capability matrices) and **project
specs** (requirements, designs, ADRs) and populates the L2 Functional-Realisation layer: what
commercial products and project artifacts *claim to fulfil* of the L1 domain. Emit only what the
passage supports — a vendor's marketing claim is evidence of a *claim*, not of truth.

### VendorProduct

A commercial product asserting it realises one or more business capabilities. In payments e.g.
"Adyen Payments Platform", "Stripe Radar", "Worldpay Gateway".

Fields:

- `name` (required) — the product name.
- `vendor` (required) — the supplying organisation.
- `productVersion` — the vendor's product version, if stated (NOT a lifecycle version).
- `capabilityClaims` — the free-text capabilities the vendor asserts (e.g.
  `["3-D Secure authentication", "network tokenisation"]`).

### VendorCapabilityMapping — the graded coverage claim (highest-value, highest-risk)

A first-class, evidenced assertion that one vendor capability maps onto an L1 element, **with an
explicit coverage level**. This is the unit the Coverage Map and Gap Analysis read, so a wrong
`coverage` is the costly failure: never assert coverage the passage does not support.

Fields:

- `vendorCapability` (required) — the vendor-side capability name being mapped (e.g.
  "Adyen 3-D Secure").
- `mappedConcept` (required) — a typed reference to the L1 element it claims to cover:
  `{ "targetType": "DomainConcept" | "BusinessCapability", "targetId": "<the concept/capability name>" }`.
- `coverage` (required) — **exactly one of** `full`, `partial`, `none`:
  - `full` — the source states the capability fully covers the concept ("fully supports", "complete").
  - `partial` — covers some but not all ("partial", "supports most", with named gaps).
  - `none` — explicitly does not cover it.
  When the source only *implies* coverage rather than stating it, prefer the weaker level and a
  lower `confidence` — a precision-first posture (a missed claim is recoverable; a false "covered"
  is not).
- `coveragePercentage` — a number 0–100 only when the source states one ("covers ~80%").
- `gaps` — named shortfalls the source calls out ("no support for soft declines").

### ProjectSpec

A project artifact that claims to address one or more L1 domain concepts.

Fields:

- `name` (required) — the spec's title.
- `specType` (required) — one of `requirement`, `design`, `ADR`.
- `status` (required) — the spec's own lifecycle (e.g. `draft`, `approved`, `superseded`).
- `addressedConcepts` — names/ids of the domain concepts it addresses.

### L2 realisation relationships

When you emit these entities, surface the structural edges the passage supports:

- `fulfils` → from a `VendorProduct` to the `BusinessCapability` it claims to deliver. **Pair every
  fulfils with the graded `VendorCapabilityMapping`** that records *how much* of the capability is
  covered — a bare `fulfils` with no mapping is incomplete (the row reads realised but no cell is).
- `specifies` → from a `ProjectSpec` to a `DomainConcept` it addresses.
- `realizesVendorCap` → from a runtime `Service` to a `VendorCapabilityMapping`. The Service is an
  L3 endpoint that may not appear in this source; emit the edge only when both ends are named.
