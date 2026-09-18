#!/usr/bin/env sh
# Restore a compressed pg_dump into a target Postgres. Untested backups are not
# backups — run this against a throwaway database before you ever need it.
#
# Usage:
#   DATABASE_URL="postgresql://user:pass@host:5432/db" \
#     ./scripts/restore-db.sh /backups/daily/db_2026-09-18.dump.gz
#
# For a clean restore, drop/recreate the schema first:
#   psql "$DATABASE_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
set -eu

DUMP="${1:?usage: restore-db.sh <dump.sql.gz>}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"

if [ ! -f "$DUMP" ]; then
  echo "dump not found: $DUMP" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql (postgresql client) is not installed" >&2
  exit 1
fi

gunzip -c "$DUMP" | psql "$DATABASE_URL" --set=ON_ERROR_STOP=1
echo "Restore complete from $DUMP at $(date -u +%Y-%m-%dT%H:%M:%SZ)"