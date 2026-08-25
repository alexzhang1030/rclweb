#!/usr/bin/env bash
# Install a prebuilt rclwebd gateway binary from GitHub Releases (ADR 0018).
#
#   curl -fsSL https://raw.githubusercontent.com/alexzhang1030/rclweb/main/scripts/install-rclwebd.sh | bash
#
# The binary is built inside the digest-pinned ROS builder images, so it
# expects the matching sourced ROS 2 prefix at runtime (Jazzy on Ubuntu 24.04,
# Humble on Ubuntu 22.04). Typesupport loads via dlopen from that prefix.
# systemd units therefore ExecStart a wrapper that sources setup.bash first
# (EnvironmentFile cannot source a ROS prefix).
#
# Options (also as env vars):
#   --distro jazzy|humble   ROS distro (default: $ROS_DISTRO from the sourced env)
#   --version vX.Y.Z        release tag (default: latest release)
#   --dir PATH              install directory (default: $RCLWEBD_INSTALL_DIR or ~/.local/bin)
#   --systemd [user|system] install a systemd unit + env example (never auto-enable)
#   --systemd-only          install units/wrapper only; skip the binary download
#   --dry-run               print what would be downloaded/installed and exit
set -euo pipefail

REPO="${RCLWEBD_REPO:-alexzhang1030/rclweb}"
# Units landed after v0.0.6. Fetch them from this ref unless overridden.
# Do not default this to --version: a tag that predates packaging/systemd
# would 404. Operators who pin units to a later tag set RCLWEBD_UNIT_REF.
UNIT_REF="${RCLWEBD_UNIT_REF:-main}"
DISTRO="${ROS_DISTRO:-}"
VERSION=""
INSTALL_DIR="${RCLWEBD_INSTALL_DIR:-${HOME}/.local/bin}"
DRY_RUN=0
SYSTEMD=""
SYSTEMD_ONLY=0

