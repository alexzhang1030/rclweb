#!/usr/bin/env bash
# Source a ROS 2 prefix, then exec rclwebd.
#
# systemd EnvironmentFile cannot replace this. Row auto-detect (ADR 0018)
# and typesupport dlopen need the sourced prefix (ROS_DISTRO,
# AMENT_PREFIX_PATH, LD_LIBRARY_PATH). ROS setup.bash references optional
# unset vars, so nounset is off while sourcing — same as
# docker/rclwebd-entrypoint.sh.
set -euo pipefail

setup=""
if [[ -n "${RCLWEBD_ROS_SETUP:-}" ]]; then
  setup="${RCLWEBD_ROS_SETUP}"
elif [[ -n "${ROS_DISTRO:-}" && -f "/opt/ros/${ROS_DISTRO}/setup.bash" ]]; then
  setup="/opt/ros/${ROS_DISTRO}/setup.bash"
else
  for distro in jazzy humble; do
    if [[ -f "/opt/ros/${distro}/setup.bash" ]]; then
      setup="/opt/ros/${distro}/setup.bash"
      break
    fi
  done
fi

if [[ -z "${setup}" || ! -f "${setup}" ]]; then
  echo "error: no ROS 2 setup.bash." >&2
  echo "  Set RCLWEBD_ROS_SETUP or source a ROS 2 environment." >&2
  exit 1
fi

# ROS setup scripts reference optional unset vars.
# shellcheck disable=SC1090
set +u
source "${setup}"
set -u

if [[ -z "${ROS_PREFIX:-}" ]]; then
  export ROS_PREFIX
  # setup.bash lives at the prefix root (`/opt/ros/jazzy/setup.bash`).
  ROS_PREFIX="$(cd "$(dirname "${setup}")" && pwd)"
fi

bin="${RCLWEBD_BIN:-}"
if [[ -z "${bin}" ]]; then
  self_dir="$(cd "$(dirname "$0")" && pwd)"
  if [[ -x "${self_dir}/rclwebd" ]]; then
    bin="${self_dir}/rclwebd"
  else
    bin="rclwebd"
  fi
fi

# Do not default RCLWEBD_SUPPORT_ROW. The sourced environment selects the
# row (ADR 0018). The image entrypoint bakes a row because the image is
# one support row.
exec "${bin}" "$@"
