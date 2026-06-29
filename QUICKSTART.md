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

Point it at a folder of documents (Markdown, plaintext, JSON, PDF), name your domain, and let the
system build the graph:

```bash
cp .env.example .env                 # set ANTHROPIC_API_KEY
./scripts/dkm process <path-to-your-docs> --domain lending
DKM_DOMAIN=lending docker compose up   # the UI now serves YOUR graph
# → http://localhost:5173
```

**Where do the docs go?** Nowhere special — you pass the **path** to wherever they already are.
The folder is mounted read-only into the processor; it is never copied into the repo. The path
can be absolute or relative, and the folder is scanned recursively for `.md` / `.txt` / `.json` / `.pdf`:

```bash
./scripts/dkm process /home/you/work/lending-docs --domain lending   # absolute
./scripts/dkm process ../shared/policies --domain lending            # relative
```

Run `./scripts/dkm` from the repo root (so Docker Compose finds its config and the `./data`
volume). The only thing written into the repo is the output — `data/<domain>/`.

> **PDFs:** extraction is **basic** — it pulls the text layer (one `## Page N` section per page).
> Text-based PDFs work well; **scanned / image-only PDFs have no text layer**, so they're
> skipped-and-reported (you'll see a `⚠ skipped …` line), not silently emitted as blank. A richer
> layout-aware connector (tables, figures — e.g. a LlamaParse-style adapter) is a planned add-on.

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
./scripts/dkm process <path-to-your-docs> --domain lending --fake
```

Options: `--domain <name>` (required), `--fake` (no LLM), `--authority <regulatory|scheme|vendor|project|operational>`
(provenance authority stamped on every assertion; default `operational`).

### Normalise duplicate concepts (optional)

Extraction is per-document, so the same concept named slightly differently across documents
(e.g. *Conflict of Interest* / *Conflicts of Interest*, *Proxy Voting Guidelines* / *WBIM Proxy
Voting Guidelines*) becomes several near-duplicate nodes. The **normalise** pass merges the ones
that are genuinely the same — for a clearer picture of the true domain:

```bash
./scripts/dkm normalise lending          # LLM-adjudicated (needs ANTHROPIC_API_KEY)
DKM_DOMAIN=lending docker compose up      # serves the cleaned-up graph
```

A cheap deterministic step first **blocks** look-alike names into small candidate clusters (so most
entities never reach the LLM); Claude then judges each cluster, merging true synonyms while keeping
distinct-but-similar concepts apart (e.g. *Scope 1/2/3 Emissions* stay separate, a *Policy* stays
distinct from its *Guidelines*). It edits `data/<domain>/{extractions,relationships}.jsonl` **in
place**, backs the originals up to `data/<domain>/pre-normalisation/`, and writes a
`normalisation-report.json` of exactly what merged into what. `--fake` exercises the wiring with no
key (merges nothing); `--min-similarity <0-1>` tunes how aggressively names are clustered
(default `0.67`; lower = more aggressive).

→ For how it works (the block → adjudicate → merge cascade, tuning, and the audit report), see
[docs/entity-normalisation.md](docs/entity-normalisation.md).

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
