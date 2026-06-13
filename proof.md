# Proof of Concept: Sample Sources & Test Suite

## Overview

This document defines:
1. The raw inputs folder structure for testing the knowledge management pipeline
2. Sample documents representing realistic sources for the **Payments** domain, focusing on **SEPA Instant Credit Transfer (SCT Inst)** as the scheme and **Finastra GPP (Global PAYplus)** as the vendor product
3. A comprehensive test suite to validate extraction, classification, and relationship linking

---

## Raw Inputs Folder Structure

```
/raw-inputs
  /scheme-documentation          # Regulatory/scheme rulebooks and specs
    /sepa-instant
      rulebook-sct-inst-v1.1.md
      rulebook-sct-inst-v1.2.md
      scheme-participant-guide.pdf
      message-specifications-pain001.xml
      r-transaction-reason-codes.csv
      operational-rules-timing.md
      reach-directory-extract.csv

  /vendor-documentation           # Vendor product documentation
    /finastra-gpp
      gpp-payment-engine-overview.md
      gpp-sct-inst-module-config.pdf
      gpp-message-mapping-pain001.json
      gpp-api-reference-payment-initiation.json
      gpp-data-model-payment-entity.xml
      gpp-release-notes-v2023.2.md
      gpp-release-notes-v2024.1.md

  /project-documentation          # Bank's internal project artifacts
    /sepa-instant-implementation
      business-requirements-document.md
      functional-specification-payment-flow.md
      technical-design-document.md
      decision-log.csv
      integration-architecture.md
      test-strategy.md

  /operational-sources            # Runtime and operational data
    /logs
      payment-processing-sample.jsonl
      error-events-sample.jsonl
    /events
      payment-initiated-event.json
      payment-cleared-event.json
      payment-rejected-event.json
      timeout-escalation-event.json
    /metrics
      sla-compliance-report.csv
      transaction-volume-daily.csv
    /runbooks
      incident-timeout-handling.md
      manual-intervention-procedure.md

  /regulatory                     # Regulatory and compliance sources
    /psd2
      psd2-strong-customer-auth-extract.md
      regulatory-technical-standards.pdf
    /local-regulation
      central-bank-reporting-requirements.md
      sanctions-screening-policy.md

  /reference-data                 # Lookup and configuration data
    bic-directory-extract.csv
    currency-codes.json
    country-iban-formats.json
    scheme-participation-status.csv

  /metadata                       # Source metadata for lineage
    source-manifest.json          # File list with fetch dates, versions, authors
    ingestion-log.jsonl           # Record of when each source was processed
```

---

## Sample Document Specifications

### 1. Scheme Documentation

#### `rulebook-sct-inst-v1.1.md` (previous version)
**Format**: Markdown
**Content**: Previous version of EPC SCT Inst rulebook covering:
- Same structure as v1.2 but with:
  - Amount limit of €15,000 (changed to €100,000 in v1.2)
  - No recall support (added in v1.2)
  - Maximum execution time of 20 seconds (tightened to 10s in v1.2)

**Expected extractions**:
- Same domain concepts as v1.2 (minus `Recall`)
- Business invariants with different values (€15k limit, 20s timing)
- Used for version-change detection testing

**Version change test expectations**:
- System detects amount limit change: €15,000 → €100,000
- System detects timing change: 20s → 10s
- System detects new concept: `Recall` added in v1.2
- Previous version entries marked with `validTo` date

---

#### `rulebook-sct-inst-v1.2.md`
**Format**: Markdown
**Content**: Excerpt from EPC SCT Inst rulebook covering:
- Scheme scope and participation criteria
- Maximum execution time (10 seconds end-to-end)
- Amount limit (€100,000)
- Availability requirement (24/7/365)
- R-transaction rules (reject, return, recall)
- Settlement finality rules
- Key business invariants (irrevocability after confirmation)

**Expected extractions**:
- Domain concepts: `SCTInstTransaction`, `Participant`, `Settlement`, `Recall`
- Business invariants: "Transaction must complete within 10 seconds", "Maximum amount €100,000", "24/7/365 availability"
- Rules: participant eligibility, amount validation, timeout handling
- Decisions: accept/reject at originator PSP, accept/reject at beneficiary PSP

---

#### `scheme-participant-guide.pdf`
**Format**: PDF (text-based, extractable)
**Content**: Operational guide for scheme participants:
- Onboarding procedures
- Connectivity requirements (TIPS, RT1)
- Message flow diagrams
- Exception handling procedures
- Reporting obligations

**Expected extractions**:
- Systems: `TIPS`, `RT1` (CSM options)
- Integrations: participant ↔ CSM connectivity
- Orchestration flows: standard payment flow, exception flow
- Reference data: CSM routing rules

---

#### `message-specifications-pain001.xml`
**Format**: XML (ISO 20022 schema excerpt)
**Content**: pain.001.001.09 message structure for credit transfer initiation:
- Message header elements
- Payment information block
- Credit transfer transaction information
- Remittance information structure

**Expected extractions**:
- Domain concepts: `PaymentInstruction`, `CreditTransferTransaction`, `RemittanceInformation`
- Data model: field definitions, cardinality, data types
- Rules: mandatory field validation, format constraints
- Reference data: purpose codes, category purpose codes

---

#### `r-transaction-reason-codes.csv`
**Format**: CSV
**Content**:
```csv
code,name,description,category,initiator
AC01,IncorrectAccountNumber,Account identifier incorrect,Reject,Beneficiary PSP
AC04,ClosedAccountNumber,Account closed,Reject,Beneficiary PSP
AC06,BlockedAccount,Account blocked,Reject,Beneficiary PSP
AM04,InsufficientFunds,Insufficient funds,Reject,Originator PSP
MS02,NotSpecifiedReasonAgent,Reason not specified by agent,Reject,Any PSP
MS03,NotSpecifiedReasonCustomer,Reason not specified by customer,Return,Beneficiary PSP
FOCR,FollowingCancellationRequest,Following cancellation request,Recall Response,Beneficiary PSP
```

