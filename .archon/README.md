# Archon configuration

This directory configures [Archon](https://archon.diy) for spec-driven, parallel development
of the Domain Knowledge Management platform. Archon runs AI workflows in isolated git
worktrees off `main`.

## Layout

| Path | Committed? | Purpose |
|---|---|---|
| `config.yaml` | yes | Repo-level config (assistant, worktree settings) |
| `commands/` | yes | Reusable prompt templates for `command:` workflow nodes |
| `workflows/` | yes | YAML workflow definitions |
| `scripts/` | yes | Named `.ts`/`.js` (bun) or `.py` (uv) scripts for `script:` nodes |
| `state/` | **no** (gitignored) | Cross-run workflow state — runtime only |
| `.env` | **no** (gitignored) | Repo-scoped Archon secrets |

## Quick start

```bash
# Confirm Archon sees this repo (lists bundled + repo workflows)
archon workflow list

# Run the spec-implementation command template against a spec
# (see commands/implement-spec.md)
```

## Conventions for this repo

- All work is **TDD-first** and honours the **OCP extension points** — see [../CLAUDE.md](../CLAUDE.md).
- Worktrees branch from `main`; one spec/feature per worktree.
- Put `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` in `~/.archon/.env`, not here.
- Need a full spec-build DAG workflow? Ask Claude to author one in `workflows/` — the
  `implement-spec` command is the building block.
