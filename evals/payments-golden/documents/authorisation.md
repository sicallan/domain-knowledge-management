# Card Authorisation

## Authorisation

The **Authorisation** aggregate represents a request to reserve funds on a cardholder
account before a purchase is captured. The **Cardholder** is the party that owns the
payment card and against whose account funds are reserved.

An authorisation must never exceed the cardholder's available balance. A payment card must
not be expired at the time the authorisation is requested.

## Authorise Payment

**Authorise Payment** is an automated decision that returns *approve* or *decline*. It
evaluates the requested amount against the available balance and the cardholder's risk
profile.