**Expected extractions**:
- Reference data: R-transaction reason codes catalogue
- Rules: which codes apply to which transaction phase
- Decisions: reject reason selection logic

---

#### `operational-rules-timing.md`
**Format**: Markdown
**Content**: Timing rules for SCT Inst processing:
- Maximum 10 seconds originator-to-beneficiary
- Originator PSP: max 5 seconds to submit to CSM
- CSM: max 2 seconds for clearing
- Beneficiary PSP: max 3 seconds to confirm
- Timeout handling: auto-reject after deadline
- Positive confirmation requirement

**Expected extractions**:
- Business invariants: timing constraints at each stage
- Rules: timeout thresholds per participant role
- Decisions: timeout → reject decision
- Orchestration steps: timed sequence with deadlines

---

#### `reach-directory-extract.csv`
**Format**: CSV
**Content**:
```csv
bic,institution_name,country,scheme_participant,reachable_via,status,effective_date
DEUTDEFFXXX,Deutsche Bank AG,DE,DIRECT,,ACTIVE,2024-01-15
BNPAFRPPXXX,BNP Paribas,FR,DIRECT,,ACTIVE,2024-01-15
COBADEFFXXX,Commerzbank AG,DE,INDIRECT,DEUTDEFFXXX,ACTIVE,2024-03-01
```

**Expected extractions**:
- Reference data: scheme reachability directory
- Domain concepts: `DirectParticipant`, `IndirectParticipant`
- Rules: routing rules (direct vs indirect reach)
- Relationships: indirect participant → direct participant dependency

---

### 2. Vendor Documentation (Finastra GPP)

#### `gpp-payment-engine-overview.md`
**Format**: Markdown
**Content**: High-level GPP architecture for instant payments:
- Payment engine components (validator, router, formatter, settlement)
- Supported schemes and message types
- Extension points and customisation model
- Integration patterns (API, MQ, file)

**Expected extractions**:
- Systems/Services: GPP Payment Engine, Validator, Router, Formatter
- Business capabilities fulfilled: payment initiation, validation, routing, formatting
- Vendor capability mappings to domain concepts
- Integration patterns

---

#### `gpp-sct-inst-module-config.pdf`
**Format**: PDF
**Content**: GPP configuration for SCT Inst scheme:
- Scheme-specific parameter setup
- Timeout configuration
- Amount limit configuration
- Queue and priority configuration
- Retry and exception handling configuration

**Expected extractions**:
- Rules: configured validation rules, timeout settings
- Decisions: routing decisions, queue priority decisions
- Reference data: scheme parameters as configured
- Vendor capability mapping: GPP config → scheme requirements coverage

---

#### `gpp-message-mapping-pain001.json`
**Format**: JSON
**Content**:
```json
{
  "mapping": {
    "source_format": "internal_payment_object",
    "target_format": "pain.001.001.09",
    "version": "2024.1",
    "field_mappings": [
      {
        "source_path": "payment.debtor.account.iban",
        "target_path": "/Document/CstmrCdtTrfInitn/PmtInf/DbtrAcct/Id/IBAN",
        "transformation": "direct",
        "mandatory": true,
        "validation": "IBAN format check"
      },
      {
        "source_path": "payment.amount.value",
        "target_path": "/Document/CstmrCdtTrfInitn/PmtInf/CdtTrfTxInf/Amt/InstdAmt",
        "transformation": "decimal_2dp",
        "mandatory": true,
        "validation": "amount > 0 AND amount <= 100000"
      },
      {
        "source_path": "payment.creditor.bic",
        "target_path": "/Document/CstmrCdtTrfInitn/PmtInf/CdtTrfTxInf/CdtrAgt/FinInstnId/BICFI",
        "transformation": "direct",
        "mandatory": true,
        "validation": "BIC format, must exist in reach directory"
      }
    ]
  }
}
```

**Expected extractions**:
- Rules: field-level validation rules
- Reference data dependencies: IBAN format rules, BIC directory, amount limits
- Domain concepts: mapping between internal model and ISO 20022
- Vendor capability: message transformation capability

---

#### `gpp-api-reference-payment-initiation.json`
**Format**: JSON (OpenAPI-style excerpt)
**Content**:
```json
{
  "openapi": "3.0.0",
  "paths": {
    "/api/v1/payments/sct-inst": {
      "post": {
        "summary": "Initiate SEPA Instant Credit Transfer",
        "operationId": "initiateSCTInst",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["debtorAccount", "creditorAccount", "amount", "currency"],
                "properties": {
                  "debtorAccount": { "type": "string", "pattern": "^[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}$" },
                  "creditorAccount": { "type": "string", "pattern": "^[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}$" },
                  "amount": { "type": "number", "minimum": 0.01, "maximum": 100000 },
                  "currency": { "type": "string", "enum": ["EUR"] },
                  "remittanceInfo": { "type": "string", "maxLength": 140 }
                }
              }
            }
          }
        },
        "responses": {
          "201": { "description": "Payment accepted for processing" },
          "400": { "description": "Validation failed" },
          "409": { "description": "Duplicate payment detected" }
        }
      }
    }
  }
}
```

**Expected extractions**:
- Services: Payment Initiation API endpoint
- Rules: input validation constraints (IBAN format, amount range, currency restriction)
- Business invariants: amount limit enforcement
- Domain concepts: `PaymentInitiation`, duplicate detection
- Integration: API contract definition

---

