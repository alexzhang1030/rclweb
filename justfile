# rclweb root command surface (just 1.50.0).
# Fail-fast recipes run from the repository root.

set shell := ["bash", "-euo", "pipefail", "-c"]
set dotenv-load := false

root := justfile_directory()

_default:
    @just --list

# Prepare a fresh checkout after `just` itself is installed.
[group('meta')]
setup:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    bun install --frozen-lockfile
    rustup component add rustfmt clippy
    just doctor

# Verify pinned bun, rustc, and just versions.
[group('meta')]
toolchain-check:
    cd "{{root}}" && bun run scripts/toolchain-check.ts

# Print toolchain identity (pins plus rustfmt/clippy).
[group('meta')]
doctor: toolchain-check
    #!/usr/bin/env bash
    set -euo pipefail
    rustc --version --verbose
    cargo --version
    cargo fmt --version
    cargo clippy --version
    just --version
    bun --version

# Format all Rust sources.
[group('quality')]
fmt:
    cd "{{root}}" && cargo fmt --all

# Verify Rust formatting without changing files.
[group('quality')]
fmt-check:
    cd "{{root}}" && cargo fmt --all --check

# Clippy with the workspace lint policy and no warnings.
[group('quality')]
clippy:
    cd "{{root}}" && cargo clippy --locked --workspace --all-targets -- -D warnings

# Clippy the WebTransport accept loop (off in the default workspace clippy).
[group('quality')]
clippy-webtransport:
    cd "{{root}}" && cargo clippy --locked -p rclwebd --features webtransport --all-targets -- -D warnings

# Rust-only fmt + clippy. The full gate remains `just check`.
[group('quality')]
lint-rust: fmt-check clippy

# Apply rustfmt and Clippy's safe fixes to the working tree.
[group('quality')]
fix-rust:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    cargo fmt --all
    cargo clippy --fix --locked --workspace --all-targets --allow-dirty --allow-staged

# Validate R2WP v0 registry JSON and control CDDL.
[group('quality')]
protocol-check: toolchain-check
    cd "{{root}}" && bun run protocol-check

# Verify protocol fixtures materialize from manifest sources.
[group('quality')]
protocol-fixtures-check: toolchain-check
    cd "{{root}}" && cargo run --locked -p protocol-fixtures -- --check

# Regenerate materializable protocol fixtures (malformed + valid bootstraps).
[group('quality')]
protocol-fixtures-write: toolchain-check
    cd "{{root}}" && cargo run --locked -p protocol-fixtures -- --write

# ROS CDR corpus check from committed artifacts.
[group('quality')]
cdr-corpus-check: toolchain-check
    cd "{{root}}" && bun run cdr-corpus:check

# ROS CDR corpus regenerate against pinned ROS environments.
[group('quality')]
cdr-corpus-write: toolchain-check
    cd "{{root}}" && bun run cdr-corpus:write

# Pinned ROS environment reproduce gate.
[group('quality')]
cdr-corpus-reproduce: toolchain-check
    cd "{{root}}" && bun run cdr-corpus:reproduce

# CDR top-level tail-slack evidence check.
[group('quality')]
cdr-tail-slack-check: toolchain-check
    cd "{{root}}" && bun run cdr-tail-slack:check

# Regenerate CDR top-level tail-slack evidence.
[group('quality')]
cdr-tail-slack-write: toolchain-check
    cd "{{root}}" && bun run cdr-tail-slack:write

# Generated-types metadata check.
[group('quality')]
generated-types-check: toolchain-check
    cd "{{root}}" && bun run generated-types:check

# Regenerate generated-types metadata under rclweb/generated/metadata/.
[group('quality')]
generated-types-write: toolchain-check
    cd "{{root}}" && bun run generated-types:write

# ROS 2 .msg/.srv/.action → rcl-web TypeScript DTS / runtime classes.
[group('quality')]
rosidl-dts-check: toolchain-check
    cd "{{root}}" && bun run rosidl-dts:check

# Regenerate typescript/src/interfaces.generated.ts and typescript/generated/rosidl.d.ts.
[group('quality')]
rosidl-dts-write: toolchain-check
    cd "{{root}}" && bun run rosidl-dts:write

