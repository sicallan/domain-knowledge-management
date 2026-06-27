# Authorisation

The **Authorisation** aggregate captures a card payment authorisation. An authorisation must
not exceed the cardholder's available balance.

## Risk Scoring

The risk engine scores each authorisation using the fraud reference dataset before approval.
