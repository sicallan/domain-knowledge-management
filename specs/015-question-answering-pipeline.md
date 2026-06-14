# 015 — Question Answering Pipeline

## Purpose & Scope

The Question Answering Pipeline accepts natural-language questions from users, translates them into structured queries against the knowledge graph, and synthesises the results into human-readable answers with full provenance. It bridges the gap between how users think about the domain and how the data is structured.

**In scope:**
- Natural language question understanding (intent + entity extraction)
- Question → structured query translation
- Hybrid retrieval (semantic + graph + keyword)
- Answer synthesis (results → coherent prose with citations)
- Conversation context (follow-up questions)
- Confidence indication and guardrails (out-of-scope detection)
- Answer feedback collection

**Out of scope:**
- Knowledge graph population (that's extraction pipeline)
- UI chat interface rendering (that's the UI spec)
- General-purpose LLM chat (this is domain-scoped Q&A)

---

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| Question text | User (via UI or API) | Natural language string |
| Conversation history | Session store | Previous Q&A turns in this session |
| User context | Auth service | Identity, roles, scope (influences access filtering) |

---

## Outputs

| Output | Consumer | Format |
|--------|----------|--------|
| Structured answer | UI Q&A interface, API consumer | `Answer` object (see Interfaces) |
| Retrieval metrics | Quality monitoring | `{ strategy, sources, latency, confidence }` |
| Feedback events | Quality improvement pipeline | `{ questionId, helpful: boolean, comment? }` |

---

## Behaviour

### Pipeline Stages

```
User Question (+ conversation context)
    │
    ▼
┌───────────────────────────┐
│ 1. Question Understanding │  Classify intent; extract entities; resolve references
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ 2. Query Planning         │  Decompose into sub-queries; select retrieval strategy
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ 3. Retrieval Execution    │  Execute queries across backends (graph, vector, keyword)
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ 4. Result Ranking         │  Score and rank results; select top-K for synthesis
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ 5. Answer Synthesis       │  Generate natural-language answer with citations
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ 6. Follow-up Generation   │  Suggest related questions
└───────────────────────────┘
```

### Stage 1: Question Understanding

- **Intent classification**: What type of answer is expected?
  - `entity_lookup`: "What is Decision X?"
  - `relationship_query`: "What rules does the amount limit decision use?"
  - `traversal`: "What services are affected if we change the payment limit?"
  - `comparison`: "How does v1.1 differ from v1.2 of the rulebook?"
  - `aggregation`: "How many decisions are automated in the Payments context?"
  - `explanation`: "How does timeout handling work?"
  - `compliance`: "Which regulations affect sanctions screening?"

- **Entity extraction**: Identify domain entities mentioned (map to graph IDs)
- **Reference resolution**: "it", "that service", "the same rule" → resolve from conversation context
- **Scope detection**: Does the question have implicit scope (persona context, previous navigation)?

### Stage 2: Query Planning

Based on the classified intent, decompose into executable sub-queries:

| Intent | Primary Strategy | Fallback |
|--------|-----------------|----------|
| `entity_lookup` | Direct graph lookup by extracted entity | Semantic search if entity not resolved |
| `relationship_query` | Graph traversal from entity | — |
| `traversal` | Multi-hop graph traversal (impact query) | — |
| `comparison` | Temporal query (two versions) + diff | Semantic search for both versions |
| `aggregation` | Filtered graph query with count | — |
| `explanation` | Semantic search + graph context enrichment | — |
| `compliance` | Graph traversal (regulation → concepts → services) | — |

### Stage 3: Retrieval Execution

Execute sub-queries via the Query Interface:
- **Graph queries**: Entity lookups, traversals, path finding
- **Semantic search**: Vector similarity for explanation-type questions
- **Hybrid**: Combine graph structure with semantic relevance

### Stage 4: Result Ranking

When multiple results are retrieved, rank by:
- **Relevance** to the question (semantic similarity to question embedding)
- **Authority** (source authority level)
- **Recency** (more recent entries preferred)
- **Confidence** (higher-confidence extractions preferred)
- **Connectivity** (well-connected entries more likely to be important)

Select top-K results (configurable, default: 10) for synthesis.

### Stage 5: Answer Synthesis

- Feed ranked results + original question to LLM for synthesis
- LLM produces a natural-language answer that:
  - Directly addresses the question
  - Cites specific entities with IDs (rendered as links in UI)
  - Indicates confidence level
  - Notes caveats or limitations
- Output is structured (not just text) — citations are separate fields, not inline text

### Stage 6: Follow-up Generation

- Based on the question and results, suggest 2–3 follow-up questions
- Follow-ups explore related paths (e.g., after "what services handle payments?" suggest "what are their dependencies?")
- Follow-ups are pre-computed and cached (cheap to generate during synthesis)

### Conversation Context

- Session maintains a sliding window of last N turns (configurable, default: 5)
- Each turn includes: question, intent, retrieved entities, answer
- Follow-up questions use context to resolve pronouns and implicit references
- Context is cleared on explicit session reset or after 30 minutes of inactivity

### Guardrails

- **Out-of-scope detection**: If the question is clearly outside the domain knowledge (e.g., "what's the weather?"), respond with a helpful message explaining what the system can answer
- **No-result handling**: If retrieval returns no relevant results, explain the gap rather than hallucinating
- **Confidence threshold**: If synthesis confidence is low, indicate uncertainty explicitly
- **Scope enforcement**: Never include information the user's role doesn't have access to, even in synthesised text

---

## Interfaces & Contracts

### QuestionAnsweringService

```typescript
interface QuestionAnsweringService {
  // Ask a question (with optional conversation context)
  ask(question: string, context: QAContext): Promise<Answer>;
  
  // Provide feedback on an answer
  feedback(answerId: string, helpful: boolean, comment?: string): Promise<void>;
}

interface QAContext {
  sessionId: string;                   // For conversation continuity
  userId: string;                      // For access filtering
  roles: string[];                     // For scope enforcement
  conversationHistory?: ConversationTurn[]; // Previous turns (or retrieved from session store)
}

interface Answer {
  id: string;
  question: string;
  intent: QuestionIntent;
  
  // The answer content
  text: string;                        // Natural-language answer
  confidence: 'high' | 'medium' | 'low';
  
  // Provenance
  citations: Citation[];               // Specific entities/sources referenced
  retrievalSources: {
    strategy: string;
    queriesExecuted: number;
    resultsConsidered: number;
    resultsUsed: number;
  };
  
  // Follow-ups
  suggestedFollowUps: string[];
  
  // Metadata
  latency: number;                     // Total pipeline time (ms)
  outOfScope: boolean;                 // True if question couldn't be answered
  caveats?: string[];                  // Limitations of the answer
}

interface Citation {
  entityId: string;
  entityType: InventoryType;
  entityName: string;
  relevance: number;                   // How relevant this citation is to the answer
  sourceDocument?: string;             // Original source for provenance
}

interface ConversationTurn {
  question: string;
  answer: string;
  entities: string[];                  // Entity IDs mentioned
  intent: QuestionIntent;
  timestamp: string;
}

type QuestionIntent = 
  | 'entity_lookup'
  | 'relationship_query'
  | 'traversal'
  | 'comparison'
  | 'aggregation'
  | 'explanation'
  | 'compliance';
```

---

## Dependencies

| Depends on | Reason |
|------------|--------|
| Query Interface | Executes structured queries (graph, vector, keyword) |
| LLM Gateway | Intent classification, answer synthesis, follow-up generation |
| Authentication & Authorisation | Access filtering for results |
| Session store | Conversation history persistence |

| Depended on by | Reason |
|----------------|--------|
| GraphQL API Layer (`askQuestion` mutation) | API entry point |
| UI Q&A Interface | Displays answers |
| Feedback pipeline | Receives answer quality signals |

---

## Key Decisions

### Decision 1: Query Translation Approach

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **LLM-based translation (NL → query directly)** | Handles complex questions; flexible; adapts to new query patterns without code changes | Non-deterministic; expensive per question; may generate invalid queries; hard to debug |
| **Template-based (intent → query template → fill slots)** | Deterministic; fast; cheap; predictable; debuggable | Limited to predefined intents; can't handle novel question patterns; many templates needed |
| **Hybrid (classify intent → template if possible, LLM if not)** | Best coverage; cheap for common questions; LLM handles edge cases; graceful fallback | More complex; must maintain both paths; must decide routing |

**Recommendation: Hybrid (intent classification → template for known patterns, LLM for novel)**

*Rationale*: Most questions fall into a small number of patterns ("what is X?", "what does X affect?", "show me all X in Y"). Templates handle these cheaply and deterministically. Novel or complex questions (10-20% of traffic) fall back to LLM-based query generation. The intent classifier routes between paths. This gives us speed and cost efficiency for common cases with full coverage for edge cases.

---

### Decision 2: Retrieval Strategy

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Graph-only** | Precise; structured; deterministic; cheap | Can't handle vague questions; no semantic understanding of question; misses paraphrases |
| **Vector-only (RAG)** | Handles semantic questions; robust to paraphrasing | No structure awareness; may retrieve tangential results; doesn't leverage graph relationships |
| **Hybrid (graph + vector)** | Best of both; graph for structured queries, vector for semantic; rich results | More complex; must merge results from different sources; ranking across sources is non-trivial |

**Recommendation: Hybrid retrieval (graph-first with vector enrichment)**

*Rationale*: Our data is a graph with rich structure — graph queries should be primary for relationship, traversal, and lookup intents. Vector search enriches results for explanation and comparison intents where semantic similarity adds value. The query planner decides the mix based on classified intent. This leverages our primary investment (the knowledge graph) while benefiting from semantic capabilities.

---

### Decision 3: Answer Synthesis Model

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Template-based answers (fill-in-the-blank)** | Deterministic; fast; cheap; no hallucination risk | Robotic-sounding; limited to pre-defined response patterns; poor for explanation-type questions |
| **LLM synthesis (retrieved context → prose)** | Natural language; handles any question type; explains complex relationships | Hallucination risk; expensive; slower; may inject information not in retrieved results |
| **LLM synthesis with strict grounding** | Natural language + grounded in retrieved facts only; citations enforced; hallucination mitigated | Still needs LLM call; slightly less fluent than unconstrained; citation validation overhead |

**Recommendation: LLM synthesis with strict grounding**

*Rationale*: Users expect natural-language answers for a Q&A interface. Template-based responses would feel like a search engine, not a knowledge assistant. Strict grounding (the LLM is instructed to answer ONLY from provided context, with explicit citations) mitigates hallucination risk. We validate that every claim in the answer maps to a retrieved entity — any unsupported claim is flagged or removed.

---

### Decision 4: Conversation Context Strategy

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Stateless (each question independent)** | Simple; scalable; no session management; predictable | Can't resolve "it", "that", follow-ups broken; poor UX |
| **Full history (send all previous turns to LLM)** | Rich context; handles complex reference chains; natural conversation | Token cost grows with conversation; may confuse long conversations; expensive |
| **Sliding window (last N turns)** | Bounded cost; handles most references; manageable context size | May lose context from earlier turns; arbitrary cutoff; long conversations degrade |
| **Summarised history (condense old turns into summary)** | Bounded but retains old context in compressed form; handles long conversations | Summary may lose detail; summarisation adds latency and cost; information loss |

**Recommendation: Sliding window (last 5 turns) with entity memory**

*Rationale*: Most follow-up references point to the immediately preceding turns. A 5-turn window covers the vast majority of cases. Additionally, we maintain an "entity memory" — a list of all entities mentioned in the conversation (by ID) — which survives beyond the window. This allows "what about that service we discussed earlier?" to resolve even if the mention was 10 turns ago. The entity list is cheap to maintain and highly useful for resolution.

---

## Open Questions

1. **Question reformulation**: Should we rephrase unclear questions before processing ("Did you mean...?") or always attempt an answer?
2. **Multi-language support**: Should the Q&A pipeline handle questions in languages other than English? If so, translation layer vs. multilingual embeddings?
3. **Answer caching**: Should identical questions (from any user) return cached answers? What about access-filtered results that differ per user?
