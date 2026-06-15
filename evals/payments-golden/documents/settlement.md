# Settlement

## Settlement

The **Settlement** aggregate represents the movement of funds between the acquirer and the
issuer for a batch of captured authorisations. A **Settlement Batch** groups the captured
transactions submitted to the scheme within a single clearing window.

The total of a settlement batch must equal the sum of its captured transactions.

## Net Settlement

**Net Settlement** is an automated decision that computes the net position owed between
parties for a clearing window. It consumes the Scheme Fee Table to apply interchange and
scheme fees before producing the net amount.

The **Scheme Fee Table** is a managed reference dataset of interchange and scheme fee rates.
It is owned by the Scheme Relations team.
