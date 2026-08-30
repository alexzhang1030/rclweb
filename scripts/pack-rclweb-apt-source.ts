/**
 * Pack `rclweb-apt-source`: archive keyring + deb822 source (ADR 0019).
 *
 * Offline / key-upgrade package. First enable is enable-rclweb-apt.sh
 * (public keyring on Pages). After the source is on the machine,
 * `apt update` can upgrade this package.
 */
import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  APT_SOURCE_PACKAGE,
  APT_SOURCES_INSTALL_PATH,
  APT_URI_DEFAULT,
  KEYRING_INSTALL_PATH,
  MAINTAINER,
  aptSourceDebName,
  debianVersion,
} from "./apt-distro.ts";
import { requireCommand, requireTool } from "./apt-run.ts";
import { readWorkspaceVersion } from "./workspace-version.ts";

export type PackAptSourceArgs = {
  root: string;
  keyring: string;
  outDir: string;
  version?: string;
  uri?: string;
};

export type PackedAptSource = {
  deb: string;
  control: string;
  version: string;
};

function repoRoot(): string {
  return path.resolve(import.meta.dir, "..");
}

export function writeAptSourceControl(args: {
  version: string;
  installedSizeKb: number;
}): string {
  return [
    `Package: ${APT_SOURCE_PACKAGE}`,
    `Version: ${debianVersion(args.version)}`,
    "Section: admin",
    "Priority: optional",
    "Architecture: all",
    `Maintainer: ${MAINTAINER}`,
    `Installed-Size: ${args.installedSizeKb}`,
    "Homepage: https://github.com/alexzhang1030/rclweb",
    "Description: APT source and archive keyring for rclwebd",
    " Adds a Signed-By keyring and a deb822 source. Not bloom.",
    " Package name is rclwebd, never ros-jazzy-rclwebd.",
    "",
  ].join("\n");
}

export function writeAptSourcePostinst(uri: string): string {
  return [
    "#!/bin/sh",
    "set -e",
    `URI="${uri}"`,
    "SUITE=\"\"",
    "if [ -f /etc/rclweb-apt-source.conf ]; then",
    "  # shellcheck disable=SC1091",
    "  . /etc/rclweb-apt-source.conf",
    "fi",
    "if [ -z \"$SUITE\" ] && [ -f /etc/os-release ]; then",
    "  # shellcheck disable=SC1091",
    "  . /etc/os-release",
    "  case \"${VERSION_CODENAME:-}\" in",
    "    noble|jammy) SUITE=\"$VERSION_CODENAME\" ;;",
    "    *)",
    "      echo \"rclweb-apt-source: unknown Ubuntu '${VERSION_CODENAME:-}'; expected jammy or noble\" >&2",
    "      SUITE=\"${VERSION_CODENAME:-unknown}\"",
    "      ;;",
    "  esac",
    "fi",
    `umask 022`,
    `cat > ${APT_SOURCES_INSTALL_PATH} <<EOF`,
    "Types: deb",
    "URIs: $URI",
    "Suites: $SUITE",
    "Components: main",
    "Architectures: amd64 arm64",
    `Signed-By: ${KEYRING_INSTALL_PATH}`,
    "EOF",
    "",
  ].join("\n");
}

export function writeAptSourcePostrm(): string {
  return [
    "#!/bin/sh",
    "set -e",
    "if [ \"$1\" = purge ]; then",
    `  rm -f ${APT_SOURCES_INSTALL_PATH}`,
    "fi",
    "",
  ].join("\n");
}

export function packRclwebAptSource(args: PackAptSourceArgs): PackedAptSource {
  requireTool("dpkg-deb");
  const version = args.version ?? readWorkspaceVersion(args.root);
  const uri = args.uri ?? APT_URI_DEFAULT;
  const keyring = path.resolve(args.keyring);
  const staging = path.join(args.outDir, "staging-apt-source");
  const keyringDest = path.join(staging, KEYRING_INSTALL_PATH.slice(1));
  mkdirSync(path.dirname(keyringDest), { recursive: true });
  copyFileSync(keyring, keyringDest);

  const share = path.join(staging, "usr", "share", "doc", APT_SOURCE_PACKAGE);
  mkdirSync(share, { recursive: true });
  writeFileSync(
    path.join(share, "copyright"),
    [
      "Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/",
      "Files: *",
      "Copyright: 2026 Alex",
      "License: Apache-2.0",
      "",
    ].join("\n"),
  );

  const debian = path.join(staging, "DEBIAN");
  mkdirSync(debian, { recursive: true });
  const listing = requireCommand(
    "find",
    [staging, "-type", "f", "-printf", "%s\\n"],
    { label: "find apt-source size" },
  );
  let bytes = 0;
  for (const line of listing.stdout.split("\n")) {
    if (line) bytes += Number(line);
  }
  const control = writeAptSourceControl({
    version,
    installedSizeKb: Math.max(1, Math.ceil(bytes / 1024)),
  });
  writeFileSync(path.join(debian, "control"), control);
  writeFileSync(path.join(debian, "postinst"), writeAptSourcePostinst(uri));
  writeFileSync(path.join(debian, "postrm"), writeAptSourcePostrm());
  chmodSync(path.join(debian, "postinst"), 0o755);
  chmodSync(path.join(debian, "postrm"), 0o755);

  mkdirSync(args.outDir, { recursive: true });
  const deb = path.join(args.outDir, aptSourceDebName(version));
  requireCommand(
    "dpkg-deb",
    ["--root-owner-group", "--build", staging, deb],
    { label: "dpkg-deb --build rclweb-apt-source" },
  );
  return { deb, control, version };
}

function parseArgs(argv: string[]): PackAptSourceArgs {
  const parsed: { keyring?: string; outDir?: string; version?: string; uri?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--keyring":
        parsed.keyring = next;
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
      case "--uri":
        parsed.uri = next;
        i += 1;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!parsed.keyring || !parsed.outDir) {
    throw new Error(
      "usage: bun run scripts/pack-rclweb-apt-source.ts --keyring PATH --out-dir DIR [--uri URL]",
    );
  }
  return {
    root: repoRoot(),
    keyring: parsed.keyring,
    outDir: parsed.outDir,
    version: parsed.version,
    uri: parsed.uri,
  };
}

function main(argv: string[]): void {
  const packed = packRclwebAptSource(parseArgs(argv));
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
