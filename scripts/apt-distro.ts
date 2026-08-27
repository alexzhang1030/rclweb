/**
 * Distro ↔ Ubuntu suite mapping for the own apt repo (ADR 0019).
 * Not bloom: package name stays `rclwebd`, never `ros-jazzy-rclwebd`.
 */

export type RosDistro = "jazzy" | "humble";
export type UbuntuSuite = "noble" | "jammy";
export type DebArch = "amd64" | "arm64";

export const ROS_DISTROS = ["jazzy", "humble"] as const;
export const UBUNTU_SUITES = ["noble", "jammy"] as const;
export const DEB_ARCHES = ["amd64", "arm64"] as const;

export const GATEWAY_PACKAGE = "rclwebd";
export const APT_SOURCE_PACKAGE = "rclweb-apt-source";
export const GATEWAY_PREFIX = "/opt/rclwebd";
export const KEYRING_INSTALL_PATH = "/usr/share/keyrings/rclweb-archive-keyring.gpg";
export const APT_SOURCES_INSTALL_PATH = "/etc/apt/sources.list.d/rclweb.sources";
export const APT_URI_DEFAULT = "https://alexzhang1030.github.io/rclweb/apt";
export const DEBIAN_REVISION = "1";
export const MAINTAINER = "rclweb maintainers <maintainers@localhost>";

export function isRosDistro(value: string): value is RosDistro {
  return (ROS_DISTROS as readonly string[]).includes(value);
}

export function isUbuntuSuite(value: string): value is UbuntuSuite {
  return (UBUNTU_SUITES as readonly string[]).includes(value);
}

export function isDebArch(value: string): value is DebArch {
  return (DEB_ARCHES as readonly string[]).includes(value);
}

export function parseRosDistro(value: string): RosDistro {
  if (isRosDistro(value)) return value;
  throw new Error(`unknown ROS distro: ${value} (expected jazzy or humble)`);
}

export function parseUbuntuSuite(value: string): UbuntuSuite {
  if (isUbuntuSuite(value)) return value;
  throw new Error(`unknown Ubuntu suite: ${value} (expected jammy or noble)`);
}

export function parseDebArch(value: string): DebArch {
  if (isDebArch(value)) return value;
  throw new Error(`unknown deb arch: ${value} (expected amd64 or arm64)`);
}

export function suiteForDistro(distro: RosDistro): UbuntuSuite {
  switch (distro) {
    case "jazzy":
      return "noble";
    case "humble":
      return "jammy";
    default: {
      const _exhaustive: never = distro;
      return _exhaustive;
    }
  }
}

export function distroForSuite(suite: UbuntuSuite): RosDistro {
  switch (suite) {
    case "noble":
      return "jazzy";
    case "jammy":
      return "humble";
    default: {
      const _exhaustive: never = suite;
      return _exhaustive;
    }
  }
}

export function rosSetupPath(distro: RosDistro): string {
  return `/opt/ros/${distro}/setup.bash`;
}

export function debianVersion(upstream: string, suite?: UbuntuSuite): string {
  if (suite === undefined) {
    return `${upstream}-${DEBIAN_REVISION}`;
  }
  // Suite in the revision keeps jazzy/humble assets from sharing a filename
  // on the GitHub Release and in a merged artifact directory.
  return `${upstream}-${DEBIAN_REVISION}~${suite}`;
}

export function gatewayDebName(args: {
  version: string;
  distro: RosDistro;
  arch: DebArch;
}): string {
  return `${GATEWAY_PACKAGE}_${debianVersion(args.version, suiteForDistro(args.distro))}_${args.arch}.deb`;
}

export function aptSourceDebName(version: string): string {
  return `${APT_SOURCE_PACKAGE}_${debianVersion(version)}_all.deb`;
}

/** Runtime Depends for a host binary that dlopens typesupport from the sourced prefix. */
export function gatewayDepends(distro: RosDistro): string {
  const prefix = `ros-${distro}`;
  return [
    "libc6",
    "libgcc-s1",
    "libssl3",
    `${prefix}-rcl`,
    `${prefix}-rcl-action`,
    `${prefix}-rmw`,
    `${prefix}-rcutils`,
    `${prefix}-rosidl-runtime-c`,
  ].join(", ");
}

export function gatewayRecommends(distro: RosDistro): string {
  return `ros-${distro}-rmw-fastrtps-cpp`;
}

export function writeDeb822Sources(args: {
  uri: string;
  suite: UbuntuSuite;
}): string {
  return [
    "Types: deb",
    `URIs: ${args.uri}`,
    `Suites: ${args.suite}`,
    "Components: main",
    "Architectures: amd64 arm64",
    `Signed-By: ${KEYRING_INSTALL_PATH}`,
    "",
  ].join("\n");
}
