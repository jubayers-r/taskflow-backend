#!/usr/bin/env sh
# Uploads the local nightly pg_dump volume to offsite object storage so a
# server/disk failure cannot destroy the backups too ("backups must live offsite").
#
# Requires rclone on the host (or in a scheduler container) with a remote named
# in RCLONE_REMOTE. Example:
#
#   rclone config create backups3 s3 provider Cloudflare \
#     access_key_id ... secret_access_key ... region auto
#   RCLONE_REMOTE="backups3:taskflow-backups" ./scripts/backup-offsite.sh
set -eu

REMOTE="${RCLONE_REMOTE:?set RCLONE_REMOTE, e.g. backups3:taskflow-backups}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"

if ! command -v rclone >/dev/null 2>&1; then
  echo "rclone is not installed" >&2
  exit 1
fi

if [ ! -d "$BACKUP_DIR" ]; then
  echo "backup dir not found: $BACKUP_DIR" >&2
  exit 1
fi

echo "Syncing $BACKUP_DIR -> $REMOTE"
rclone sync "$BACKUP_DIR" "$REMOTE" --create-empty-src-dirs --fast-list

echo "Offsite backup sync complete at $(date -u +%Y-%m-%dT%H:%M:%SZ)"