#!/usr/bin/env bash
set -euo pipefail

# Data-only dump of insurer network tables for deployment.
# Requires: DATABASE_URL (postgres), pg_dump on PATH, schema already migrated.

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set." >&2
  exit 1
fi

OUT="${1:-network_tables.dump}"

pg_dump --format=custom --no-owner --data-only \
  --table=api_insurernetworknpi \
  --table=api_ticsourcefile \
  --table=api_networkdatasetversion \
  --file="$OUT" \
  "$DATABASE_URL"

echo "Wrote $OUT"
