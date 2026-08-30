#!/usr/bin/env bash
# Enable the rclweb apt source (ADR 0019) and install rclwebd.
#
#   curl -fsSL https://raw.githubusercontent.com/alexzhang1030/rclweb/main/scripts/enable-rclweb-apt.sh | sudo bash
#   sudo apt update
#   sudo apt install rclwebd
#
# Fetches the public archive keyring from Pages and writes a Signed-By
# deb822 file. This is not the signing secret. Do not apt-key add.
# `rclweb-apt-source` remains on the repo for later key upgrades.
#
#   --source-only   write keyring + sources; skip apt update / install
#   --dry-run       print paths and exit
set -euo pipefail

SOURCE_ONLY=0
DRY_RUN=0
PAGES="${RCLWEB_PAGES:-https://alexzhang1030.github.io/rclweb}"
KEYRING_URL="${PAGES}/rclweb-archive-keyring.gpg"
APT_URI="${PAGES}/apt"
KEYRING_DEST="${RCLWEB_APT_KEYRING_DEST:-/usr/share/keyrings/rclweb-archive-keyring.gpg}"
SOURCES_DEST="${RCLWEB_APT_SOURCES_DEST:-/etc/apt/sources.list.d/rclweb.sources}"

usage() {
  grep '^#' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-only) SOURCE_ONLY=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; exit 2 ;;
  esac
done

suite="${RCLWEB_APT_SUITE:-}"
if [[ -z "$suite" && -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  suite="${VERSION_CODENAME:-}"
fi
case "$suite" in
  noble|jammy) ;;
  *)
    echo "error: Ubuntu suite '${suite}' is not jammy or noble" >&2
    exit 1
    ;;
esac

echo "rclweb apt ${APT_URI} suite ${suite}"
echo "  keyring ${KEYRING_DEST}"
echo "  sources ${SOURCES_DEST}"

if [[ $DRY_RUN -eq 1 ]]; then
  echo "  would fetch ${KEYRING_URL}"
  exit 0
fi

if [[ "${KEYRING_DEST}" == /usr/* || "${SOURCES_DEST}" == /etc/* ]]; then
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "error: run as root (curl … | sudo bash)" >&2
    exit 1
  fi
fi

tmp="$(mktemp)"
cleanup() { rm -f "$tmp"; }
trap cleanup EXIT

if [[ -n "${RCLWEB_APT_KEYRING:-}" && -f "${RCLWEB_APT_KEYRING}" ]]; then
  cp "${RCLWEB_APT_KEYRING}" "$tmp"
else
  curl --retry 8 --retry-all-errors --retry-delay 2 --connect-timeout 20 \
    --http1.1 -fsSL -o "$tmp" "${KEYRING_URL}"
fi

if grep -q "BEGIN PGP PRIVATE KEY" "$tmp"; then
  echo "error: downloaded file is a secret key; refusing to install" >&2
  exit 1
fi
if ! gpg --batch --no-default-keyring --keyring "$tmp" --list-keys >/dev/null 2>&1; then
  echo "error: downloaded file is not a public keyring" >&2
  exit 1
fi
secrets="$(gpg --batch --no-default-keyring --keyring "$tmp" --list-secret-keys 2>/dev/null || true)"
if [[ -n "$secrets" ]]; then
  echo "error: keyring contains a secret key; refusing to install" >&2
  exit 1
fi

umask 022
mkdir -p "$(dirname "$KEYRING_DEST")" "$(dirname "$SOURCES_DEST")"
cp "$tmp" "$KEYRING_DEST"
chmod 644 "$KEYRING_DEST"
cat > "$SOURCES_DEST" <<EOF
Types: deb
URIs: ${APT_URI}
Suites: ${suite}
Components: main
Architectures: amd64 arm64
Signed-By: ${KEYRING_DEST}
EOF
chmod 644 "$SOURCES_DEST"
echo "wrote ${SOURCES_DEST}"

if [[ $SOURCE_ONLY -eq 1 ]]; then
  echo "source only. apt update && apt install rclwebd"
  exit 0
fi

apt-get update
apt-get install -y rclwebd
echo "source /opt/ros/\$ROS_DISTRO/setup.bash"
echo "source /opt/rclwebd/local_setup.bash"
echo "ros2 run rclwebd rclwebd"
