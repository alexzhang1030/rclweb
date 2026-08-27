#!/usr/bin/env bash
# Force-push a built apt repo to the gh-pages branch (ADR 0019).
#
# Required env: GH_TOKEN, GITHUB_REPOSITORY, VERSION
# Usage: scripts/push-apt-gh-pages.sh --repo-dir DIR
set -euo pipefail

REPO_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-dir) REPO_DIR="$2"; shift 2 ;;
    *) echo "error: unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$REPO_DIR" ]]; then
  echo "error: --repo-dir is required" >&2
  exit 2
fi
if [[ -z "${GH_TOKEN:-}" || -z "${GITHUB_REPOSITORY:-}" || -z "${VERSION:-}" ]]; then
  echo "error: set GH_TOKEN, GITHUB_REPOSITORY, and VERSION" >&2
  exit 2
fi
if [[ ! -d "${REPO_DIR}/apt" || ! -f "${REPO_DIR}/index.html" ]]; then
  echo "error: ${REPO_DIR} must contain apt/ and index.html" >&2
  exit 1
fi

work="$(mktemp -d)"
git -C "${work}" init
git -C "${work}" checkout --orphan gh-pages
cp -a "${REPO_DIR}/." "${work}/"
git -C "${work}" config user.name "github-actions[bot]"
git -C "${work}" config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git -C "${work}" add -A
git -C "${work}" commit -m "apt repository ${VERSION}"
git -C "${work}" -c "http.https://github.com/.extraheader=AUTHORIZATION: bearer ${GH_TOKEN}" \
  push --force "https://github.com/${GITHUB_REPOSITORY}.git" HEAD:gh-pages
