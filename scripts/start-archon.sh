#!/usr/bin/env bash
#
# start-archon.sh — launch an Archon workflow in the background with the
# environment + logging conventions this repo learned the hard way.
#
# Why this wrapper exists (see CLAUDE.md "Operational gotchas"):
#   1. Sets ARCHON_SUPPRESS_NESTED_CLAUDE_WARNING=1 so runs don't hang silently
#      when launched from inside Claude Code (which exports CLAUDECODE=1).
#   2. Runs the workflow DETACHED and streams RAW output to a log file. Never
#      pipe archon through `tail`/`head` — the pipe buffers and hides all
#      interim output until the run ends, making a healthy run look dead.
#   3. Issues a SINGLE archon command (compound `&&`/`;` one-liners trip the
#      permission gate, and the skill's own health-check can too).
#
# This wrapper is for worktree-based WORKFLOW runs (which take --branch), e.g.
# `archon-feature-development` and `flesh-out-phase`. It is NOT for
# `archon-assist`, which runs in the live checkout and rejects --branch
# (checkout a branch yourself first — see CLAUDE.md gotcha #4).
#
# Usage:
#   ./scripts/start-archon.sh <workflow> <branch> "<brief>"
#   ./scripts/start-archon.sh <workflow> <branch> -f path/to/brief.md
#   echo "<brief>" | ./scripts/start-archon.sh <workflow> <branch> -
#
# Example:
#   ./scripts/start-archon.sh archon-feature-development \
#       feat/phase1-1-fs-connector "Implement ONLY Feature #5 ..."
#
# Then watch progress (raw, unbuffered):
#   tail -f logs/archon/<branch>-<timestamp>.log
#
# Env:
#   DRY_RUN=1   print the command that would run, don't launch.
#
set -euo pipefail

usage() {
  sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-1}"
}

[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && usage 0
[[ $# -lt 3 ]] && { echo "error: expected <workflow> <branch> <brief>" >&2; usage 1; }

workflow=$1
branch=$2
brief_arg=$3

# Resolve the brief: inline string, -f <file>, or - (stdin).
case "$brief_arg" in
  -f)
    [[ $# -lt 4 ]] && { echo "error: -f needs a file path" >&2; exit 1; }
    [[ -r "$4" ]] || { echo "error: cannot read brief file: $4" >&2; exit 1; }
    brief=$(cat "$4")
    ;;
  -)
    brief=$(cat)
    ;;
  *)
    brief=$brief_arg
    ;;
esac

[[ -n "${brief// /}" ]] || { echo "error: brief is empty" >&2; exit 1; }

# Anchor paths to the repo root so the script runs from anywhere.
repo_root=$(git rev-parse --show-toplevel)
log_dir="$repo_root/logs/archon"
mkdir -p "$log_dir"

# Branch names contain slashes; flatten for the log filename.
safe_branch=${branch//\//-}
ts=$(date +%Y%m%d-%H%M%S)
log_file="$log_dir/${safe_branch}-${ts}.log"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "DRY_RUN — would launch:"
  echo "  ARCHON_SUPPRESS_NESTED_CLAUDE_WARNING=1 archon workflow run $workflow --branch $branch <brief>"
  echo "  log -> $log_file"
  echo "--- brief ---"
  printf '%s\n' "$brief"
  exit 0
fi

# Single, detached archon invocation. Raw output -> log (no buffering pipe).
ARCHON_SUPPRESS_NESTED_CLAUDE_WARNING=1 \
  nohup archon workflow run "$workflow" --branch "$branch" "$brief" \
  >"$log_file" 2>&1 &
pid=$!

echo "launched archon workflow run '$workflow' on branch '$branch'"
echo "  pid: $pid"
echo "  log: $log_file"
echo "watch with:  tail -f $log_file"
