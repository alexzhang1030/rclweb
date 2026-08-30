#!/usr/bin/env bash
# Sign packed rclwebd debs and write the apt repo (ADR 0019).
#
# Required env:
#   RCLWEB_APT_GPG_PRIVATE_KEY
# Optional:
#   RCLWEB_APT_GPG_PASSPHRASE
#   GITHUB_OUTPUT   — writes signed=0|1 for Actions
#
# Usage:
#   scripts/publish-signed-apt.sh --debs-dir DIR --out-dir DIR
set -euo pipefail

DEBS_DIR=""
OUT_DIR=""

usage() {
  grep '^#' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --debs-dir) DEBS_DIR="$2"; shift 2 ;;
    --out-dir) OUT_DIR="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$DEBS_DIR" || -z "$OUT_DIR" ]]; then
  echo "error: --debs-dir and --out-dir are required" >&2
  exit 2
fi

set_signed() {
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "signed=$1" >> "${GITHUB_OUTPUT}"
  fi
}

if [[ -z "${RCLWEB_APT_GPG_PRIVATE_KEY:-}" ]]; then
  echo "RCLWEB_APT_GPG_PRIVATE_KEY is empty; signed apt repo skipped"
  set_signed 0
  exit 0
fi

ROOT="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

gnupg="$(mktemp -d)"
chmod 700 "${gnupg}"
export GNUPGHOME="${gnupg}"
printf '%s\n' "${RCLWEB_APT_GPG_PRIVATE_KEY}" > "${gnupg}/secret.asc"
if [[ -n "${RCLWEB_APT_GPG_PASSPHRASE:-}" ]]; then
  gpg --batch --pinentry-mode loopback --passphrase "${RCLWEB_APT_GPG_PASSPHRASE}" --import "${gnupg}/secret.asc"
else
  gpg --batch --import "${gnupg}/secret.asc"
fi
gpg --batch --output "${gnupg}/rclweb-archive-keyring.gpg" --export
bun run scripts/pack-rclweb-apt-source.ts \
  --keyring "${gnupg}/rclweb-archive-keyring.gpg" \
  --out-dir "${DEBS_DIR}"
bun run scripts/publish-apt-repo.ts --debs-dir "${DEBS_DIR}" --out-dir "${OUT_DIR}"
set_signed 1
