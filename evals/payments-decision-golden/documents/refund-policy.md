# Refund Decisions (policy)

## Approve Refund

The **Approve Refund** decision is a hybrid decision (owner: Payments Ops): an automated
eligibility check with a manual review fallback. Given the original payment and the dispute window
as inputs, it selects `approve`, `reject`, or `escalate`.

It evaluates the rule *"Refunds within the dispute window are eligible"* and consumes the **Original
Payment Reference** to confirm the original transaction. When a refund is approved it produces the
**RefundApproved** event.

Because the decision is hybrid, it is not required to be triggered by a single upstream event — a
reviewer may also initiate it directly.
