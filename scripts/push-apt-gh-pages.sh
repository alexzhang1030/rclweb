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
# Only the public index. Never copy GNUPGHOME / secret.asc from --repo-dir.
mkdir -p "${work}/apt"
cp -a "${REPO_DIR}/apt/." "${work}/apt/"
cp "${REPO_DIR}/index.html" "${work}/index.html"
if [[ -f "${REPO_DIR}/.nojekyll" ]]; then
  cp "${REPO_DIR}/.nojekyll" "${work}/.nojekyll"
fi
git -C "${work}" config user.name "github-actions[bot]"
git -C "${work}" config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git -C "${work}" add -A
git -C "${work}" commit -m "apt repository ${VERSION}"
# checkout's persist-credentials:false unsets the URL-scoped extraheader.
# git HTTPS wants basic x-access-token, not a bearer header.
auth="$(printf 'x-access-token:%s' "${GH_TOKEN}" | base64 -w0)"
git -C "${work}" -c "http.extraheader=AUTHORIZATION: basic ${auth}" \
  push --force "https://github.com/${GITHUB_REPOSITORY}.git" HEAD:gh-pages
