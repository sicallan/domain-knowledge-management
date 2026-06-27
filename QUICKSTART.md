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

## Tier B — your domain, your documents *(in progress)*

The target experience:

```bash
cp .env.example .env                 # set ANTHROPIC_API_KEY
./scripts/dkm process ./my-docs --domain lending
docker compose up                    # the UI now serves YOUR graph
```

`dkm process` runs the full pipeline over your documents:

```
your docs  →  [connectors]  →  canonical documents  →  [LLM extraction]
           →  data/<domain>/*.jsonl  →  [graph]  →  explore in the UI
```

It writes the typed **intermediate JSONL** to `data/<domain>/` — `extractions.jsonl`
(typed inventory entries) and `relationships.jsonl` (the edges between them). The gateway picks
those up automatically (the `./data` volume + `DKM_DATA_DIR`).

### Analyse the intermediate files with your own LLM

The same `data/<domain>/*.jsonl` are plain, typed records — feed them straight to your LLM for
ad-hoc analysis (gap-finding, contradiction checks, summaries) without touching the UI. A starter
recipe will live here.

> **Status:** Tier A is live and validated. The `dkm process` CLI and its processor container are
> the next deliverable; the gateway, the `./data` data-source switch, and the compose stack that
> Tier B relies on are already in place.

---

## Configuration

The gateway chooses its data source from the environment (set in `docker-compose.yml` or `.env`):

| Variable | Meaning |
|---|---|
| `DKM_DATA_DIR` | Directory whose `*.jsonl` files are served. Empty/missing → the bundled demo. |
| `DKM_JSONL` | Explicit comma-separated JSONL paths (takes precedence over `DKM_DATA_DIR`). |
| `PORT` | Gateway port (default `4000`). |
| `ANTHROPIC_API_KEY` | LLM key for `dkm process` extraction (Tier B only). |

---

## Troubleshooting

- **Ports already in use (4000 / 5173).** Stop the other process, or remap the left-hand side under
  `ports:` in `docker-compose.yml`.
- **Changed the code?** Rebuild: `docker compose up --build`.
- **UI loads but shows nothing.** Check the gateway is healthy:
  `curl -s localhost:4000/graphql -H 'content-type: application/json' -d '{"query":"{ entries(type:\"DomainConcept\"){ totalCount } }"}'`.
- **Fresh start.** `docker compose down` then `docker compose up`.