# Regenerate docs/third-party.md from lockfiles.
[group('quality')]
license-inventory: toolchain-check
    cd "{{root}}" && bun run scripts/license-inventory.ts --write

# Verify the committed third-party inventory and license allowlist.
[group('quality')]
license-inventory-check: toolchain-check
    cd "{{root}}" && bun run scripts/license-inventory.ts --check

# Stage repository LICENSE/NOTICE into typescript/ and write the npm tarball.
[group('quality')]
npm-pack: toolchain-check
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    bun run --filter rcl-web build
    bun run scripts/npm-pack.ts --stage
    bun pm pack --cwd typescript

# Verify the npm tarball is rcl-web@0.0.6 with the tsdown dist, LICENSE, NOTICE, and wasm.
[group('quality')]
npm-pack-check: toolchain-check
    cd "{{root}}" && bun run scripts/npm-pack.ts --check

# Stage LICENSE/NOTICE into rclweb/ and rclwebd/ for cargo publish.
[group('quality')]
cargo-publish: toolchain-check
    cd "{{root}}" && bun run scripts/cargo-publish.ts --stage

# Verify published crates pack with LICENSE/NOTICE; fixture crates stay private.
[group('quality')]
cargo-publish-check: toolchain-check
    cd "{{root}}" && bun run scripts/cargo-publish.ts --check

# Fumadocs + TanStack Start site over the existing docs/ tree (ADR 0020).
[group('docs')]
website:
    cd "{{root}}" && bun run --filter @rclweb/website dev

# Typecheck and production build of the docs site.
# Build first so Vite can refresh `src/routeTree.gen.ts` for tsc.
[group('docs')]
website-check: toolchain-check
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    bun run --filter @rclweb/website build
    bun run --filter @rclweb/website types:check

# Docs, protocol, corpus, generated-types, rosidl-dts, license inventory,
# npm/crate pack members, Rust fmt/clippy, tsdown ship bundle, docs site.
[group('quality')]
check: toolchain-check
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    bun run check
    cargo run --locked -p protocol-fixtures -- --check
    bun run scripts/license-inventory.ts --check
    bun run scripts/npm-pack.ts --check
    bun run scripts/cargo-publish.ts --check
    just fmt-check
    just clippy
    just clippy-webtransport
    bun run --filter rcl-web check
    just website-check

# Bun tests (root scripts and TypeScript package) and Cargo workspace tests.
[group('quality')]
test: toolchain-check
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    bun test
    cargo test --locked --workspace

# Gateway tests against real rcl (requires a sourced ROS 2 env matching the row).
# Default committed bindings target J-FT (`/opt/ros/jazzy`).
# Local alternative without apt ROS or Docker: `just ros-test-pixi` (RoboStack).
[group('quality')]
ros-test: toolchain-check
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    if [ -z "${AMENT_PREFIX_PATH:-}" ]; then
        echo "error: source a ROS 2 environment first (e.g. /opt/ros/jazzy/setup.bash, or just ros-test-pixi)" >&2
        exit 1
    fi
    cargo test --locked -p rclwebd --features ros
    cargo clippy --locked -p rclwebd --features ros --all-targets -- -D warnings

# Compile rclwebd --features ros --tests (sourced Jazzy). Does not run tests.
# CI equivalent: `just ros-check-docker`.
[group('quality')]
ros-check: toolchain-check
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    if [ -z "${AMENT_PREFIX_PATH:-}" ]; then
        echo "error: source a ROS 2 environment first (e.g. /opt/ros/jazzy/setup.bash) or use just ros-check-docker" >&2
        exit 1
    fi
    cargo check --locked -p rclwebd --features ros --tests
    cargo clippy --locked -p rclwebd --features ros --all-targets -- -D warnings

# Same as ros-test, using the optional RoboStack Jazzy prefix (pixi).
# Not a toolchain pin and not a substitute for digest-pinned Docker e2e evidence.
[group('quality')]
ros-test-pixi: toolchain-check
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    export PATH="${HOME}/.pixi/bin:${PATH}"
    if ! command -v pixi >/dev/null 2>&1; then
        echo "error: pixi is required for just ros-test-pixi (https://pixi.sh)" >&2
        exit 1
    fi
    pixi install --locked
    pixi run just ros-test

