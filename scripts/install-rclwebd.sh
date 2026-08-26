#!/usr/bin/env bash
# Install a prebuilt rclwebd binary from GitHub Releases (ADR 0018).
#
#   curl -fsSL https://raw.githubusercontent.com/alexzhang1030/rclweb/main/scripts/install-rclwebd.sh | bash
#
# The binary is built inside the digest-pinned ROS builder images, so it
# expects the matching sourced ROS 2 prefix at runtime (Jazzy on Ubuntu 24.04,
# Humble on Ubuntu 22.04). Typesupport loads via dlopen from that prefix.
# systemd units therefore ExecStart a wrapper that sources setup.bash first
# (EnvironmentFile cannot source a ROS prefix).
#
# Default also writes a thin ament overlay so `ros2 run rclwebd rclwebd`
# works after `source $AMENT_PREFIX/local_setup.bash`. That overlay is not
# bloom. Ubuntu apt is ADR 0019 (`docs/deploy.md#apt`). --no-ament skips
# it. --systemd-only does not write the overlay unless you also pass
# --ament.
#
#   source /opt/ros/$ROS_DISTRO/setup.bash
#   source ~/.local/share/rclwebd/local_setup.bash
#   ros2 run rclwebd rclwebd
#
# Options (also as env vars):
#   --distro jazzy|humble   ROS distro (default: $ROS_DISTRO from the sourced env)
#   --version vX.Y.Z        release tag (default: latest release)
#   --dir PATH              install directory (default: $RCLWEBD_INSTALL_DIR or ~/.local/bin)
#   --systemd [user|system] install a systemd unit + env example (never auto-enable)
#   --systemd-only          install units/wrapper only; skip the binary download
#   --no-ament              skip the ament overlay
#   --ament                 write the overlay even with --systemd-only
#   --ament-only            overlay only; skip the binary download
#   --ament-prefix DIR      overlay prefix (default: $RCLWEBD_AMENT_PREFIX or ~/.local/share/rclwebd)
#   --wrapper-only          overlay lib/rclwebd/rclwebd is a RCLWEBD_BIN wrapper
#   --dry-run               print what would be downloaded/installed and exit
set -euo pipefail

REPO="${RCLWEBD_REPO:-alexzhang1030/rclweb}"
# Units and the ament overlay landed after v0.0.6. Fetch them from this
# ref unless overridden. Do not default this to --version: a tag that
# predates those paths would 404. Operators who pin the fetch to a later
# tag set RCLWEBD_UNIT_REF.
UNIT_REF="${RCLWEBD_UNIT_REF:-main}"
DISTRO="${ROS_DISTRO:-}"
VERSION=""
INSTALL_DIR="${RCLWEBD_INSTALL_DIR:-${HOME}/.local/bin}"
DRY_RUN=0
SYSTEMD=""
SYSTEMD_ONLY=0
NO_AMENT=0
FORCE_AMENT=0
AMENT_ONLY=0
WRAPPER_ONLY=0
AMENT_PREFIX="${RCLWEBD_AMENT_PREFIX:-${HOME}/.local/share/rclwebd}"

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
    --no-ament) NO_AMENT=1; shift ;;
    --ament) FORCE_AMENT=1; shift ;;
    --ament-only) AMENT_ONLY=1; shift ;;
    --ament-prefix) AMENT_PREFIX="$2"; shift 2 ;;
    --wrapper-only) WRAPPER_ONLY=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1 (see --help)" >&2; exit 2 ;;
  esac
done

if [[ $NO_AMENT -eq 1 && $FORCE_AMENT -eq 1 ]]; then
  echo "error: --no-ament and --ament cannot be combined" >&2
  exit 2
fi
if [[ $NO_AMENT -eq 1 && $AMENT_ONLY -eq 1 ]]; then
  echo "error: --no-ament and --ament-only cannot be combined" >&2
  exit 2
fi
if [[ -z "$AMENT_PREFIX" ]]; then
  echo "error: --ament-prefix is empty" >&2
  exit 2
