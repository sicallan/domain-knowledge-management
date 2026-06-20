# Refund Flow (sequence diagram)

The **Refund Flow** issues a refund against a settled payment. It is owned by the **Refund
Service** and is triggered by the `RefundRequested` integration event.

The sequence is:

1. **Validate Refund Window** — confirm the refund is within the allowed window.
2. **Check Original Payment** — confirm the original payment exists and was settled.
3. **Approve Refund Step** — evaluate the *Approve Refund* decision.
4. **Issue Refund** — publish the `RefundIssued` domain event and move the payment from `settled`
   to `refunded` (the *Payment refunded* transition).

`RefundRequested` is an integration event; `RefundIssued` is a domain event emitted by the Issue
Refund step. The *Payment refunded* state transition takes the **Payment** entity from `settled`
to `refunded`, triggered by `RefundIssued`.
