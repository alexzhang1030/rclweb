#!/usr/bin/env bash
# Write an ament prefix so `ros2 run rclwebd rclwebd` and
# `ros2 launch rclwebd rclwebd.launch.py` work.
#
#   scripts/install-rclwebd-ament.sh --prefix DIR --bin PATH
#
# This is not apt / bloom (ADR 0018). The Cargo workspace stays outside
# colcon. The prefix is an overlay: source ROS, then local_setup.bash.
#
#   --prefix DIR       overlay prefix (required)
#   --bin PATH         executable rclwebd to symlink or copy
#   --package-xml PATH package.xml (default: tree next to this script)
#   --launch PATH      launch file (default: tree next to this script)
#   --wrapper-only     install a RCLWEBD_BIN wrapper instead of a binary
#   --dry-run          print paths and exit
set -euo pipefail

PREFIX=""
BIN=""
PACKAGE_XML=""
LAUNCH=""
DRY_RUN=0
WRAPPER_ONLY=0

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR=""
if [[ -f "${SCRIPT_DIR}/../packaging/ament/rclwebd/package.xml" ]]; then
  PKG_DIR="$(CDPATH= cd -- "${SCRIPT_DIR}/../packaging/ament/rclwebd" && pwd)"
fi

usage() {
  grep '^#' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix) PREFIX="$2"; shift 2 ;;
    --bin) BIN="$2"; shift 2 ;;
    --package-xml) PACKAGE_XML="$2"; shift 2 ;;
    --launch) LAUNCH="$2"; shift 2 ;;
    --wrapper-only) WRAPPER_ONLY=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1 (see --help)" >&2; exit 2 ;;
  esac
done

if [[ -z "$PREFIX" ]]; then
  echo "error: --prefix is required" >&2
  exit 2
fi

if [[ -z "$PACKAGE_XML" && -n "$PKG_DIR" ]]; then
  PACKAGE_XML="${PKG_DIR}/package.xml"
fi
if [[ -z "$LAUNCH" && -n "$PKG_DIR" ]]; then
  LAUNCH="${PKG_DIR}/launch/rclwebd.launch.py"
fi

DEST_BIN="${PREFIX}/lib/rclwebd/rclwebd"
DEST_XML="${PREFIX}/share/rclwebd/package.xml"
DEST_LAUNCH="${PREFIX}/share/rclwebd/launch/rclwebd.launch.py"
DEST_INDEX="${PREFIX}/share/ament_index/resource_index/packages/rclwebd"
DEST_SETUP="${PREFIX}/local_setup.bash"

echo "ament prefix ${PREFIX}"
echo "  ros2 run rclwebd rclwebd"
echo "  ros2 launch rclwebd rclwebd.launch.py"

if [[ $DRY_RUN -eq 1 ]]; then
  echo "  would write ${DEST_BIN}"
  echo "  would write ${DEST_XML}"
  echo "  would write ${DEST_LAUNCH}"
  echo "  would write ${DEST_INDEX}"
  echo "  would write ${DEST_SETUP}"
  exit 0
fi

if [[ -z "$PACKAGE_XML" || ! -f "$PACKAGE_XML" ]]; then
  echo "error: package.xml not found (pass --package-xml)" >&2
  exit 1
fi
if [[ -z "$LAUNCH" || ! -f "$LAUNCH" ]]; then
  echo "error: launch file not found (pass --launch)" >&2
  exit 1
fi

if [[ $WRAPPER_ONLY -eq 0 ]]; then
  if [[ -z "$BIN" || ! -x "$BIN" ]]; then
    echo "error: --bin must be an executable rclwebd (or pass --wrapper-only)" >&2
    exit 1
  fi
fi

mkdir -p "$(dirname "$DEST_BIN")" \
  "$(dirname "$DEST_XML")" \
  "$(dirname "$DEST_LAUNCH")" \
  "$(dirname "$DEST_INDEX")"

if [[ $WRAPPER_ONLY -eq 1 ]]; then
  if [[ -n "$PKG_DIR" && -f "${PKG_DIR}/rclwebd-from-path.sh" ]]; then
    cp "${PKG_DIR}/rclwebd-from-path.sh" "$DEST_BIN"
  else
    cat > "$DEST_BIN" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${RCLWEBD_BIN:-}" || ! -x "${RCLWEBD_BIN}" ]]; then
  echo "error: set RCLWEBD_BIN to an executable rclwebd" >&2
  exit 1
fi
exec "${RCLWEBD_BIN}" "$@"
EOF
  fi
else
  SRC="$(CDPATH= cd -- "$(dirname -- "$BIN")" && pwd)/$(basename -- "$BIN")"
  DEST_DIR="$(CDPATH= cd -- "$(dirname -- "$DEST_BIN")" && pwd)"
  DEST="${DEST_DIR}/$(basename -- "$DEST_BIN")"
  if [[ "$SRC" != "$DEST" ]]; then
    rm -f "$DEST"
    if ! ln -s "$SRC" "$DEST" 2>/dev/null; then
      cp "$SRC" "$DEST"
    fi
  fi
fi
chmod 755 "$DEST_BIN"

cp "$PACKAGE_XML" "$DEST_XML"
cp "$LAUNCH" "$DEST_LAUNCH"
: > "$DEST_INDEX"

cat > "$DEST_SETUP" <<EOF
# ament overlay for rclwebd. Source ROS first, then this file.
_AMENT_PREFIX="\$(CDPATH= cd -- "\$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
export AMENT_PREFIX_PATH="\${_AMENT_PREFIX}\${AMENT_PREFIX_PATH:+:\${AMENT_PREFIX_PATH}}"
export COLCON_PREFIX_PATH="\${_AMENT_PREFIX}\${COLCON_PREFIX_PATH:+:\${COLCON_PREFIX_PATH}}"
unset _AMENT_PREFIX
EOF
chmod 644 "$DEST_SETUP"

echo "wrote ${DEST_BIN}"
echo "source ROS, then:"
echo "  source ${DEST_SETUP}"
echo "  ros2 run rclwebd rclwebd"
