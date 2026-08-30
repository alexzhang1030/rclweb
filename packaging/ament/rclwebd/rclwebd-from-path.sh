#!/usr/bin/env bash
# Fallback when the ament package was built without a real rclwebd binary.
# Do not search PATH for `rclwebd`: ros2 run puts this script first and
# that would recurse.
set -euo pipefail

if [[ -z "${RCLWEBD_BIN:-}" ]]; then
  echo "error: this ament package has no rclwebd binary." >&2
  echo "  Set RCLWEBD_BIN to the prebuilt or cargo binary, or rebuild" >&2
  echo "  with RCLWEBD_BIN / target/release/rclwebd / rclwebd on PATH." >&2
  exit 1
fi
if [[ ! -x "${RCLWEBD_BIN}" ]]; then
  echo "error: RCLWEBD_BIN=${RCLWEBD_BIN} is not executable" >&2
  exit 1
fi
exec "${RCLWEBD_BIN}" "$@"
