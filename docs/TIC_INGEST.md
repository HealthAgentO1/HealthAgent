# US TIC offline ingest and network tables

This project stores a **coarse** “insurer ↔ organizational NPI” projection from CMS **Transparency in Coverage** machine-readable files. It supports the Symptom Check **nearby facilities** API: when the client sends `insurer_slug` **and** we have ingested rows for that slug, each facility row includes `in_network` (`true` / `false`). Otherwise `in_network` is `null` (same as omitting the slug).

This is **not** member-specific eligibility. Posted payer files are plan- and product-granular; the checked-in manifest loads **Centene / Ambetter** (multiple state Ambetter JSON MRFs), **Cigna**, **Health Net**, and **Fidelis Care** where public JSON TOCs/MRFs are reliably fetchable. Symptom Check also lists other national payers in the UI without ingest rows until optional sources are added.

**Fidelis / facility matching:** ingested Fidelis rows are mostly **NPI-1** individuals from posted files, while Symptom Check’s nearby hospital list uses **NPI-2** organizational NPIs from NPPES, so the API does **not** apply true/false in-network flags for `fidelis` (every row would otherwise read as out-of-network). Other slugs in the manifest are dominated by org NPIs where overlap is meaningful.

## Manifest and optional mapping

- [`api/data/tic_us_manifest.json`](../api/data/tic_us_manifest.json): per-slug `table_of_contents_urls` (TOC JSON) plus optional `direct_in_network_file_urls` (direct MRF JSON links). **Order matters for `direct_in_network_file_urls`:** ingest walks that array in order, and `--max-files-per-insurer N` takes the first `N` URLs after the manifest’s combined list is built—so put the states you care about first (Centene Ambetter is ordered large-state–first). **Only TOC-derived URLs** are re-ordered (by filename heuristics: in-network / negotiated-rate paths score above allowed-amount style names); direct links are **not** re-sorted so publisher intent and `--max-files-per-insurer` caps stay predictable.
- [`api/data/tic_reporting_entity_rules.json`](../api/data/tic_reporting_entity_rules.json): placeholder for future rules when one TOC must be split across multiple slugs.

**Centene** uses direct Ambetter per-state in-network JSON URLs on `centene.com` (see manifest). Dates in the path change when Centene republishes—copy current links from [Centene price transparency](https://www.centene.com/price-transparency-files.html) if ingest starts 404ing.

**United**, **Elevance/Anthem**, and **Aetna** often publish TOCs behind SPA pages, CloudFront bot rules, or signed blob URLs. If `ingest_tic_network` finds no JSON files for those slugs, add working `direct_in_network_file_urls` from each payer’s compliance page or run ingest on a machine/browser session that can resolve their current index.

### URL discovery (TOC expansion)

Implementation: `api/services/tic_ingest.py` (`_gather_mrf_urls_for_insurer`, `_expand_toc_seeds_to_leaf_mrf_urls`). For each insurer, **direct** manifest URLs are collected first (deduped, order preserved), then **TOC seeds** are downloaded and parsed repeatedly (`discover_json_file_urls_from_toc` in `api/services/tic_toc.py`) until leaf JSON URLs are reached or a hop limit is hit. When a single TOC fans out to very many child URLs (e.g. some regional payers), ingest treats those children as **leaf MRF links** without recursively downloading each child—this keeps deep indexes tractable. The final download list is **`direct_urls + toc_sorted`**.

### TLS on macOS / dev

Downloads use **certifi** CA bundles by default. If you still see certificate errors, you can temporarily set `TIC_INGEST_SSL_VERIFY=0` (dev only; not for production jobs).

## Ingest command

From the repo root (with Django settings and database configured):

```bash
python manage.py ingest_tic_network --manifest api/data/tic_us_manifest.json
```

Useful flags:

- `--insurer centene` — only one manifest slug.
- `--max-files-per-insurer 20` — cap files (testing or partial loads).
- `--clear-insurer cigna` — delete existing rows + `TicSourceFile` rows for that slug before loading.
- `--dry-run` — load and validate manifest only (no downloads or DB writes).
- `--force-reparse` — reprocess a file even if the same URL+SHA was already ingested.
- `--notes "…"` — free-text provenance stored on `NetworkDatasetVersion` alongside the git commit (optional).

Downloads are cached under `data/tic_raw/` (gitignored). Content-addressed files are stored as `{sha256}.json`.

Environment:

- `SOURCE_GIT_COMMIT` or `GITHUB_SHA` — recorded on `NetworkDatasetVersion` for provenance.

## Background daemon (periodic re-ingest)

[`scripts/tic_ingest_daemon.sh`](../scripts/tic_ingest_daemon.sh) runs `ingest_tic_network` on a loop, appends each run to a log (default `data/tic_raw/ingest_daemon.log`), and prints the same lines to stdout. Already-processed URL+SHA pairs are skipped until Centene (or others) publish new files.

From repo root with Compose already up:

```bash
nohup env USE_DOCKER=1 ./scripts/tic_ingest_daemon.sh >>data/tic_raw/daemon.nohup.out 2>&1 &
```

Useful env vars: `TIC_DAEMON_INTERVAL_SECONDS` (default `86400`), `TIC_DAEMON_LOG`, `TIC_DAEMON_INSURER` (single slug per cycle), `TIC_DAEMON_FORCE_REPARSE=1`, `TIC_DAEMON_MANIFEST`, `TIC_DAEMON_RESET_LOG=1` (truncate log once on startup so `tail -f` is not confused by old errors). One-shot: `./scripts/tic_ingest_daemon.sh --once`.

Each cycle invokes ingest with **`--notes "tic_daemon <UTC ISO timestamp>"`** so dataset versions created from the daemon are identifiable in the database.

## Postgres dump and restore

After migrations exist on the target database, move **data only** for the three tables (names assume default Django `api_` prefix):

```bash
export DATABASE_URL="postgres://USER:PASS@HOST:5432/DBNAME"

pg_dump --format=custom --no-owner --data-only \
  --table=api_insurernetworknpi \
  --table=api_ticsourcefile \
  --table=api_networkdatasetversion \
  --file=network_tables.dump \
  "$DATABASE_URL"
```

Restore into a database that already has the same schema (run migrations first):

```bash
pg_restore --no-owner --data-only --dbname="$DATABASE_URL" network_tables.dump
```

If tables are not empty, truncate them before restore or use a staging DB and swap strategies your team prefers.

Wrappers: [`scripts/dump_network_tables.sh`](../scripts/dump_network_tables.sh) (custom `pg_dump` format) and [`scripts/dump_network_tables_sql.sh`](../scripts/dump_network_tables_sql.sh) (plain `.sql`, same tables). For Docker Compose from the repo root: `USE_DOCKER=1 ./scripts/dump_network_tables_sql.sh data/network_providers.sql`.

## Runtime API

`POST /api/symptom/nearby-facilities/` accepts optional `insurer_slug` (see `INSURER_SLUGS` in `api/views_symptom.py`). When that slug has ingested NPI rows, responses set `in_network` to `true` or `false` per facility; otherwise `in_network` is `null`.