fi

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
LOCAL_AMENT_DIR=""
LOCAL_AMENT_INSTALLER=""
if [[ -f "${SCRIPT_DIR}/rclwebd-ros.sh" && -f "${SCRIPT_DIR}/../packaging/systemd/rclwebd.service" ]]; then
  LOCAL_SYSTEMD_DIR="$(CDPATH= cd -- "${SCRIPT_DIR}/../packaging/systemd" && pwd)"
  LOCAL_WRAPPER="${SCRIPT_DIR}/rclwebd-ros.sh"
fi
if [[ -f "${SCRIPT_DIR}/install-rclwebd-ament.sh" && -f "${SCRIPT_DIR}/../packaging/ament/rclwebd/package.xml" ]]; then
  LOCAL_AMENT_DIR="$(CDPATH= cd -- "${SCRIPT_DIR}/../packaging/ament/rclwebd" && pwd)"
  LOCAL_AMENT_INSTALLER="${SCRIPT_DIR}/install-rclwebd-ament.sh"
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

install_ament() {
  local bin ament_script pkg launch tmpdir args
  bin="${RCLWEBD_BIN:-${INSTALL_DIR}/rclwebd}"

  echo "ament overlay"
  echo "  prefix  ${AMENT_PREFIX}"
  echo "  binary  ${bin}"
  echo "  ros2 run rclwebd rclwebd"

  if [[ $DRY_RUN -eq 1 ]]; then
    if [[ -z "$LOCAL_AMENT_INSTALLER" ]]; then
      echo "  would fetch $(raw_url packaging/ament/rclwebd/package.xml)"
      echo "  would fetch $(raw_url packaging/ament/rclwebd/launch/rclwebd.launch.py)"
      echo "  would fetch $(raw_url scripts/install-rclwebd-ament.sh)"
    fi
    echo "  would write ${AMENT_PREFIX}/lib/rclwebd/rclwebd"
    echo "  would write ${AMENT_PREFIX}/share/rclwebd/package.xml"
    echo "  would write ${AMENT_PREFIX}/share/rclwebd/launch/rclwebd.launch.py"
    echo "  would write ${AMENT_PREFIX}/share/ament_index/resource_index/packages/rclwebd"
    echo "  would write ${AMENT_PREFIX}/local_setup.bash"
    return 0
  fi

  if [[ $WRAPPER_ONLY -eq 0 && ( -z "$bin" || ! -x "$bin" ) ]]; then
    echo "error: no rclwebd binary at ${bin}" >&2
    echo "  pass --dir DIR (expects DIR/rclwebd), set RCLWEBD_BIN, or --wrapper-only" >&2
    exit 1
  fi

  tmpdir=""
  if [[ -n "$LOCAL_AMENT_INSTALLER" ]]; then
    ament_script="$LOCAL_AMENT_INSTALLER"
    pkg="${LOCAL_AMENT_DIR}/package.xml"
    launch="${LOCAL_AMENT_DIR}/launch/rclwebd.launch.py"
  else
    tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/rclwebd-ament.XXXXXX")"
    ament_script="${tmpdir}/install-rclwebd-ament.sh"
    pkg="${tmpdir}/package.xml"
    launch="${tmpdir}/rclwebd.launch.py"
    copy_or_fetch "$ament_script" "" "scripts/install-rclwebd-ament.sh"
    copy_or_fetch "$pkg" "" "packaging/ament/rclwebd/package.xml"
    copy_or_fetch "$launch" "" "packaging/ament/rclwebd/launch/rclwebd.launch.py"
    chmod 755 "$ament_script"
  fi

  args=(--prefix "$AMENT_PREFIX" --package-xml "$pkg" --launch "$launch")
  if [[ $WRAPPER_ONLY -eq 1 ]]; then
    args+=(--wrapper-only)
  else
    args+=(--bin "$bin")
  fi
  bash "$ament_script" "${args[@]}"
  if [[ -n "$tmpdir" ]]; then
    rm -rf "$tmpdir"
  fi
}

if [[ $SYSTEMD_ONLY -eq 0 && $AMENT_ONLY -eq 0 ]]; then
  install_binary
fi

if [[ -n "$SYSTEMD" ]]; then
  install_systemd
fi

if [[ $NO_AMENT -eq 0 && ( $SYSTEMD_ONLY -eq 0 || $FORCE_AMENT -eq 1 || $AMENT_ONLY -eq 1 ) ]]; then
  install_ament
fi
