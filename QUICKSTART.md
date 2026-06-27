# Quickstart

Turn a folder of source material into a living **knowledge graph** you can explore in a UI —
and whose intermediate files you can analyse with your own LLM.

There are two ways in:

- **Tier A — see it in ~2 minutes (zero secrets).** One command brings up the stack seeded with a
  bundled **Payments** demo, so you can explore a real knowledge graph immediately.
- **Tier B — your domain, your documents.** Point the processor at your own docs and an LLM key;
  it extracts a typed graph you then explore in the same UI. *(In progress — see below.)*

---

## Prerequisites

- **Docker** (Engine 24+ / Compose v2). That's it for Tier A — no Node, Python, or secrets needed.

Check:

```bash
docker compose version
```

---

## Tier A — explore the bundled demo

From the repo root:

```bash
docker compose up
```

The first run builds the image (a few minutes); later runs start in seconds. When it's up:

| Service | URL | What it is |
|---|---|---|
| **Knowledge Studio** (UI) | <http://localhost:5173> | The explorer — graph canvas, sortable/filterable list/table, context panel |
| **GraphQL API** | <http://localhost:4000/graphql> | The gateway over the knowledge graph |

Open **<http://localhost:5173>** and:

- **Explore** the graph canvas — pan/zoom, filter by layer, expand nodes.
- Switch to **list/table** mode for a sortable, faceted, fully keyboard-accessible view.
- **Select** any node or row to open the **context panel** — full detail, relationships, and the
  source evidence behind every assertion.

Stop with `Ctrl-C` (or `docker compose down` to remove the containers).

### What just happened

```
demo/*.jsonl  →  GraphLoader  →  in-memory graph  →  GraphQL gateway  →  Knowledge Studio
```

The gateway seeds from JSONL. With no data of your own it serves the bundled
`demo/payments-*.jsonl`; drop your own JSONL into `./data` and it serves that instead (next).

---

## Tier B — your domain, your documents

Drop a folder of documents (Markdown, plaintext, JSON), name your domain, and let the system
build the graph:

```bash
cp .env.example .env                 # set ANTHROPIC_API_KEY
./scripts/dkm process ./my-docs --domain lending
DKM_DOMAIN=lending docker compose up   # the UI now serves YOUR graph
# → http://localhost:5173
```

`dkm process` runs the full pipeline over your documents, in Docker (no local Node/Python needed):

```
your docs  →  [connectors]  →  canonical documents  →  [LLM extraction]
           →  data/<domain>/*.jsonl  →  [graph]  →  explore in the UI
```

It writes the typed **intermediate JSONL** to `data/<domain>/` — `extractions.jsonl`
(typed inventory entries) and `relationships.jsonl` (the edges between them), plus a
`metadata.json` run report. Selecting the domain (`DKM_DOMAIN=lending`) points the gateway at it.

**Try the wiring with no key first** — `--fake` runs the whole pipeline with a deterministic stub
(produces an empty graph, but proves connectors → extraction → serve end to end):

```bash
./scripts/dkm process ./my-docs --domain lending --fake
```

Options: `--domain <name>` (required), `--fake` (no LLM), `--authority <regulatory|scheme|vendor|project|operational>`
(provenance authority stamped on every assertion; default `operational`).

### Analyse the intermediate files with your own LLM

The `data/<domain>/*.jsonl` are plain, typed records — feed them straight to your LLM for ad-hoc
analysis (gap-finding, contradiction checks, summaries) without touching the UI:

```bash
./scripts/analyse-with-llm.sh lending "Which decisions lack a clear owner or evidence?" | claude -p
# (pipe to any LLM CLI, or redirect to a file and paste into a chat)
```

The script assembles a self-contained prompt — the typed entries + relationships + your question —
that any model can answer over. It's plain text in, plain text out: nothing here is Claude-specific.

---

## Configuration

The gateway chooses its data source from the environment (set in `docker-compose.yml` or `.env`):

| Variable | Meaning |
|---|---|
| `DKM_DOMAIN` | Serve a processed domain — `data/<DKM_DOMAIN>/*.jsonl`. Falls back to the demo if unprocessed. |
| `DKM_DATA_DIR` | Directory whose `*.jsonl` files are served (default `./data`). Empty/missing → the bundled demo. |
| `DKM_JSONL` | Explicit comma-separated JSONL paths (takes precedence over the above). |
| `PORT` | Gateway port (default `4000`). |
| `ANTHROPIC_API_KEY` | LLM key for `dkm process` extraction (Tier B; not needed with `--fake`). |

---

## Troubleshooting

- **Ports already in use (4000 / 5173).** Stop the other process, or remap the left-hand side under
  `ports:` in `docker-compose.yml`.
- **Changed the code?** Rebuild: `docker compose up --build`.
- **UI loads but shows nothing.** Check the gateway is healthy:
  `curl -s localhost:4000/graphql -H 'content-type: application/json' -d '{"query":"{ entries(type:\"DomainConcept\"){ totalCount } }"}'`.
- **Fresh start.** `docker compose down` then `docker compose up`.
