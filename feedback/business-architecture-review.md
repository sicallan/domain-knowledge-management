# Business-architecture review of the stewardship capability catalogue

> **What this is.** External expert-style feedback: an LLM asked to give a Business-Architect
> (BIZBOK / TOGAF / APQC) view of the raw extracted `BusinessCapability` catalogue from the
> stewardship corpus. It is **reference/source material**, not a component spec — it is the *target
> exemplar* that seeded the Business-Architecture Lens.
>
> **Where it leads.** [ADR-0009](../docs/adr/0009-business-architecture-classification.md) turns this
> into a design (curated reference spine + materialised LLM classification, projected); the feature is
> specced in [Feature 08 — Business-Architecture Lens](../docs/features/phase-3-ui/08-business-architecture-lens.md).
> The ~11 L1 domains and ~45–60 L2 capabilities below are transcribed into the curated spine.

---

This is actually a good candidate for **business architecture normalization**, because the source you've provided is **not an enterprise architecture**—it's more like an ontology or capability catalogue with duplicates, implementation details, controls, policies, ESG themes, and business activities all mixed together.

A Business Architect (using BIZBOK, TOGAF, APQC or similar) would typically normalize this into **4 levels**:

| Level  | Purpose                        | Example                                                              |
| ------ | ------------------------------ | -------------------------------------------------------------------- |
| **L1** | Enterprise Business Domain     | Investment Management                                                |
| **L2** | Business Capability / Function | Portfolio Management                                                 |
| **L3** | Business Function              | Portfolio Construction                                               |
| **L4** | Business Activity              | Define portfolio constraints, optimise holdings, rebalance portfolio |

---

# Recommended Enterprise Business Architecture

## L1 Enterprise Business Domains

I would reduce the entire model into approximately **11 enterprise domains**.

1. Strategy & Enterprise Governance
2. Investment Management
3. Investment Stewardship & Responsible Investment
4. Product & Client Management
5. Risk & Compliance
6. Operations & Fund Administration
7. Data & Analytics
8. Technology & Digital Services
9. Corporate Services
10. Sustainability & ESG
11. External Relationships

These are typical of BlackRock, Vanguard, Fidelity, Legal & General, Schroders, State Street etc.

---

# Example Hierarchy

## 1. Strategy & Enterprise Governance

### L2 Strategic Management

* Strategy Development
* Business Planning
* Enterprise Performance Management

#### L3 Strategy Development

* Define Strategic Objectives
* Investment Philosophy
* Target Operating Model

##### L4 Activities

* Develop corporate strategy
* Review strategic priorities
* Monitor strategic execution

---

### L2 Corporate Governance

#### L3

* Board Governance
* Policy Management
* Decision Governance

##### L4

* Board effectiveness review
* Governance reporting
* Policy approval
* Committee management

---

## 2. Investment Management

This is the core value chain.

### L2 Investment Strategy

#### L3

* Asset Allocation
* Investment Research
* Investment Thesis

##### L4

* Strategic asset allocation
* Tactical asset allocation
* Macro analysis
* Sector analysis

---

### L2 Portfolio Management

#### L3

* Portfolio Construction
* Portfolio Optimisation
* Portfolio Rebalancing
* Mandate Management

##### L4

* Construct portfolios
* Monitor mandates
* Optimise risk
* Execute rebalancing

---

### L2 Security Selection

#### L3

* Equity Research
* Fixed Income Research
* ESG Research
* Quantitative Research

##### L4

* Fundamental analysis
* Credit analysis
* ESG assessment
* Alpha generation

---

### L2 Trading & Execution

#### L3

* Order Management
* Trade Execution
* Securities Lending

##### L4

* Execute trades
* Allocate orders
* Monitor execution quality

---

## 3. Investment Stewardship & Responsible Investment

This area dominates your source data.

### L2 Stewardship

#### L3

* Company Engagement
* Proxy Voting
* Shareholder Rights
* Escalation

##### L4

* Prioritise engagements
* Meet company management
* Vote proxies
* Escalate stewardship actions

---

### L2 Responsible Investment

#### L3

* ESG Integration
* Sustainability Risk
* Stewardship Strategy

##### L4

* Integrate ESG into investment decisions
* Assess sustainability risks
* Develop stewardship priorities

---

### L2 Climate & Sustainability

#### L3

* Net Zero Strategy
* Climate Risk
* Biodiversity
* Social Impact

##### L4

* Climate scenario analysis
* Carbon measurement
* Nature risk assessment
* Social impact analysis

---

## 4. Product & Client Management