#### `gpp-data-model-payment-entity.xml`
**Format**: XML
**Content**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<entity name="Payment" module="SCTInst">
  <field name="paymentId" type="UUID" primaryKey="true"/>
  <field name="status" type="ENUM">
    <values>
      <value>CREATED</value>
      <value>VALIDATED</value>
      <value>SUBMITTED</value>
      <value>CLEARED</value>
      <value>SETTLED</value>
      <value>REJECTED</value>
      <value>RETURNED</value>
      <value>RECALLED</value>
    </values>
  </field>
  <field name="debtorIBAN" type="STRING" maxLength="34" mandatory="true"/>
  <field name="creditorIBAN" type="STRING" maxLength="34" mandatory="true"/>
  <field name="amount" type="DECIMAL" precision="2" mandatory="true"/>
  <field name="currency" type="STRING" fixedLength="3" mandatory="true"/>
  <field name="createdTimestamp" type="DATETIME" mandatory="true"/>
  <field name="settlementDate" type="DATE"/>
  <field name="rejectReasonCode" type="STRING" maxLength="4"/>
  <stateTransitions>
    <transition from="CREATED" to="VALIDATED" trigger="VALIDATION_PASS"/>
    <transition from="CREATED" to="REJECTED" trigger="VALIDATION_FAIL"/>
    <transition from="VALIDATED" to="SUBMITTED" trigger="CSM_SUBMIT"/>
    <transition from="SUBMITTED" to="CLEARED" trigger="CSM_POSITIVE_RESPONSE"/>
    <transition from="SUBMITTED" to="REJECTED" trigger="CSM_NEGATIVE_RESPONSE"/>
    <transition from="SUBMITTED" to="REJECTED" trigger="TIMEOUT"/>
    <transition from="CLEARED" to="SETTLED" trigger="SETTLEMENT_CONFIRMED"/>
    <transition from="SETTLED" to="RETURNED" trigger="RETURN_INITIATED"/>
    <transition from="SETTLED" to="RECALLED" trigger="RECALL_ACCEPTED"/>
  </stateTransitions>
