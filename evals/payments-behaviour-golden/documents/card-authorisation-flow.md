# Card Authorisation Flow (flow specification)

The **Card Authorisation Flow** is the runtime orchestration that authorises a card payment. It
is owned by the **Authorisation Service** and is triggered by the `AuthorisationRequested`
integration event raised when the acquirer receives an authorisation message.

The flow runs the following steps, in order:

1. **Validate Card** — validate the card number, expiry and scheme.
2. **Check Funds** — invoke the funding service to confirm available balance.
3. **Score Risk** — evaluate the *Score Transaction Risk* decision to obtain a risk band.
4. **Authorise** — apply the authorisation outcome to the transaction.
5. **Publish Outcome** — publish the `PaymentAuthorised` domain event so downstream services can
   react.

`AuthorisationRequested` is an integration event delivered over the scheme gateway.
`PaymentAuthorised` is a domain event emitted by the Publish Outcome step and consumed by the
ledger and notification services.
