/**
 * Pack the four ADR 0018 release binaries into rclwebd debs (ADR 0019).
 *
 * Used by `publish-apt.yml` so a signed repo can ship without rebuilding
 * images or binaries. Expects `rclwebd-<version>-<distro>-<arch>` in --bin-dir.
 */
import { chmodSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { GATEWAY_TARGETS, releaseBinaryName } from "./apt-distro.ts";
import { packRclwebdDeb, type PackedDeb } from "./pack-rclwebd-deb.ts";
import { readWorkspaceVersion } from "./workspace-version.ts";

export type PackReleaseDebsArgs = {
  root: string;
  binDir: string;
  outDir: string;
  version?: string;
};

function repoRoot(): string {
  return path.resolve(import.meta.dir, "..");
}

export function packReleaseDebs(args: PackReleaseDebsArgs): PackedDeb[] {
  const version = args.version ?? readWorkspaceVersion(args.root);
  const packed: PackedDeb[] = [];
  for (const target of GATEWAY_TARGETS) {
    const bin = path.join(args.binDir, releaseBinaryName(version, target.distro, target.arch));
    if (!existsSync(bin) || !statSync(bin).isFile()) {
      throw new Error(`missing release binary ${bin}`);
    }
    chmodSync(bin, 0o755);
    packed.push(
      packRclwebdDeb({
        root: args.root,
        bin,
        distro: target.distro,
        arch: target.arch,
        outDir: args.outDir,
        version,
      }),
    );
  }
  if (packed.length !== GATEWAY_TARGETS.length) {
    throw new Error(`expected ${GATEWAY_TARGETS.length} debs, packed ${packed.length}`);
  }
  return packed;
}

function parseArgs(argv: string[]): PackReleaseDebsArgs {
  const parsed: { binDir?: string; outDir?: string; version?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--bin-dir":
        parsed.binDir = next;
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
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!parsed.binDir || !parsed.outDir) {
    throw new Error(
      "usage: bun run scripts/pack-release-debs.ts --bin-dir DIR --out-dir DIR [--version X.Y.Z]",
    );
  }
  return {
    root: repoRoot(),
    binDir: parsed.binDir,
    outDir: parsed.outDir,
    version: parsed.version,
  };
}

function main(argv: string[]): void {
  const packed = packReleaseDebs(parseArgs(argv));
  for (const item of packed) {
    console.log(item.deb);
  }
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