</entity>
```

**Expected extractions**:
- Domain concepts: `Payment` entity with full field model
- State transitions: complete payment lifecycle state machine
- Rules: validation triggers, timeout triggers
- Decisions: at each state transition point
- Business invariants: mandatory fields, data constraints

---

#### `gpp-release-notes-v2024.1.md`
**Format**: Markdown
**Content**: Release notes covering:
- New features (recall support, increased amount limit to €100k)
- Bug fixes (timeout race condition fix)
- Configuration changes required
- Breaking changes and migration notes
- Deprecated features

**Expected extractions**:
- Change events affecting existing domain model
- Updated business invariants (amount limit change)
- New capabilities (recall)
- Impact on existing orchestration flows

---

### 3. Project Documentation (Bank customisation)

#### `business-requirements-document.md`
**Format**: Markdown
**Content**: Bank's BRD for SCT Inst implementation:
- Business objectives and success criteria
- Scope: which customer segments, channels, account types
- Functional requirements (FR-001 through FR-025)
- Non-functional requirements (performance, availability, security)
- Exclusions and constraints
- Dependencies on other bank systems (core banking, sanctions, AML)

**Expected extractions**:
- Business capabilities: what the bank wants to achieve
- Domain concepts: bank-specific terminology mapped to scheme concepts
- Rules: bank-specific business rules (e.g., customer eligibility)
- Decisions: channel routing, eligibility decisions
- Integrations: dependencies on other systems
- Business invariants: bank-specific constraints (e.g., daily limits per customer)

---

#### `functional-specification-payment-flow.md`
**Format**: Markdown
**Content**: Detailed payment processing flow:
- Initiation (channel → payment engine)
- Validation sequence (format, business rules, sanctions, AML, limits)
- Routing decision (CSM selection, direct/indirect)
- Submission to CSM
- Response handling (positive confirmation, reject, timeout)
- Notification to customer
- Settlement and booking
- Exception flows (recall, return)

**Expected extractions**:
- Orchestration flows: end-to-end payment flow with all steps
- Decisions: at each branching point (validation pass/fail, route selection, timeout handling)
- Events: emitted at each stage transition
- Services involved: per step
- Rules: applied at each validation step
- Business invariants: SLA commitments

---

#### `technical-design-document.md`
**Format**: Markdown
**Content**: Technical architecture and design:
- Component architecture (services, queues, databases)
- Technology choices (GPP configuration, custom components)
- API contracts between components
- Database schema extensions
- Message queue topology
- Monitoring and alerting design
- Disaster recovery approach

**Expected extractions**:
- Systems and services: full technical component inventory
- Integrations: service-to-service connections with protocols
- Events: message queue topics and event types
- Technical realisation: mapping from functional spec to technical components

---

#### `decision-log.csv`
**Format**: CSV
**Content**:
```csv
id,date,title,status,context,decision,consequences,participants
DEC-001,2024-01-15,CSM Selection,ACCEPTED,"Need to connect to SEPA Instant clearing. Options: TIPS (ECB) or RT1 (EBA Clearing)","Selected TIPS as primary CSM with RT1 as contingency","Lower cost via TIPS; need RT1 fallback for resilience; dual connectivity adds complexity","Architecture Board"
DEC-002,2024-01-22,Sanctions Screening Approach,ACCEPTED,"Must screen all instant payments pre-submission within 10s budget. Options: inline sync call vs pre-cached list","Inline synchronous call to sanctions engine with 2s timeout","Adds latency but ensures real-time screening; timeout triggers manual review queue","Compliance + Architecture"
DEC-003,2024-02-01,Customer Notification Strategy,ACCEPTED,"Must notify customer of payment outcome. Options: push notification, SMS, in-app, all","Push notification as primary with SMS fallback for non-app customers","Cost-effective; covers 95% of customers via app; SMS for remainder","Product + Engineering"
DEC-004,2024-02-10,Amount Limit Strategy,ACCEPTED,"Scheme allows €100k. Bank risk appetite differs. Options: match scheme limit, lower limit, tiered by customer","Tiered limits: €15k standard, €50k premium, €100k corporate","Manages risk while enabling high-value use cases; requires customer segmentation integration","Risk + Product"
```

**Expected extractions**:
- Decisions: all decision records with full context
- Rules: derived from decisions (e.g., tiered limit rules)
- Integrations: implied by decisions (sanctions engine, notification service)
- Business invariants: constraints established by decisions

---

#### `integration-architecture.md`
**Format**: Markdown
**Content**: Integration landscape:
- Core banking system (account validation, balance check, booking)
- Sanctions screening engine (real-time check)
- AML/fraud detection (risk scoring)
- Customer notification service
- CSM connectivity (TIPS/RT1)
- Reconciliation system
- Regulatory reporting

**Expected extractions**:
- Systems: all integrated systems
- Integrations: connection details, protocols, SLAs
- Events: cross-system event flows
- Dependencies: system-to-system dependency graph
- Decisions: routing and failover decisions

---

#### `test-strategy.md`
**Format**: Markdown
**Content**: Testing approach for the implementation:
- Unit test scope
- Integration test scope with stubs/mocks
- End-to-end test scenarios
- Performance test approach (10s SLA validation)
- Connectivity testing with CSM
- UAT scenarios

**Expected extractions**:
- Business invariants: SLA requirements confirmed via test criteria
- Orchestration flows: implied by E2E test scenarios
- Quality requirements: performance thresholds

---

### 4. Operational Sources

#### `payment-processing-sample.jsonl`
**Format**: JSONL
**Content**:
```jsonl
{"timestamp":"2024-06-15T10:30:01.123Z","level":"INFO","service":"payment-validator","correlationId":"pay-uuid-001","message":"Payment validation started","paymentId":"PAY-2024-001","amount":1500.00,"currency":"EUR"}
{"timestamp":"2024-06-15T10:30:01.456Z","level":"INFO","service":"sanctions-screener","correlationId":"pay-uuid-001","message":"Sanctions check passed","duration_ms":180}
{"timestamp":"2024-06-15T10:30:01.789Z","level":"INFO","service":"payment-router","correlationId":"pay-uuid-001","message":"Routed to TIPS","csmSelected":"TIPS","reason":"primary_route"}
{"timestamp":"2024-06-15T10:30:03.012Z","level":"INFO","service":"csm-connector","correlationId":"pay-uuid-001","message":"Positive confirmation received from TIPS","totalDuration_ms":1889}
{"timestamp":"2024-06-15T10:30:03.100Z","level":"INFO","service":"notification-service","correlationId":"pay-uuid-001","message":"Customer notified","channel":"push"}
```

**Expected extractions**:
- Services: identified from log service field
- Orchestration steps: sequence reconstructed from correlation
- Events: state changes between steps
- Performance evidence: timing data as operational metrics
- Decisions: routing decision evidenced in logs

---

#### `error-events-sample.jsonl`
**Format**: JSONL
**Content**:
```jsonl
{"timestamp":"2024-06-15T11:45:02.100Z","level":"ERROR","service":"csm-connector","correlationId":"pay-uuid-099","message":"Timeout waiting for CSM response","timeout_ms":5000,"csmTarget":"TIPS"}
{"timestamp":"2024-06-15T11:45:02.150Z","level":"WARN","service":"payment-engine","correlationId":"pay-uuid-099","message":"Payment auto-rejected due to CSM timeout","rejectReason":"MS02","paymentId":"PAY-2024-099"}
{"timestamp":"2024-06-15T11:45:02.200Z","level":"INFO","service":"notification-service","correlationId":"pay-uuid-099","message":"Customer notified of rejection","channel":"push","reason":"timeout"}
```

**Expected extractions**:
- Exception flows: timeout → rejection → notification sequence
- Rules: timeout threshold (5000ms)
- Decisions: auto-reject on timeout
- Events: error event types
- Business invariants: timeout behaviour evidence

---

#### `payment-initiated-event.json`
**Format**: JSON
**Content**:
```json
{
  "eventType": "PaymentInitiated",
  "eventId": "evt-uuid-001",
  "timestamp": "2024-06-15T10:30:00.500Z",
  "source": "channel-api",
  "correlationId": "pay-uuid-001",
  "payload": {
    "paymentId": "PAY-2024-001",
    "debtorIBAN": "DE89370400440532013000",
    "creditorIBAN": "FR7630006000011234567890189",
    "amount": 1500.00,
    "currency": "EUR",
    "remittanceInfo": "Invoice 2024-001",
    "requestedExecutionDate": "2024-06-15",
    "serviceLevel": "INST"
  }
}
```

**Expected extractions**:
- Events: `PaymentInitiated` event with schema
- Domain concepts: payment initiation data structure
- Services: source service (`channel-api`)

---

#### `payment-rejected-event.json`
**Format**: JSON
**Content**:
```json
{
  "eventType": "PaymentRejected",
  "eventId": "evt-uuid-005",
  "timestamp": "2024-06-15T11:45:02.150Z",
  "source": "payment-engine",
  "correlationId": "pay-uuid-099",
  "payload": {
    "paymentId": "PAY-2024-099",
    "rejectReason": "MS02",
    "rejectSource": "CSM_TIMEOUT",
    "rejectDescription": "Timeout waiting for clearing response"
  }
}
```

**Expected extractions**:
- Events: `PaymentRejected` with reason codes
- State transitions: → REJECTED
- Reference data usage: reason code lookup
- Rules: timeout-triggered rejection

---

#### `timeout-escalation-event.json`
**Format**: JSON
**Content**:
```json
{
  "eventType": "TimeoutEscalation",
  "eventId": "evt-uuid-010",
  "timestamp": "2024-06-15T11:45:05.000Z",
  "source": "monitoring-agent",
  "correlationId": "pay-uuid-099",
  "payload": {
    "escalationType": "CSM_TIMEOUT",
    "affectedPaymentId": "PAY-2024-099",
    "timeoutDuration_ms": 5000,
    "action": "AUTO_REJECT_AND_ALERT",
    "alertRecipients": ["ops-team@bank.com"],
    "runbookRef": "RB-TIMEOUT-001"
  }
}
```

**Expected extractions**:
- Events: escalation event type
- Decisions: escalation action selection
- Runbook linkage: operational procedure reference
- Rules: escalation threshold and action

---

#### `sla-compliance-report.csv`
**Format**: CSV
**Content**:
```csv
date,total_transactions,within_sla,breached_sla,sla_compliance_pct,avg_duration_ms,p95_duration_ms,p99_duration_ms,rejection_rate_pct
2024-06-10,12450,12380,70,99.44,2100,4500,7800,2.1
2024-06-11,13200,13150,50,99.62,1950,4200,7200,1.8
2024-06-12,11800,11720,80,99.32,2200,4800,8100,2.4
2024-06-13,14100,14060,40,99.72,1850,3900,6800,1.5
2024-06-14,12900,12820,80,99.38,2150,4600,7900,2.2
```

**Expected extractions**:
- Metrics: SLA compliance data
- Business invariants: SLA thresholds (10s) evidenced by operational data
- Quality indicators: p95/p99 timing, rejection rates

---

#### `incident-timeout-handling.md`
**Format**: Markdown
**Content**: Runbook for CSM timeout incidents:
- Detection: alert triggered when timeout count exceeds threshold
- Triage: check CSM connectivity, check network, check queue depth
- Immediate action: verify auto-reject is functioning, check customer notifications
- Escalation: if timeout rate > 5%, escalate to CSM operations
- Recovery: validate payment status with CSM, reconcile any uncertain transactions
- Post-incident: update metrics, file incident report

**Expected extractions**:
- Runbook: operational procedure linked to timeout event
- Rules: escalation thresholds (5% timeout rate)
- Decisions: triage decision tree
- Services: involved in incident response
- Business invariants: reconciliation requirement

---

### 5. Regulatory Sources

#### `psd2-strong-customer-auth-extract.md`
**Format**: Markdown
**Content**: PSD2 SCA requirements relevant to instant payments:
- Two-factor authentication requirement for payment initiation
- Exemptions (low value, recurring, trusted beneficiary)
- Dynamic linking requirement (amount + payee in auth)
- 90-day re-authentication rule
- Liability shift rules

**Expected extractions**:
- Regulatory requirements: SCA obligations
- Rules: exemption criteria
- Decisions: SCA challenge decision (exempt vs require)
- Business invariants: authentication requirements
- Domain concepts: `StrongCustomerAuthentication`, `SCAExemption`

---

#### `central-bank-reporting-requirements.md`
**Format**: Markdown
**Content**: Reporting obligations:
- Transaction reporting frequency and format
- Threshold-based reporting (large value transactions)
- Statistical reporting for scheme monitoring
- Incident reporting timelines

**Expected extractions**:
- Regulatory requirements: reporting obligations
- Rules: reporting thresholds and frequencies
- Integrations: reporting system dependencies
- Business invariants: regulatory deadlines

---

### 6. Reference Data

#### `bic-directory-extract.csv`
**Format**: CSV
**Content**: BIC codes, institution names, countries for routing

#### `currency-codes.json`
**Format**: JSON
**Content**: ISO 4217 currency codes (EUR focus for SCT Inst)

#### `country-iban-formats.json`
**Format**: JSON
**Content**:
```json
{
  "DE": { "length": 22, "pattern": "^DE[0-9]{2}[0-9]{18}$", "example": "DE89370400440532013000" },
  "FR": { "length": 27, "pattern": "^FR[0-9]{2}[0-9]{10}[A-Z0-9]{11}[0-9]{2}$", "example": "FR7630006000011234567890189" },
  "ES": { "length": 24, "pattern": "^ES[0-9]{2}[0-9]{20}$", "example": "ES9121000418450200051332" },
  "IT": { "length": 27, "pattern": "^IT[0-9]{2}[A-Z][0-9]{10}[A-Z0-9]{12}$", "example": "IT60X0542811101000000123456" }
}
```

#### `scheme-participation-status.csv`
**Format**: CSV
**Content**: Which banks are active/pending/suspended in the scheme

---

## Test Suite Specification

The test suite validates the knowledge management pipeline's ability to correctly extract, classify, relate, and surface information from the raw inputs above.

### Test Categories

---

### T1: Schema Extraction Tests

Validate that each source document produces valid inventory entries conforming to defined schemas.

| Test ID | Source | Expected Output | Assertion |
|---|---|---|---|
| T1.01 | `rulebook-sct-inst-v1.2.md` | ≥5 `DomainConcept` entries | Each has name, type, bounded context |
| T1.02 | `rulebook-sct-inst-v1.2.md` | ≥3 `BusinessInvariant` entries | Each has statement, severity |
| T1.03 | `gpp-data-model-payment-entity.xml` | 1 `DomainConcept` (Payment entity) | Has all field definitions |
| T1.04 | `gpp-data-model-payment-entity.xml` | ≥8 `StateTransition` entries | Each has from, to, trigger |
| T1.05 | `gpp-api-reference-payment-initiation.json` | ≥3 `Rule` entries | Validation rules with expressions |
| T1.06 | `decision-log.csv` | 4 `Decision` entries | Each has context, outcomes, status |
| T1.07 | `r-transaction-reason-codes.csv` | 1 `ReferenceData` entry | Contains all codes as catalogue |
| T1.08 | `payment-initiated-event.json` | 1 `Event` entry | Has type, source, payload schema |
| T1.09 | `psd2-strong-customer-auth-extract.md` | ≥2 `RegulatoryRequirement` entries | Each linked to obligation type |
| T1.10 | `gpp-message-mapping-pain001.json` | ≥3 `Rule` entries | Field validation rules extracted |

---

### T2: Relationship Extraction Tests

Validate that cross-inventory relationships are correctly identified and linked.

| Test ID | Source(s) | Expected Relationship | Assertion |
|---|---|---|---|
| T2.01 | `functional-specification-payment-flow.md` | `triggers(PaymentInitiated → ValidationFlow)` | Event triggers orchestration |
| T2.02 | `gpp-data-model-payment-entity.xml` | `transitionsTo(VALIDATED → SUBMITTED)` via `CSM_SUBMIT` | State transition correctly linked |
| T2.03 | `decision-log.csv` + `integration-architecture.md` | `realizedBy(SanctionsScreeningDecision → sanctions-engine)` | Decision linked to implementing system |
| T2.04 | `business-requirements-document.md` | `supports(SCTInst System → InstantPayment Capability)` | System-capability link |
| T2.05 | `gpp-payment-engine-overview.md` | `fulfils(GPP → PaymentProcessing Capability)` | Vendor-capability mapping |
| T2.06 | `psd2-strong-customer-auth-extract.md` | `obliges(SCA Requirement → PaymentInitiation)` | Regulation-concept link |
| T2.07 | `error-events-sample.jsonl` | `emits(payment-engine → PaymentRejected)` | Service-event emission link |
| T2.08 | `incident-timeout-handling.md` | `governedBy(csm-connector → RB-TIMEOUT-001)` | Service-runbook link |
| T2.09 | `decision-log.csv` DEC-004 | `evaluates(AmountLimitDecision → TieredLimitRule)` | Decision-rule link |
| T2.10 | `gpp-message-mapping-pain001.json` | `usesReferenceData(ValidationRule → BIC Directory)` | Rule-reference data link |

---

### T3: Decision Extraction Tests

Validate that Decisions are correctly identified with their full structure.

| Test ID | Source | Decision | Assertions |
|---|---|---|---|
| T3.01 | `decision-log.csv` DEC-001 | CSM Selection | inputs: [connectivity options], outcomes: [TIPS primary, RT1 fallback] |
| T3.02 | `decision-log.csv` DEC-002 | Sanctions Screening Approach | type: automated, rules: [2s timeout], invariants: [must screen all] |
| T3.03 | `decision-log.csv` DEC-004 | Amount Limit Strategy | outcomes: [€15k/€50k/€100k tiers], reference data: [customer segment] |
| T3.04 | `functional-specification-payment-flow.md` | Validation Accept/Reject | inputs: [payment data], rules: [format, sanctions, limits], produces: [VALIDATED or REJECTED event] |
| T3.05 | `operational-rules-timing.md` | Timeout Reject | type: automated, trigger: [timeout event], invariant: [10s max], produces: [rejection + notification] |
| T3.06 | `psd2-strong-customer-auth-extract.md` | SCA Challenge Decision | inputs: [transaction context], rules: [exemption criteria], outcomes: [challenge/exempt] |

---

### T4: Cross-Layer Traceability Tests

Validate that concepts can be traced across L1 → L2 → L3.

| Test ID | L1 Concept | L2 Mapping | L3 Realisation | Assertion |
|---|---|---|---|---|
| T4.01 | `InstantPayment` (capability) | GPP Payment Engine (vendor) | `payment-engine` service | Full trace from capability to running service |
| T4.02 | `SanctionsScreening` (invariant) | FR-012 (requirement) | `sanctions-screener` service | Regulatory need → spec → implementation |
| T4.03 | `PaymentValidation` (domain concept) | GPP Validator module | Validation orchestration steps | Domain concept → vendor module → runtime steps |
| T4.04 | `AmountLimit` (business invariant) | DEC-004 (decision) | Configured in GPP + enforced in API | Invariant → decision → technical enforcement |
| T4.05 | `Recall` (domain event) | GPP v2024.1 recall feature | Return/recall state transitions | Event concept → vendor feature → state machine |

---

### T5: Behaviour Reconstruction Tests

Validate that orchestration flows and behaviour are correctly reconstructed.

| Test ID | Source(s) | Expected Behaviour | Assertions |
|---|---|---|---|
| T5.01 | `functional-specification-payment-flow.md` | End-to-end payment orchestration | ≥8 ordered steps, decision points identified |
| T5.02 | `gpp-data-model-payment-entity.xml` | Payment state machine | All states and transitions correctly modelled |
| T5.03 | `payment-processing-sample.jsonl` | Runtime flow instance | Steps match expected orchestration, timing extracted |
| T5.04 | `error-events-sample.jsonl` | Exception flow (timeout) | Exception path correctly modelled as alternative flow |
| T5.05 | `incident-timeout-handling.md` | Operational response flow | Runbook steps linked to system events |

---

### T6: Impact Assessment Tests

Validate that the impact assessment agent correctly identifies affected items when given new regulatory/strategic input.

| Test ID | Input Document | Expected Impact | Assertions |
|---|---|---|---|
| T6.01 | "Amount limit increased to €200,000" | Updates `AmountLimit` invariant, affects DEC-004, GPP config, API validation, customer limits | ≥5 affected items across all 3 layers |
| T6.02 | "New sanctions list country added" | Affects sanctions screening decision, reference data, screening rules | Identifies sanctions-screener service, screening rules |
| T6.03 | "TIPS mandatory migration deadline" | Affects CSM routing decision (DEC-001), RT1 contingency, connectivity architecture | Identifies routing decisions and integration changes |
| T6.04 | "Instant payment fraud scoring mandatory" | New rule/decision required, new integration, affects timing budget | Gap identified (no current fraud scoring in flow) |
| T6.05 | "Recall timeframe reduced to 10 days" | Affects recall process, state transitions, customer notification timing | Identifies recall-related components and rules |

---

### T7: Multi-Format Ingestion Tests

Validate that the pipeline correctly handles all source formats.

| Test ID | Format | Source File | Assertion |
|---|---|---|---|
| T7.01 | Markdown | `rulebook-sct-inst-v1.2.md` | Structured sections correctly parsed, headings as context |
| T7.02 | PDF | `scheme-participant-guide.pdf` | Text extracted, structure preserved |
| T7.03 | JSON | `gpp-message-mapping-pain001.json` | Schema-aware parsing, nested structures traversed |
| T7.04 | XML | `gpp-data-model-payment-entity.xml` | Element hierarchy preserved, attributes extracted |
| T7.05 | CSV | `r-transaction-reason-codes.csv` | Rows as records, headers as field names |
| T7.06 | JSONL | `payment-processing-sample.jsonl` | Each line as separate record, correlation grouping |
| T7.07 | JSON (OpenAPI) | `gpp-api-reference-payment-initiation.json` | API structure understood, schemas extracted |

---

### T8: Completeness and Coverage Tests

Validate that no expected extractions are missed.

| Test ID | Scope | Assertion |
|---|---|---|
| T8.01 | All scheme docs | Every business invariant from rulebook appears in inventory |
| T8.02 | All vendor docs | Every GPP capability has a vendor capability mapping entry |
| T8.03 | All project docs | Every functional requirement links to ≥1 domain concept |
| T8.04 | All decision records | Every decision has inputs, rules, and outcomes populated |
| T8.05 | All operational sources | Every log-identified service exists in service inventory |
| T8.06 | All events | Every event has an emitter and ≥1 consumer identified |
| T8.07 | All regulatory sources | Every obligation maps to ≥1 affected domain concept |
| T8.08 | Cross-reference | No orphan inventory items (every item has ≥1 relationship) |

---

### T9: Confidence and Provenance Tests

Validate that every extraction has proper evidence and confidence scoring.

| Test ID | Assertion |
|---|---|
| T9.01 | Every inventory entry has ≥1 `evidencedBy` link to source document + location |
| T9.02 | Every relationship has a confidence score between 0.0 and 1.0 |
| T9.03 | Entries extracted from structured sources (JSON, XML, CSV) have confidence ≥ 0.9 |
| T9.04 | Entries extracted from unstructured sources (MD, PDF) have confidence score reflecting extraction certainty |
| T9.05 | Contradictions between sources are flagged (e.g., different amount limits in different docs) |
| T9.06 | Every extraction can be traced back to exact source location (file, section/line/path) |

---

### T10: Robustness and Negative Tests

Validate that the pipeline handles ambiguous, contradictory, or malformed input gracefully.

| Test ID | Source/Scenario | Expected Behaviour | Assertion |
|---|---|---|---|
| T10.01 | Malformed CSV with missing columns | Graceful degradation | Partial extraction with reduced confidence; error logged, not crashed |
| T10.02 | Contradictory amount limits: scheme says €100k, project DEC-004 says €15k standard | Contradiction flagged | Both facts stored; contradiction relationship created with both sources cited |
| T10.03 | Duplicate documents (same content, different filenames) | Deduplication or merge | Single inventory entry created; both sources linked as evidence |
| T10.04 | Document with mixed languages (English headings, German content) | Language-aware extraction | Language detected per section; extraction quality maintained |
| T10.05 | Incomplete/truncated document (PDF cut off mid-sentence) | Partial extraction with penalty | Extracted facts have lower confidence; incompleteness noted in metadata |
| T10.06 | Outdated document superseded by newer version | Temporal resolution | New version facts take precedence; old version marked with `validTo` date |
| T10.07 | Source with ambiguous entity reference ("the system") | Conservative resolution | Not merged with incorrect entity; flagged for human review |
| T10.08 | Empty or zero-content source file | No-op with warning | No inventory entries created; warning logged |

---

### T11: Performance and Scale Tests

Validate extraction performance and query latency at target scale.

| Test ID | Scenario | Target | Assertion |
|---|---|---|---|
| T11.01 | Single markdown document extraction | < 30 seconds | Extraction completes within time budget |
| T11.02 | Single JSON/XML structured extraction | < 10 seconds | Structured extraction faster than unstructured |
| T11.03 | Batch ingestion of all ~30 PoC documents | < 10 minutes | Full corpus processable in reasonable time |
| T11.04 | Graph query: single-hop relationship | < 200ms | Interactive query latency |
| T11.05 | Graph query: multi-hop traversal (L1→L2→L3) | < 1 second | Cross-layer trace remains fast |
| T11.06 | Impact assessment agent run | < 60 seconds | Impact analysis for single change scenario |
| T11.07 | Concurrent extraction (5 documents simultaneously) | No data races | All extractions correct; no duplicate/corrupted entries |

---

### T12: Incremental Update Tests

Validate that the pipeline correctly handles updates to previously ingested sources.

| Test ID | Scenario | Expected Behaviour | Assertion |
|---|---|---|---|
| T12.01 | Modified source document (new section added) | Existing entries preserved; new entries added | No duplication; previous entries retain their IDs |
| T12.02 | Deleted section in source document | Affected entries flagged as potentially stale | Staleness marker applied; entries not auto-deleted |
| T12.03 | New source contradicts existing entry | Conflict surfaced | Both versions visible; contradiction relationship created |
| T12.04 | Re-ingestion of unchanged source | Idempotent (no-op) | No new versions created; timestamps unchanged |
| T12.05 | Updated relationship evidence | Relationship confidence updated | Existing relationship strengthened; evidence list extended |
| T12.06 | Source version upgrade (v1.1 → v1.2) | Version history maintained | Both versions in history; current marked as latest |

---

### T13: Entity Resolution Tests

Validate that the same real-world entity is correctly unified across different sources and naming conventions.

| Test ID | Source References | Expected Resolution | Assertion |
|---|---|---|---|
| T13.01 | "payment-engine" (logs) + "GPP Payment Engine" (vendor docs) + "Payment Processing Service" (project docs) | Single unified entity | All three names resolve to one service entry with aliases |
| T13.02 | "TIPS" in scheme docs + "TIPS" in project docs + "TIPS" in operational logs | Single system entity | Correctly unified across all sources |
| T13.03 | "Validator" (GPP docs) + "payment-validator" (logs) | Correctly linked | Vendor module linked to runtime service instance |
| T13.04 | "the system" (ambiguous reference in BRD) | Not incorrectly merged | Ambiguous reference flagged; not merged with wrong entity |
| T13.05 | "SCT Inst" + "SEPA Instant Credit Transfer" + "Instant Payment" | Single domain concept | All names treated as synonyms for one concept |
| T13.06 | "Deutsche Bank" (reach directory) + "DEUTDEFFXXX" (BIC) | Correctly linked | BIC-to-institution mapping established |

---

## Test Execution Strategy

### Levels

1. **Unit tests**: schema validation of individual extractions (T1, T7)
2. **Integration tests**: relationship linking and cross-source correlation (T2, T3, T4)
3. **Behaviour tests**: flow reconstruction and decision modelling (T5, T3)
4. **Agent tests**: impact assessment against seeded scenarios (T6)
5. **Coverage tests**: completeness assertions over full corpus (T8)
6. **Quality tests**: confidence and provenance validation (T9)
7. **Robustness tests**: negative cases and error handling (T10)
8. **Performance tests**: latency and throughput validation (T11)
9. **Incremental tests**: update and idempotency validation (T12)
10. **Entity resolution tests**: cross-source unification (T13)

### Target Metrics by Category

| Category | Precision Target | Recall Target | Notes |
|---|---|---|---|
| T1 (Schema Extraction) | ≥ 0.90 | ≥ 0.85 | Core extraction accuracy |
| T2 (Relationships) | ≥ 0.85 | ≥ 0.80 | Cross-source linking is harder |
| T3 (Decisions) | ≥ 0.90 | ≥ 0.90 | High bar — decisions are critical |
| T4 (Cross-Layer) | — | ≥ 0.80 | Completeness of L1→L3 traces |
| T5 (Behaviour) | ≥ 0.90 | ≥ 0.85 | Sequence accuracy matters |
| T9 (Confidence) | — | — | Calibration error < 0.10 |
| T13 (Entity Resolution) | ≥ 0.95 | ≥ 0.85 | False merges are high-impact |

### Source Authority Hierarchy

When multiple sources assert conflicting facts, resolution follows this authority order:

1. **Regulatory** (PSD2, central bank) — highest authority
2. **Scheme** (EPC rulebooks, operational rules)
3. **Vendor** (GPP documentation, release notes)
4. **Project** (BRD, functional spec, design docs)
5. **Operational** (logs, events, metrics) — lowest authority, but most current

When authority is equal, more recent sources take precedence. When both authority and recency are equal, the conflict is surfaced for human resolution.

### Golden Dataset

The sample documents above, combined with the expected extractions defined in this test suite, constitute the **golden dataset** for the Payments/SEPA Instant domain. Each test case has:
- Known input (the source document)
- Expected output (the inventory entries and relationships)
- Clear pass/fail criteria

**Golden dataset versioning**: As extraction models improve, expected outputs are updated. Previous baselines are retained for regression comparison. The rule is: "extraction must be at least as good as the previous baseline."

### Automation

Tests should be runnable as:
```bash
# Run full test suite
npm test -- --suite=proof-of-concept

