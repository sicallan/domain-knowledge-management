# Fraud Scoring

## Fraud Management

**Fraud Management** is the business capability responsible for detecting and preventing
fraudulent payment activity across the platform.

## Score Transaction Risk

**Score Transaction Risk** is an automated decision that assigns a risk band to each
authorisation. It consumes the Risk Score Table and the Fraud Blocklist to determine
whether a transaction should be approved, challenged, or declined.

The **Fraud Blocklist** is a managed reference dataset of card and device identifiers known
to be associated with fraud. It is owned by the Fraud Operations team.

The **Risk Score Table** is a managed reference dataset that maps transaction features to a
numeric risk band. It is owned by the Risk Modelling team.
