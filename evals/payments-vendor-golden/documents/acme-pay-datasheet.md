# Acme Pay Gateway — Product Datasheet

**Vendor:** Acme. **Product version:** 4.2.

The Acme Pay Gateway is a card-acceptance platform. It claims to deliver the **Accept Card
Payments** capability for issuers and acquirers.

## Capability coverage

- **Acme Card Authorisation** fully supports the Accept Card Payments capability: real-time
  authorisation, decline handling, and partial approvals are all covered end to end.
- **Acme Network Tokenisation** partially supports Accept Card Payments. Network tokens are issued
  for Visa and Mastercard only; Amex and domestic schemes are not yet covered (~70%).

The gateway's authorisation capability is implemented at runtime by the **Authorisation Service**.