### L2 Product Management

#### L3

* Product Development
* Fund Launch
* Product Lifecycle

##### L4

* Design products
* Launch funds
* Retire products

---

### L2 Client Management

#### L3

* Client Onboarding
* Relationship Management
* Client Reporting

##### L4

* Onboard clients
* Capture requirements
* Produce reports

---

### L2 Distribution

#### L3

* Adviser Services
* Digital Platform
* Marketing

##### L4

* Support advisers
* Digital servicing
* Product promotion

---

## 5. Risk & Compliance

### L2 Enterprise Risk

#### L3

* Market Risk
* Liquidity Risk
* Climate Risk
* Operational Risk

##### L4

* Risk identification
* Stress testing
* Risk reporting
* Risk monitoring

---

### L2 Compliance

#### L3

* Regulatory Compliance
* Investment Compliance
* Monitoring

##### L4

* Compliance monitoring
* Regulatory reporting
* Policy management

---

### L2 Conduct & Ethics

#### L3

* Conflicts of Interest
* Gifts & Entertainment
* Personal Account Dealing

##### L4

* Register conflicts
* Review disclosures
* Employee certification

---

## 6. Operations & Fund Administration

### L2 Fund Operations

#### L3

* Fund Accounting
* NAV Oversight
* Cash Management

##### L4

* Calculate NAV
* Reconcile positions
* Manage cash

---

### L2 Investment Operations

#### L3

* Trade Support
* Settlement
* Corporate Actions

##### L4

* Match trades
* Settle transactions
* Process corporate actions

---

### L2 Provider Management

#### L3

* Custodian Oversight
* Asset Manager Oversight
* Vendor Management

##### L4

* Service reviews
* SLA monitoring
* Due diligence

---

## 7. Data & Analytics

### L2 Enterprise Data

#### L3

* Data Governance
* Data Quality
* Reference Data

##### L4

* Data stewardship
* Quality monitoring
* Master data maintenance

---

### L2 Analytics

#### L3

* Investment Analytics
* ESG Analytics
* Performance Analytics

##### L4

* Attribution
* Risk analytics
* ESG scoring

---

## 8. Technology & Digital

### L2 Technology Services

#### L3

* Platforms
* Cyber Security
* Digital Services

##### L4

* Infrastructure management
* Cyber defence
* Digital platforms

---

## 9. Corporate Services

### L2 Finance

### L2 HR

### L2 Procurement

### L2 Internal Audit

### L2 Legal

These absorb:

* Talent Management
* Learning
* Remuneration
* Internal Audit
* Budget Management
* Supplier Management

---

## 10. Sustainability & ESG

Rather than scattering ESG everywhere, enterprise architectures usually create a cross-cutting capability.

### L2 ESG Framework

#### L3

* ESG Policy
* ESG Governance
* ESG Reporting

##### L4

* Maintain ESG framework
* Produce sustainability reports
* Monitor ESG metrics

---

## 11. External Relationships

### L2 Industry Engagement

#### L3

* Regulatory Engagement
* Industry Bodies
* Public Policy

##### L4

* Participate in consultations
* Industry collaboration
* Regulatory engagement

---

# What gets removed during normalisation?

The source contains hundreds of implementation-level items that should become **L4 activities** or even process steps, not standalone capabilities. Examples include:

* Climate Target Setting and Monitoring
* AGM Engagement
* Voting Alert Issuance
* Director Independence Assessment
* Carbon Metrics Measurement
* Responsible Investment Survey
* Member Communications
* ESG Ratings Reporting
* Proxy Vote Escalation
* Industry Working Group Participation
* Employee AI Training
* Proxy Voting Conflict Identification
* Portfolio Stress Testing

Similarly, "orphaned" entries should be merged into their parent capabilities (for example, "Climate Risk Engagement" under Climate & Sustainability, or "Manager Selection and Due Diligence" under Provider Management).

# Overall assessment

The dataset can be consolidated dramatically. While it contains **well over 400 named items**, a mature business architecture for an asset manager would typically normalize this into approximately:

* **11 L1 Enterprise Business Domains**
* **45–60 L2 Business Capabilities**
* **150–220 L3 Business Functions**
* **600–1,000 L4 Business Activities**

This structure aligns closely with how large asset managers such as BlackRock, Vanguard, Fidelity, Legal & General Investment Management, and Schroders organize their business capability models. It also provides a stable enterprise architecture that can support application mapping, information architecture, operating models, and process decomposition without duplicating concepts across ESG, stewardship, investment, and governance.