# Compile-only ros-feature gate in the digest-pinned Jazzy image. Does not run cargo test.
[group('quality')]
ros-check-docker: toolchain-check
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    if ! command -v docker >/dev/null 2>&1; then
        echo "error: docker is required for just ros-check-docker" >&2
        exit 1
    fi
    docker compose -f docker/compose.ros-feature-check.yml build

# Cargo native build, rclweb wasm32 (fat LTO) staged into typescript/, and package build.
[group('quality')]
build: toolchain-check
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    cargo build --locked --workspace
    bun run scripts/build-wasm.ts
    bun run --filter rcl-web build

# Live ROS talker → rclwebd → SDK subscribe via docker compose (J-FT).
[group('quality')]
e2e: toolchain-check
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    if ! command -v docker >/dev/null 2>&1; then
        echo "error: docker is required for just e2e" >&2
        exit 1
    fi
    docker compose -f docker/compose.r1-e2e.yml build
    docker compose -f docker/compose.r1-e2e.yml run --rm e2e

# Pack a prebuilt binary into rclwebd_*.deb (ADR 0019). Needs dpkg-deb.
[group('quality')]
pack-rclwebd-deb distro="jazzy" arch="amd64":
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    bin="${RCLWEBD_BIN:-}"
    if [[ -z "$bin" ]]; then
        if [[ -x "{{root}}/target/release/rclwebd" ]]; then
            bin="{{root}}/target/release/rclwebd"
        else
            echo "error: set RCLWEBD_BIN or build target/release/rclwebd" >&2
            exit 1
        fi
    fi
    bun run scripts/pack-rclwebd-deb.ts --bin "$bin" --distro "{{distro}}" --arch "{{arch}}" --out-dir "${RCLWEBD_DEB_OUT:-{{root}}/dist/deb}"

# Generate a local apt archive keypair. Writes the secret under DIR. Do not commit it.
[group('quality')]
apt-key-generate dir="/tmp/rclweb-apt-key":
    cd "{{root}}" && bun run scripts/apt-archive-key.ts --generate --out-dir "{{dir}}" --write-secret

# Pack the four GitHub Release binaries into rclwebd_*~$suite_*.deb (ADR 0019).
[group('quality')]
pack-release-debs version="0.0.6" bin_dir="":
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    bin_dir="{{bin_dir}}"
    if [[ -z "$bin_dir" ]]; then
        echo "error: pass bin_dir=/path/to/rclwebd-<version>-<distro>-<arch> files" >&2
        exit 1
    fi
    bun run scripts/pack-release-debs.ts --bin-dir "$bin_dir" --out-dir "${RCLWEBD_DEB_OUT:-{{root}}/dist/deb}" --version "{{version}}"

# Pack + sign a local apt repo. Needs RCLWEB_APT_GPG_PRIVATE_KEY or --secret-file.
[group('quality')]
apt-repo:
    cd "{{root}}" && bun run scripts/publish-apt-repo.ts --debs-dir "${RCLWEBD_DEB_OUT:-{{root}}/dist/deb}" --out-dir "${RCLWEBD_APT_OUT:-{{root}}/dist/apt-repo}"

# J-FT runtime image for rclwebd. Requires Docker; not a CI foundation job.
[group('quality')]
image-rclwebd: toolchain-check
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    if ! command -v docker >/dev/null 2>&1; then
        echo "error: docker is required for just image-rclwebd" >&2
        exit 1
    fi
    docker build -f docker/Dockerfile.rclwebd -t rclwebd:j-ft .

# Run the packaged J-FT gateway (host network). Requires Docker.
[group('quality')]
gateway: toolchain-check
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    if ! command -v docker >/dev/null 2>&1; then
        echo "error: docker is required for just gateway" >&2
        exit 1
    fi
    docker compose -f docker/compose.r4-02-gateway.yml up --build

# H-FT runtime image for rclwebd. Regenerates FFI against Humble.
[group('quality')]
image-rclwebd-h-ft: toolchain-check
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root}}"
    if ! command -v docker >/dev/null 2>&1; then
        echo "error: docker is required for just image-rclwebd-h-ft" >&2
        exit 1
    fi
    docker build -f docker/Dockerfile.rclwebd-h-ft -t rclwebd:h-ft .
