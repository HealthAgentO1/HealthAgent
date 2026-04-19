#!/usr/bin/env bash
set -euo pipefail

# Plain SQL, data-only dump of insurer network tables (Django default api_* names).
# Tables: organizational NPIs per insurer slug, ingest file metadata, dataset version rows.
#
# From repo root with Docker Compose DB running:
#   USE_DOCKER=1 ./scripts/dump_network_tables_sql.sh data/network_providers.sql
#
# With a connection string (schema must already exist on target):
#   export DATABASE_URL="postgres://USER:PASS@HOST:5432/DBNAME"
#   ./scripts/dump_network_tables_sql.sh data/network_providers.sql

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT="${1:-network_providers.sql}"
mkdir -p "$(dirname "$OUT")"

TABLES=(
  --table=api_insurernetworknpi
  --table=api_ticsourcefile
  --table=api_networkdatasetversion
)

if [[ "${USE_DOCKER:-}" == "1" ]]; then
  PGUSER="${POSTGRES_USER:-myprojectuser}"
  PGDATABASE="${POSTGRES_DB:-myprojectdb}"
  export PGPASSWORD="${POSTGRES_PASSWORD:-password}"
  docker compose exec -T db pg_dump \
    --format=plain \
    --no-owner \
    --data-only \
    "${TABLES[@]}" \
    -U "$PGUSER" \
    -d "$PGDATABASE" \
    >"$OUT"
else
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "Set DATABASE_URL, or USE_DOCKER=1 with docker compose up (see script header)." >&2
    exit 1
  fi
  pg_dump \
    --format=plain \
    --no-owner \
    --data-only \
    "${TABLES[@]}" \
    --file="$OUT" \
    "$DATABASE_URL"
fi

echo "Wrote $OUT"
