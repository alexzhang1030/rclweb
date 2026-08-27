# 0019: Own apt repository for rclwebd (not bloom)

## Status

Accepted

## Date

2026-08-26

## Context

Host install of `rclwebd` is a prebuilt binary plus an ament overlay
(`ros2 run`) and optional systemd units
([ADR 0018](./0018-prebuilt-gateway-distribution.md)). Ubuntu operators
asked for `apt install`. Bloom / `packages.ros.org`
(`apt install ros-jazzy-rclwebd`) is still blocked: the Cargo workspace
is not a farm-buildable ament package, bloom has no working `cargo`
template, and the ROS buildfarm is offline at compile time.

A third-party apt repo with a dedicated keyring is the same user
command without farm acceptance.

## Decision

- Publish `.deb` files of the existing ADR 0018 binaries
  (`rclwebd-{version}-{jazzy,humble}-{amd64,arm64}`).
- Package name is `rclwebd`. Never `ros-jazzy-rclwebd` /
  `ros-humble-rclwebd`.
- Debian version is `$upstream-1~$suite` (`0.0.6-1~noble` /
  `0.0.6-1~jammy`) so the four assets do not share a filename.
- Suites: `noble` = Jazzy, `jammy` = Humble. One glibc floor per suite.
- Control includes `X-ROS-Distro:` so the repo publisher does not
  guess the suite from Depends text.
- `rclweb-apt-source` (`Architecture: all`) installs
  `/usr/share/keyrings/rclweb-archive-keyring.gpg` and writes a deb822
  source with `Signed-By`. Do not use `apt-key` or
  `/etc/apt/trusted.gpg.d`.
- First install of the source package is `dpkg -i` from the GitHub
  Release. After that, `apt update` can upgrade it.
- Repo URL: `https://alexzhang1030.github.io/rclweb/apt` (GitHub Pages
  from `gh-pages`). Release assets also carry the `.deb` files and a
  signed repo tarball.
- Signing uses a long-lived archive key in
  `RCLWEB_APT_GPG_PRIVATE_KEY` (optional
  `RCLWEB_APT_GPG_PASSPHRASE`). This is an exception to
  [ADR 0016](./0016-oidc-trusted-publish.md): apt cannot use OIDC.
  npm and crates stay on OIDC. The secret is not committed.
- Bloom / rosdistro / `packages.ros.org` stay deferred
  ([ADR 0018](./0018-prebuilt-gateway-distribution.md) revisit).
- The thin ament overlay remains for `curl | bash` and clone installs.
  It is not this repo.

## Rationale

- The binaries already exist. Wrapping them avoids cargo-in-colcon.
- A suite split matches Ubuntu + ROS pairing already used for glibc
  and regenerated Humble bindings.
- `Signed-By` scopes the key to this source. A global trusted keyring
  would let this key sign any other repo's packages.
- GitHub Pages is enough for a public index. A later self-hosted
  origin can change the URI without renaming the package.

## Consequences

- `release.yml` packs four `rclwebd` debs (unique
  `$upstream-1~$suite` filenames), packs `rclweb-apt-source` when the
  signing secret is present, signs `InRelease`, uploads assets, and
  force-pushes `gh-pages`.
- `publish-apt.yml` wraps binaries already on the GitHub Release
  (`apt-v<version>` or workflow_dispatch). Use that to retry apt
  without rebuilding images.
- Operators enable GitHub Pages once (branch `gh-pages`, site root).
  Until the secret exists, the Release still gets unsigned `.deb`
  files for `dpkg -i`.
- `Depends` pull `ros-{jazzy,humble}-rcl` and the core rmw libs.
  Fast DDS is `Recommends`. Typesupport stays dlopen.
- systemd is installed and not enabled.

## Revisit triggers

- The ROS buildfarm accepts Cargo packages — bloom can be reconsidered.
- The Pages origin moves, or the archive key rotates.
- A new support row or Ubuntu codename.

## Source

Owner 2026-08-26: reject bloom for now; ship a custom keyring and apt
source. No further conditions.