# Run by category
npm test -- --suite=proof-of-concept --category=T1  # Schema extraction
npm test -- --suite=proof-of-concept --category=T6  # Impact assessment
npm test -- --suite=proof-of-concept --category=T10 # Robustness
npm test -- --suite=proof-of-concept --category=T13 # Entity resolution

# Run single test
npm test -- --suite=proof-of-concept --test=T3.04
```

### Handling Non-Deterministic Extraction

LLM-based extraction is inherently non-deterministic. The test framework addresses this via:
- **Deterministic mode**: temperature=0, fixed seed for reproducibility during CI
- **Fuzzy matching**: assertions use semantic similarity thresholds, not exact string matching
- **Statistical assertions**: for precision/recall targets, run extraction N times and assert average meets threshold
- **Regression baseline**: current results compared against stored baseline; significant regressions block merge

### Metrics

- **Extraction precision**: % of extracted items that are correct
- **Extraction recall**: % of expected items that were extracted
- **Relationship accuracy**: % of relationships correctly identified
- **Cross-layer completeness**: % of L1 concepts with L2 and L3 traceability
- **Decision completeness**: % of decisions with full structure (inputs, rules, outcomes)
- **Confidence calibration**: correlation between confidence scores and actual correctness
- **Entity resolution precision**: % of merges that are correct (false merge rate)
- **Incremental correctness**: % of updates that correctly modify existing entries without duplication

---

## Summary

This proof-of-concept corpus covers:
- **6 source categories** (scheme, vendor, project, operational, regulatory, reference data)
- **7 file formats** (MD, PDF, JSON, JSONL, XML, CSV, OpenAPI)
- **~30 source files** representing realistic enterprise documentation
- **13 test categories** with **90+ individual test cases**
- **All 3 model layers** exercised (pure domain, functional, technical)
- **Decision as first-class concept** validated through multiple sources
- **Impact assessment** validated through scenario-based tests
- **Full traceability** from source evidence to inventory to relationships to views
- **Robustness** validated through negative/edge case tests
- **Entity resolution** validated across naming conventions and sources
- **Incremental updates** validated for idempotency and correctness
- **Performance** validated against explicit latency targets
- **Quantitative targets** defined per test category (precision/recall thresholds)
- **Source authority hierarchy** established for conflict resolution

When the pipeline passes this test suite with target precision and recall, we have confidence that the system can ingest real enterprise documentation and produce a useful, queryable, trustworthy knowledge graph.
