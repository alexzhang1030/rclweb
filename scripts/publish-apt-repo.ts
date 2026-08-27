/**
 * Assemble and sign the rclweb apt repo (ADR 0019).
 *
 * Suites: noble (Jazzy) and jammy (Humble). Package name stays rclwebd.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createGnupgHome, importSecretKey } from "./apt-archive-key.ts";
import {
  APT_SOURCE_PACKAGE,
  GATEWAY_PACKAGE,
  type RosDistro,
  type UbuntuSuite,
  parseRosDistro,
  suiteForDistro,
} from "./apt-distro.ts";
import { requireCommand, requireTool, runCommandBinary } from "./apt-run.ts";

export type PublishAptRepoArgs = {
  debs: string[];
  outDir: string;
  secretArmor: string;
  passphrase?: string;
};

export type PublishedAptRepo = {
  aptRoot: string;
  suites: UbuntuSuite[];
  inRelease: string[];
};

function fileDigest(filePath: string): { size: number; md5: string; sha256: string } {
  const buf = readFileSync(filePath);
  return {
    size: buf.length,
    md5: createHash("md5").update(buf).digest("hex"),
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
}

function controlField(control: string, name: string): string {
  const match = control.match(new RegExp(`^${name}:\\s*(.+)$`, "m"));
  if (!match) throw new Error(`deb control missing ${name}`);
  return match[1].trim();
}

export type DebIdentity =
  | {
      name: typeof GATEWAY_PACKAGE;
      version: string;
      arch: string;
      distro: RosDistro;
      suite: UbuntuSuite;
    }
  | {
      name: typeof APT_SOURCE_PACKAGE;
      version: string;
      arch: string;
      suite: "all";
    };

export function readDebIdentity(deb: string): DebIdentity {
  const shown = requireCommand("dpkg-deb", ["-f", deb], {
    label: `dpkg-deb -f ${path.basename(deb)}`,
  });
  const name = controlField(shown.stdout, "Package");
  const version = controlField(shown.stdout, "Version");
  const arch = controlField(shown.stdout, "Architecture");
  if (name === APT_SOURCE_PACKAGE) {
    return { name, version, arch, suite: "all" };
  }
  if (name !== GATEWAY_PACKAGE) {
    throw new Error(`unexpected package ${name} (expected ${GATEWAY_PACKAGE} or ${APT_SOURCE_PACKAGE})`);
  }
  const distro = parseRosDistro(controlField(shown.stdout, "X-ROS-Distro"));
  return { name, version, arch, distro, suite: suiteForDistro(distro) };
}

function poolPath(identity: { name: string; version: string; arch: string }, suite: UbuntuSuite): string {
  const letter = identity.name.startsWith("lib") ? identity.name.slice(0, 4) : identity.name[0];
  return path.join("pool", suite, "main", letter, identity.name, `${identity.name}_${identity.version}_${identity.arch}.deb`);
}

function writeRelease(args: {
  suite: UbuntuSuite;
  files: Array<{ rel: string; size: number; md5: string; sha256: string }>;
}): string {
  const date = new Date().toUTCString();
  const md5 = args.files
    .map((f) => ` ${f.md5} ${String(f.size).padStart(8)} ${f.rel}`)
    .join("\n");
  const sha256 = args.files
    .map((f) => ` ${f.sha256} ${String(f.size).padStart(8)} ${f.rel}`)
    .join("\n");
  return [
    "Origin: rclweb",
    "Label: rclweb",
    `Suite: ${args.suite}`,
    `Codename: ${args.suite}`,
    "Architectures: amd64 arm64",
    "Components: main",
    "Description: rclwebd packages (not a ROS buildfarm release)",
    `Date: ${date}`,
    "MD5Sum:",
    md5,
    "SHA256:",
    sha256,
    "",
  ].join("\n");
}

function writePackagesGz(packagesFile: string): void {
  const gz = runCommandBinary("gzip", ["-9n", "-c", packagesFile]);
  if (gz.status !== 0) {
    throw new Error(`gzip Packages failed:\n${gz.stderr}`);
  }
  writeFileSync(`${packagesFile}.gz`, gz.stdout);
}

export function publishAptRepo(args: PublishAptRepoArgs): PublishedAptRepo {
  requireTool("dpkg-deb");
  requireTool("dpkg-scanpackages");
  requireTool("gpg");
  requireTool("gzip");
  const aptRoot = path.join(args.outDir, "apt");
  mkdirSync(aptRoot, { recursive: true });

  const bySuite = new Map<UbuntuSuite, string[]>();
  const allDebs: string[] = [];
  for (const deb of args.debs) {
    const identity = readDebIdentity(deb);
    if (identity.suite === "all") {
      allDebs.push(deb);
      continue;
    }
    const list = bySuite.get(identity.suite) ?? [];
    list.push(deb);
    bySuite.set(identity.suite, list);
  }
  if (bySuite.size === 0) {
    throw new Error("no rclwebd debs to publish (need jazzy/noble and/or humble/jammy)");
  }

  const suites: UbuntuSuite[] = [];
  for (const suite of ["noble", "jammy"] as const) {
    const gatewayDebs = bySuite.get(suite) ?? [];
    if (gatewayDebs.length === 0 && allDebs.length === 0) continue;
    if (gatewayDebs.length === 0) continue;
    suites.push(suite);
    mkdirSync(path.join(aptRoot, "pool", suite, "main"), { recursive: true });
    for (const deb of [...gatewayDebs, ...allDebs]) {
      const identity = readDebIdentity(deb);
      const dest = path.join(aptRoot, poolPath(identity, suite));
      mkdirSync(path.dirname(dest), { recursive: true });
      copyFileSync(deb, dest);
    }
    const dist = path.join(aptRoot, "dists", suite, "main");
    for (const arch of ["amd64", "arm64"] as const) {
      const packagesFile = path.join(dist, `binary-${arch}`, "Packages");
      mkdirSync(path.dirname(packagesFile), { recursive: true });
      const scanned = requireCommand(
        "dpkg-scanpackages",
        ["--arch", arch, "--multiversion", `pool/${suite}`, "/dev/null"],
        { cwd: aptRoot, label: `dpkg-scanpackages ${suite} ${arch}` },
      );
      writeFileSync(packagesFile, scanned.stdout);
      writePackagesGz(packagesFile);
    }
    const componentFiles = ["amd64", "arm64"].flatMap((arch) => [
      `main/binary-${arch}/Packages`,
      `main/binary-${arch}/Packages.gz`,
    ]);
    const hashed = componentFiles.map((rel) => {
      const abs = path.join(aptRoot, "dists", suite, rel);
      const digest = fileDigest(abs);
      return { rel, ...digest };
    });
    const release = writeRelease({ suite, files: hashed });
    writeFileSync(path.join(aptRoot, "dists", suite, "Release"), release);
  }

  const gnupgHome = createGnupgHome(args.outDir);
  const passphrase = args.passphrase ?? "";
  importSecretKey(gnupgHome, args.secretArmor, passphrase);
  const signPrefix = passphrase
    ? ["--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase", passphrase]
    : ["--batch", "--yes"];
  const inRelease: string[] = [];
  for (const suite of suites) {
    const releasePath = path.join(aptRoot, "dists", suite, "Release");
    const inReleasePath = path.join(aptRoot, "dists", suite, "InRelease");
    const detached = path.join(aptRoot, "dists", suite, "Release.gpg");
    requireCommand(
      "gpg",
      [...signPrefix, "--clearsign", "--output", inReleasePath, releasePath],
      { env: { GNUPGHOME: gnupgHome }, label: `gpg --clearsign ${suite}` },
    );
    requireCommand(
      "gpg",
      [...signPrefix, "--detach-sign", "--armor", "--output", detached, releasePath],
      { env: { GNUPGHOME: gnupgHome }, label: `gpg --detach-sign ${suite}` },
    );
    inRelease.push(inReleasePath);
  }

  writeFileSync(
    path.join(args.outDir, "index.html"),
    [
      "<!doctype html>",
      "<meta charset=utf-8>",
      "<title>rclweb apt</title>",
      "<pre>",
      "sudo apt install ./rclweb-apt-source_*.deb",
      "sudo apt update",
      "sudo apt install rclwebd",
      "</pre>",
      "<p>Not bloom. Package name is <code>rclwebd</code>.</p>",
      "",
    ].join("\n"),
  );

  return { aptRoot, suites, inRelease };
}

function collectDebs(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".deb"))
    .map((name) => path.join(dir, name));
}

function parseArgs(argv: string[]): {
  debsDir: string;
  outDir: string;
  secretFile?: string;
} {
  const parsed: { debsDir?: string; outDir?: string; secretFile?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--debs-dir":
        parsed.debsDir = next;
        i += 1;
        break;
      case "--out-dir":
        parsed.outDir = next;
        i += 1;
        break;
      case "--secret-file":
        parsed.secretFile = next;
        i += 1;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!parsed.debsDir || !parsed.outDir) {
    throw new Error(
      "usage: bun run scripts/publish-apt-repo.ts --debs-dir DIR --out-dir DIR [--secret-file PATH]",
    );
  }
  return { debsDir: parsed.debsDir, outDir: parsed.outDir, secretFile: parsed.secretFile };
}

function main(argv: string[]): void {
  const parsed = parseArgs(argv);
  const secretArmor =
    parsed.secretFile !== undefined
      ? readFileSync(parsed.secretFile, "utf8")
      : process.env.RCLWEB_APT_GPG_PRIVATE_KEY;
  if (!secretArmor) {
    throw new Error("set RCLWEB_APT_GPG_PRIVATE_KEY or pass --secret-file");
  }
  const published = publishAptRepo({
    debs: collectDebs(parsed.debsDir),
    outDir: parsed.outDir,
    secretArmor,
    passphrase: process.env.RCLWEB_APT_GPG_PASSPHRASE,
  });
  console.log(published.aptRoot);
  console.log(`suites ${published.suites.join(",")}`);
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
