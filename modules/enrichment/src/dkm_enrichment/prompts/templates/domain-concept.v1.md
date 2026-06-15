## DomainConcept

A Domain-Driven Design concept that is part of the payments domain's canonical model:
an **aggregate, entity, value-object, domain-event, policy, invariant, command, or query**.

Emit a `DomainConcept` when the text names or describes such a concept (e.g. "Payment",
"Authorisation", "SettlementBatch", "PaymentInitiated event", "Mandate").

Fields:

- `name` (required) — the concept's canonical name.
- `conceptType` (required) — one of: `aggregate`, `entity`, `value-object`, `domain-event`,
  `policy`, `invariant`, `command`, `query`.
- `subdomain` — the payments subdomain it belongs to (e.g. "Card Acquiring", "SEPA").
- `boundedContext` — the bounded context that owns it, if stated.
- `description` — a one-sentence description grounded in the text.
