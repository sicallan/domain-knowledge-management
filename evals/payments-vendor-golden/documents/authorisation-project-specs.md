# Authorisation, Refund & Settlement — Project Specifications

This page collects the project artifacts that address the payments domain concepts.

## Specifications

- **Authorisation Hardening** (design, approved) addresses the **Authorisation** domain concept:
  step-up authentication and soft-decline retries. It is the design that satisfies the PSD2 strong
  customer authentication requirement.
- **Refund Eligibility Requirement** (requirement, approved) addresses the **Refund** domain
  concept: who may refund, within what window, and against which original payment.
- **Settlement Routing ADR** (ADR, accepted) addresses the **Settlement** domain concept: the
  decision to route via net settlement when scheme rules permit.
