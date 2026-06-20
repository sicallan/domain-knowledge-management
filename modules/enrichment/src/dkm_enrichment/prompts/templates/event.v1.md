## Event

A domain or integration event: something that happened, emitted by a service and consumed by
others. In payments: "PaymentAuthorised", "SettlementSubmitted", "RefundIssued".

Emit an `Event` when the text names something that is raised, published, or received.

Fields:

- `name` (required) — the event's name.
- `eventType` (required) — `domain` (within a bounded context) or `integration` (crosses a
  context/system boundary).
- `emitter` — the service/component that emits it, if stated.
- `consumers` — the services/components that consume it, if stated.
- `transport` — the delivery mechanism (e.g. kafka, sqs, webhook), if stated.