usage() {
  grep '^#' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --distro) DISTRO="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --systemd)
      if [[ $# -ge 2 && ( "$2" == "user" || "$2" == "system" ) ]]; then
        SYSTEMD="$2"
        shift 2
      else
        SYSTEMD="infer"
        shift
      fi
      ;;
    --systemd-only) SYSTEMD_ONLY=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1 (see --help)" >&2; exit 2 ;;
  esac
done

if [[ $SYSTEMD_ONLY -eq 1 && -z "$SYSTEMD" ]]; then
  SYSTEMD="infer"
fi

if [[ "$SYSTEMD" == "infer" ]]; then
  case "$INSTALL_DIR" in
    "${HOME}"/*|"$HOME") SYSTEMD="user" ;;
    *) SYSTEMD="system" ;;
  esac
fi

if [[ -n "$SYSTEMD" && "$SYSTEMD" != "user" && "$SYSTEMD" != "system" ]]; then
  echo "error: --systemd expects user or system, got '${SYSTEMD}'" >&2
  exit 2
fi

if [[ "$SYSTEMD" == "system" && "$(id -u)" -ne 0 && $DRY_RUN -eq 0 ]]; then
  echo "error: --systemd system writes /etc/systemd/system and /etc/rclwebd.env; run as root" >&2
  exit 1
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_SYSTEMD_DIR=""
LOCAL_WRAPPER=""
if [[ -f "${SCRIPT_DIR}/rclwebd-ros.sh" && -f "${SCRIPT_DIR}/../packaging/systemd/rclwebd.service" ]]; then
  LOCAL_SYSTEMD_DIR="$(CDPATH= cd -- "${SCRIPT_DIR}/../packaging/systemd" && pwd)"
  LOCAL_WRAPPER="${SCRIPT_DIR}/rclwebd-ros.sh"
fi

raw_url() {
  local path="$1"
  echo "https://raw.githubusercontent.com/${REPO}/${UNIT_REF}/${path}"
}

copy_or_fetch() {
  local dest="$1"
  local local_path="$2"
  local repo_path="$3"
  if [[ -n "$local_path" && -f "$local_path" ]]; then
    cp "$local_path" "$dest"
    return 0
  fi
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "would fetch $(raw_url "$repo_path") -> ${dest}"
    return 0
  fi
  curl -fsSL "$(raw_url "$repo_path")" -o "$dest"
}

install_binary() {
  case "${DISTRO}" in
    jazzy|humble) ;;
    "")
      echo "error: no ROS distro. Source a ROS 2 environment first" >&2
      echo "  (e.g. source /opt/ros/jazzy/setup.bash) or pass --distro jazzy|humble." >&2
      exit 1
      ;;
    *)
      echo "error: unsupported ROS distro '${DISTRO}'. Prebuilt binaries cover" >&2
      echo "  jazzy and humble. For other distros build from source:" >&2
      echo "  cargo install rclwebd --features ros" >&2
      exit 1
      ;;
  esac

  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) ARCH=amd64 ;;
    Linux-aarch64) ARCH=arm64 ;;
    *)
      echo "error: no prebuilt binary for $(uname -s) $(uname -m)." >&2
      echo "  Supported: Linux x86_64 and aarch64. Build from source:" >&2
      echo "  cargo install rclwebd --features ros" >&2
      exit 1
      ;;
  esac

  ASSET="rclwebd-${DISTRO}-linux-${ARCH}"

  if [[ -z "$VERSION" ]]; then
    VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
      | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)"
    if [[ -z "$VERSION" ]]; then
      echo "error: could not resolve the latest release tag for ${REPO}" >&2
      exit 1
    fi
  fi

  URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"
  DEST="${INSTALL_DIR}/rclwebd"

  echo "rclwebd ${VERSION} (${DISTRO}, ${ARCH})"
  echo "  from ${URL}"
  echo "  to   ${DEST}"
  echo "  runtime: source /opt/ros/${DISTRO}/setup.bash before launching"

  if [[ $DRY_RUN -eq 1 ]]; then
    return 0
  fi

  mkdir -p "$INSTALL_DIR"
  tmp="$(mktemp "${TMPDIR:-/tmp}/rclwebd.XXXXXX")"
  trap 'rm -f "$tmp"' EXIT
  curl -fL --retry 3 --retry-delay 1 -o "$tmp" "$URL"
  chmod 755 "$tmp"
  mv "$tmp" "$DEST"
  trap - EXIT
  echo "installed ${DEST}"
  echo "add ${INSTALL_DIR} to PATH if it is not already."
}

install_systemd() {
  local unit_name wrapper_dest env_dest unit_dest unit_src_local unit_repo env_src
  wrapper_dest="${INSTALL_DIR}/rclwebd-ros.sh"
  if [[ "$SYSTEMD" == "user" ]]; then
    unit_name="rclwebd.user.service"
    unit_dest="${HOME}/.config/systemd/user/rclwebd.service"
    env_dest="${HOME}/.config/rclwebd/rclwebd.env"
  else
    unit_name="rclwebd.service"
    unit_dest="/etc/systemd/system/rclwebd.service"
    env_dest="/etc/rclwebd.env"
  fi
  if [[ -n "$LOCAL_SYSTEMD_DIR" ]]; then
    unit_src_local="${LOCAL_SYSTEMD_DIR}/${unit_name}"
    env_src="${LOCAL_SYSTEMD_DIR}/rclwebd.env.example"
  else
    unit_src_local=""
    env_src=""
  fi
  unit_repo="packaging/systemd/${unit_name}"

  echo "systemd (${SYSTEMD})"
  echo "  unit    ${unit_dest}"
  echo "  env     ${env_dest}"
  echo "  wrapper ${wrapper_dest}"
  echo "  ExecStart sources ROS then execs rclwebd (not the binary directly)"

  if [[ $DRY_RUN -eq 1 ]]; then
    if [[ -z "$LOCAL_SYSTEMD_DIR" ]]; then
      echo "  fetch units from $(raw_url packaging/systemd/)"
    fi
    return 0
  fi

  mkdir -p "$INSTALL_DIR" "$(dirname "$unit_dest")" "$(dirname "$env_dest")"

  copy_or_fetch "$wrapper_dest" "$LOCAL_WRAPPER" "scripts/rclwebd-ros.sh"
  chmod 755 "$wrapper_dest"

  local unit_tmp exec_esc env_esc
  unit_tmp="$(mktemp "${TMPDIR:-/tmp}/rclwebd.unit.XXXXXX")"
  copy_or_fetch "$unit_tmp" "$unit_src_local" "$unit_repo"
  # Escape & and | so the rewrite stays literal under sed `|` delimiters.
  exec_esc="$(printf '%s' "$wrapper_dest" | sed 's/[&|]/\\&/g')"
  env_esc="$(printf '%s' "$env_dest" | sed 's/[&|]/\\&/g')"
  sed -e "s|@EXEC@|${exec_esc}|g" -e "s|@ENVFILE@|${env_esc}|g" "$unit_tmp" > "${unit_tmp}.rewritten"
  if grep -q '@EXEC@\|@ENVFILE@' "${unit_tmp}.rewritten"; then
    echo "error: unit still has @EXEC@ / @ENVFILE@ after rewrite" >&2
    rm -f "$unit_tmp" "${unit_tmp}.rewritten"
    exit 1
  fi
  mv "${unit_tmp}.rewritten" "$unit_dest"
  rm -f "$unit_tmp"
  chmod 644 "$unit_dest"

  if [[ ! -e "$env_dest" ]]; then
    copy_or_fetch "$env_dest" "$env_src" "packaging/systemd/rclwebd.env.example"
    chmod 644 "$env_dest"
    echo "wrote ${env_dest} (edit bind / ACL / WT before enable)"
  else
    echo "kept existing ${env_dest} (not overwritten)"
  fi

  echo "installed ${unit_dest}"
  echo "not enabled. After editing ${env_dest}:"
  if [[ "$SYSTEMD" == "user" ]]; then
    echo "  systemctl --user daemon-reload"
    echo "  systemctl --user enable --now rclwebd"
  else
    echo "  systemctl daemon-reload"
    echo "  systemctl enable --now rclwebd"
  fi
}

if [[ $SYSTEMD_ONLY -eq 0 ]]; then
  install_binary
fi

if [[ -n "$SYSTEMD" ]]; then
  install_systemd
fi
