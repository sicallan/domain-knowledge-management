# Disputes Runbook

This runbook covers two orchestration flows: the **Chargeback Flow** and the **Fraud Hold Flow**.

## Chargeback Flow

The **Chargeback Flow** is owned by the **Disputes Service** and is triggered by the
`ChargebackReceived` integration event.

Steps, in order:

1. **Open Dispute** — open a dispute case for the transaction.
2. **Gather Evidence** — collect the evidence package.
3. **Represent Or Accept** — evaluate the *Represent Chargeback* decision.
4. **Post Adjustment** — publish the `ChargebackResolved` domain event and move the dispute from
   `open` to `closed` (the *Dispute closed* transition).

`ChargebackReceived` is an integration event; `ChargebackResolved` is a domain event. The *Dispute
closed* state transition takes the **Dispute** entity from `open` to `closed`.

## Fraud Hold Flow

The **Fraud Hold Flow** is owned by the **Fraud Service** and is triggered by the `HighRiskScored`
integration event.

Steps, in order:

1. **Place Hold** — place a hold and publish the `FraudHoldPlaced` domain event.
2. **Notify Customer** — notify the customer that a hold is in place.
3. **Review Hold** — evaluate the *Fraud Hold Decision*.
4. **Release Or Block** — release the hold (the *Account released* transition) or block; this is
   the compensating step for *Place Hold*.

`HighRiskScored` is an integration event; `FraudHoldPlaced` is a domain event emitted by the Place
Hold step. The *Account released* state transition takes the **Account** entity from `held` to
`active`.
