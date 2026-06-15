# Refunds

## Refund

The **Refund** aggregate represents the return of funds to a cardholder for a previously
settled payment. A refund must not exceed the amount of the original payment.

A refund may only be raised within 180 days of the original settlement date.

## Approve Refund

**Approve Refund** is a hybrid decision: refunds below the manual-review threshold are
approved automatically, while larger refunds are routed to an operator for approval.
