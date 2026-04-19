#!/usr/bin/env bash
# Periodic full-manifest TIC ingest with timestamped logs (runs until stopped).
# Log line "tic_ingest_daemon revision=3" confirms this copy (fixes set -u + empty arrays + no pipe subshell).
#
# Repo root:
#   nohup env USE_DOCKER=1 ./scripts/tic_ingest_daemon.sh >>data/tic_raw/daemon.nohup.out 2>&1 &
#
# One full pass then exit (smoke test):
#   USE_DOCKER=1 ./scripts/tic_ingest_daemon.sh --once
#
# Env:
#   USE_DOCKER=1          — run `docker compose exec django …` (from repo root; compose must be up).
#   TIC_DAEMON_INTERVAL_SECONDS — seconds between runs (default 86400 = 24h).
#   TIC_DAEMON_LOG        — append log file (default: data/tic_raw/ingest_daemon.log).
#   TIC_DAEMON_INSURER    — optional: pass --insurer <slug> for a single slug each cycle.
#   TIC_DAEMON_FORCE_REPARSE=1 — add --force-reparse every cycle (heavy).
#   TIC_DAEMON_MANIFEST   — manifest path relative to repo root (default api/data/tic_us_manifest.json).
#   TIC_DAEMON_RESET_LOG=1 — truncate the log file once on this start (drops old errors; use after fixing the script).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RUN_ONCE=false
if [[ "${1:-}" == "--once" ]]; then
  RUN_ONCE=true
fi

INTERVAL="${TIC_DAEMON_INTERVAL_SECONDS:-86400}"
LOG="${TIC_DAEMON_LOG:-$ROOT/data/tic_raw/ingest_daemon.log}"
MANIFEST="${TIC_DAEMON_MANIFEST:-api/data/tic_us_manifest.json}"
mkdir -p "$(dirname "$LOG")"
if [[ "${TIC_DAEMON_RESET_LOG:-}" == "1" ]]; then
  : >"$LOG"
fi
# Banner so `tail -f` can tell this process from older lines still in the log.
echo "---- $(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date) tic_ingest_daemon revision=3 pid=$$ ----" >>"$LOG"

ingest_cmd() {
  local notes="tic_daemon $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # Single argv array (always non-empty) — avoids set -u pitfalls with optional flags on macOS bash.
  local -a cmd=(python manage.py ingest_tic_network --manifest "$MANIFEST")
  if [[ -n "${TIC_DAEMON_INSURER:-}" ]]; then
    cmd+=(--insurer "$TIC_DAEMON_INSURER")
  fi
  if [[ "${TIC_DAEMON_FORCE_REPARSE:-}" == "1" ]]; then
    cmd+=(--force-reparse)
  fi
  cmd+=(--notes "$notes")

  if [[ "${USE_DOCKER:-}" == "1" ]]; then
    docker compose exec -T django "${cmd[@]}"
  else
    "${cmd[@]}"
  fi
}

echo "tic_ingest_daemon revision=3 log=$LOG interval=${INTERVAL}s USE_DOCKER=${USE_DOCKER:-0} insurer=${TIC_DAEMON_INSURER:-all}"

while true; do
  echo ""
  echo "================================================================"
  echo "$(date -Iseconds)  TIC ingest cycle start"
  echo "================================================================"
  # Run ingest in this shell (no `cmd | tee` subshell) so `local cmd=()` is reliable on macOS bash.
  tmpfile=$(mktemp "${TMPDIR:-/tmp}/tic_daemon.XXXXXX")
  set +e
  ingest_cmd >"$tmpfile" 2>&1
  ec=$?
  set -e
  tee -a "$LOG" <"$tmpfile"
  rm -f "$tmpfile"
  echo "$(date -Iseconds)  TIC ingest cycle end exit_code=$ec"
  echo ""

  if $RUN_ONCE; then
    exit "$ec"
  fi

  echo "$(date -Iseconds)  sleeping ${INTERVAL}s until next cycle…"
  sleep "$INTERVAL"
done
