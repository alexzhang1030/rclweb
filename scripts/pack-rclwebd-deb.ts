/**
 * Pack a prebuilt rclwebd binary into a .deb (ADR 0019).
 *
 * Wraps the ADR 0018 release binary plus the ament overlay and a system
 * unit. Does not bloom, and does not name the package ros-*-rclwebd.
 */
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  GATEWAY_PACKAGE,
  GATEWAY_PREFIX,
  MAINTAINER,
  type DebArch,
  type RosDistro,
  debianVersion,
  gatewayDebName,
  gatewayDepends,
  gatewayRecommends,
  parseDebArch,
  parseRosDistro,
  rosSetupPath,
  suiteForDistro,
} from "./apt-distro.ts";
import { requireCommand, requireTool } from "./apt-run.ts";
import { readWorkspaceVersion } from "./workspace-version.ts";

export type PackGatewayDebArgs = {
  root: string;
  bin: string;
  distro: RosDistro;
  arch: DebArch;
  outDir: string;
  version?: string;
  runtimeDepends?: boolean;
};

export type PackedDeb = {
  deb: string;
  control: string;
  version: string;
};

function repoRoot(): string {
  return path.resolve(import.meta.dir, "..");
}

export function writeGatewayControl(args: {
  version: string;
  distro: RosDistro;
  arch: DebArch;
  installedSizeKb: number;
  runtimeDepends: boolean;
}): string {
  const depends = args.runtimeDepends ? gatewayDepends(args.distro) : "libc6";
  return [
    `Package: ${GATEWAY_PACKAGE}`,
    `Version: ${debianVersion(args.version, suiteForDistro(args.distro))}`,
    "Section: misc",
    "Priority: optional",
    `Architecture: ${args.arch}`,
    `Maintainer: ${MAINTAINER}`,
    `Installed-Size: ${args.installedSizeKb}`,
    `Depends: ${depends}`,
    `Recommends: ${gatewayRecommends(args.distro)}`,
    `X-ROS-Distro: ${args.distro}`,
    "Homepage: https://github.com/alexzhang1030/rclweb",
    "Description: Browser gateway for ROS 2 (R2WP)",
    " rclwebd attaches browser R2WP sessions to one ROS 2 support row.",
    ` This ${args.distro} build is not ros-${args.distro}-rclwebd and is`,
    " not a bloom / ROS buildfarm package.",
    "",
  ].join("\n");
}

export function rewriteSystemUnit(unit: string, exec: string, envFile: string): string {
  return unit.replaceAll("@EXEC@", exec).replaceAll("@ENVFILE@", envFile);
}

export function writeGatewayEnv(distro: RosDistro): string {
  return [
    "# systemd EnvironmentFile for the apt-installed rclwebd.",
    "# This is not a sourced ROS prefix. ExecStart is rclwebd-ros.sh.",
    `RCLWEBD_ROS_SETUP=${rosSetupPath(distro)}`,
    `RCLWEBD_BIN=${GATEWAY_PREFIX}/lib/rclwebd/rclwebd`,
    "",
    "# Process default is 127.0.0.1:8794. Robot-facing binds usually use:",
    "# RCLWEBD_BIND=0.0.0.0:8794",
    "",
    "# Auth stays off. Do not set RCLWEBD_AUTH_MODE=oidc until a tenant is named.",
    "",
  ].join("\n");
}

export function writeUsrBinWrapper(distro: RosDistro): string {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `export RCLWEBD_ROS_SETUP="\${RCLWEBD_ROS_SETUP:-${rosSetupPath(distro)}}"`,
    `export RCLWEBD_BIN="\${RCLWEBD_BIN:-${GATEWAY_PREFIX}/lib/rclwebd/rclwebd}"`,
    'exec /usr/lib/rclwebd/rclwebd-ros.sh "$@"',
    "",
  ].join("\n");
}

function installedSizeKb(root: string): number {
  const listing = requireCommand("find", [root, "-type", "f", "-printf", "%s\\n"], {
    label: "find installed size",
  });
  let bytes = 0;
  for (const line of listing.stdout.split("\n")) {
    if (!line) continue;
    bytes += Number(line);
  }
  return Math.max(1, Math.ceil(bytes / 1024));
}

function writeCopyright(dest: string, notice: string): void {
  writeFileSync(
    dest,
    [
      "Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/",
      "Upstream-Name: rclweb",
      "Source: https://github.com/alexzhang1030/rclweb",
      "",
      "Files: *",
      "Copyright: 2026 Alex",
      "License: Apache-2.0",
      "",
      notice.trim(),
      "",
    ].join("\n"),
  );
}

