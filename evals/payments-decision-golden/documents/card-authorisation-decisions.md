# Card Authorisation Decisions (decision log)

This log records the automated decisions taken on the card authorisation path, the rules each
decision evaluates, the reference data it consumes, the invariants that constrain it, and the
events it produces.

## Authorise Payment

When an **AuthorisationRequested** event arrives, the platform makes the **Authorise Payment**
decision (automated; owner: Authorisation Team). It takes the available balance and card status as
inputs and selects one of `approve`, `decline`, or `refer`.

It evaluates the rule *"Available funds must cover the authorisation amount"* and consumes the
**Card Status Reference** data. The decision is constrained by the invariant *"An authorisation must
never exceed the available balance"*. On approval it produces the **PaymentAuthorised** event. The
decision is realised by the Authorisation Service.

## Score Transaction Risk

The **Score Risk** step triggers the **Score Transaction Risk** decision (automated; owner: Risk
Team), which scores each transaction `low`, `medium`, or `high`. It evaluates the rule *"High
aggregate scores indicate elevated fraud risk"* and consumes the **Fraud Signal Dataset**. It
produces the **HighRiskScored** event, and is realised by the Risk Service.

## Apply Card Block

After repeated verification failures a **CvvFailureThresholdReached** event triggers the **Apply
Card Block** decision (automated; owner: Fraud Team), which chooses to `block` or `allow`. It
evaluates the rule *"Block the card after three consecutive CVV failures"* — note this is a **rule**
the decision uses, not the decision itself — and is constrained by the invariant *"A blocked card
must not authorise further payments"*. It produces the **CardBlocked** event.
