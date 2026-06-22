# Globex Fraud Suite — Capability Coverage Matrix

**Vendor:** Globex. **Product version:** 11.

The Globex Fraud Suite claims to deliver the **Detect Fraud** capability.

## Coverage matrix

| Vendor capability | Maps to | Coverage |
|---|---|---|
| Globex Real-time Scoring | Detect Fraud | Full — every authorisation is scored inline before approval. |
| Globex Device Fingerprinting | Detect Fraud | Partial — web and mobile-app traffic only; no coverage for server-to-server tokens. |
| Globex Chargeback Automation | Detect Fraud | None — chargeback representment is explicitly out of scope for this release. |

Real-time scoring is implemented at runtime by the **Fraud Service**.