export function packRclwebdDeb(args: PackGatewayDebArgs): PackedDeb {
  requireTool("dpkg-deb");
  const version = args.version ?? readWorkspaceVersion(args.root);
  const bin = path.resolve(args.bin);
  if (!statSync(bin).isFile()) {
    throw new Error(`rclwebd binary not found: ${bin}`);
  }
  const staging = path.join(args.outDir, `staging-${args.distro}-${args.arch}`);
  const prefix = path.join(staging, GATEWAY_PREFIX.slice(1));
  const destBin = path.join(prefix, "lib", "rclwebd", "rclwebd");
  mkdirSync(path.dirname(destBin), { recursive: true });
  copyFileSync(bin, destBin);
  chmodSync(destBin, 0o755);

  const ament = path.join(args.root, "scripts", "install-rclwebd-ament.sh");
  requireCommand(
    "bash",
    [ament, "--prefix", prefix, "--bin", destBin],
    { label: "install-rclwebd-ament.sh" },
  );
  if (lstatSync(destBin).isSymbolicLink() || !statSync(destBin).isFile()) {
    throw new Error("ament overlay must copy the binary into the package");
  }

  const wrapperSrc = path.join(args.root, "scripts", "rclwebd-ros.sh");
  const wrapperDest = path.join(staging, "usr", "lib", "rclwebd", "rclwebd-ros.sh");
  mkdirSync(path.dirname(wrapperDest), { recursive: true });
  copyFileSync(wrapperSrc, wrapperDest);
  chmodSync(wrapperDest, 0o755);

  const usrBin = path.join(staging, "usr", "bin", "rclwebd");
  mkdirSync(path.dirname(usrBin), { recursive: true });
  writeFileSync(usrBin, writeUsrBinWrapper(args.distro));
  chmodSync(usrBin, 0o755);

  const unitSrc = readFileSync(
    path.join(args.root, "packaging", "systemd", "rclwebd.service"),
    "utf8",
  );
  const unitDest = path.join(staging, "lib", "systemd", "system", "rclwebd.service");
  mkdirSync(path.dirname(unitDest), { recursive: true });
  writeFileSync(
    unitDest,
    rewriteSystemUnit(unitSrc, "/usr/lib/rclwebd/rclwebd-ros.sh", "/etc/rclwebd/rclwebd.env"),
  );

  const envDest = path.join(staging, "etc", "rclwebd", "rclwebd.env");
  mkdirSync(path.dirname(envDest), { recursive: true });
  writeFileSync(envDest, writeGatewayEnv(args.distro));

  const docDir = path.join(staging, "usr", "share", "doc", GATEWAY_PACKAGE);
  mkdirSync(docDir, { recursive: true });
  writeCopyright(path.join(docDir, "copyright"), readFileSync(path.join(args.root, "NOTICE"), "utf8"));

  const debian = path.join(staging, "DEBIAN");
  mkdirSync(debian, { recursive: true });
  const control = writeGatewayControl({
    version,
    distro: args.distro,
    arch: args.arch,
    installedSizeKb: installedSizeKb(staging),
    runtimeDepends: args.runtimeDepends ?? true,
  });
  writeFileSync(path.join(debian, "control"), control);
  writeFileSync(path.join(debian, "conffiles"), "/etc/rclwebd/rclwebd.env\n");
  writeFileSync(
    path.join(debian, "postinst"),
    [
      "#!/bin/sh",
      "set -e",
      'if [ -d /run/systemd/system ]; then',
      "  systemctl daemon-reload >/dev/null 2>&1 || true",
      "fi",
      'echo "rclwebd: unit installed, not enabled. systemctl enable --now rclwebd"',
      'echo "  or: source /opt/ros/$ROS_DISTRO/setup.bash && source /opt/rclwebd/local_setup.bash && ros2 run rclwebd rclwebd"',
      "",
    ].join("\n"),
  );
  chmodSync(path.join(debian, "postinst"), 0o755);

  mkdirSync(args.outDir, { recursive: true });
  const deb = path.join(args.outDir, gatewayDebName({ version, distro: args.distro, arch: args.arch }));
  requireCommand(
    "dpkg-deb",
    ["--root-owner-group", "--build", staging, deb],
    { label: "dpkg-deb --build rclwebd" },
  );
  return { deb, control, version };
}

function parseArgs(argv: string[]): PackGatewayDebArgs {
  const parsed: {
    bin?: string;
    distro?: string;
    arch?: string;
    outDir?: string;
    version?: string;
    runtimeDepends: boolean;
  } = { runtimeDepends: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--bin":
        parsed.bin = next;
        i += 1;
        break;
      case "--distro":
        parsed.distro = next;
        i += 1;
        break;
      case "--arch":
        parsed.arch = next;
        i += 1;
        break;
      case "--out-dir":
        parsed.outDir = next;
        i += 1;
        break;
      case "--version":
        parsed.version = next;
        i += 1;
        break;
      case "--no-runtime-depends":
        parsed.runtimeDepends = false;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!parsed.bin || !parsed.distro || !parsed.arch || !parsed.outDir) {
    throw new Error(
      "usage: bun run scripts/pack-rclwebd-deb.ts --bin PATH --distro jazzy|humble --arch amd64|arm64 --out-dir DIR",
    );
  }
  return {
    root: repoRoot(),
    bin: parsed.bin,
    distro: parseRosDistro(parsed.distro),
    arch: parseDebArch(parsed.arch),
    outDir: parsed.outDir,
    version: parsed.version,
    runtimeDepends: parsed.runtimeDepends,
  };
}

function main(argv: string[]): void {
  const packed = packRclwebdDeb(parseArgs(argv));
  console.log(packed.deb);
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
