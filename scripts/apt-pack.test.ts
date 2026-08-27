import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateAptArchiveKey } from "./apt-archive-key.ts";
import {
  APT_SOURCE_PACKAGE,
  APT_URI_DEFAULT,
  GATEWAY_PACKAGE,
  KEYRING_INSTALL_PATH,
  GATEWAY_TARGETS,
  debianVersion,
  distroForSuite,
  gatewayDebName,
  gatewayDepends,
  parseRosDistro,
  releaseBinaryName,
  suiteForDistro,
  writeDeb822Sources,
} from "./apt-distro.ts";
import { runCommand } from "./apt-run.ts";
import { packRclwebAptSource } from "./pack-rclweb-apt-source.ts";
import { packRclwebdDeb } from "./pack-rclwebd-deb.ts";
import { packReleaseDebs } from "./pack-release-debs.ts";
import { publishAptRepo, readDebIdentity } from "./publish-apt-repo.ts";
import { readWorkspaceVersion } from "./workspace-version.ts";

const repoRoot = path.resolve(import.meta.dir, "..");
const tempRoots: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  while (tempRoots.length) {
    const dir = tempRoots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function stubBinary(dir: string): string {
  const bin = path.join(dir, "rclwebd");
  writeFileSync(bin, "#!/bin/sh\necho rclwebd-stub\n");
  chmodSync(bin, 0o755);
  return bin;
}

function requireTool(name: string): void {
  if (runCommand("sh", ["-c", `command -v ${name}`]).status !== 0) {
    throw new Error(`missing ${name}; install dpkg-dev / gnupg / gzip`);
  }
}

describe("apt distro mapping", () => {
  test("jazzy is noble and humble is jammy", () => {
    expect(suiteForDistro("jazzy")).toBe("noble");
    expect(suiteForDistro("humble")).toBe("jammy");
    expect(distroForSuite("noble")).toBe("jazzy");
    expect(distroForSuite("jammy")).toBe("humble");
    expect(parseRosDistro("jazzy")).toBe("jazzy");
    expect(() => parseRosDistro("kilted")).toThrow(/unknown ROS distro/);
  });

  test("deb822 source uses Signed-By and never trusted.gpg", () => {
    const body = writeDeb822Sources({ uri: APT_URI_DEFAULT, suite: "noble" });
    expect(body).toContain(`Signed-By: ${KEYRING_INSTALL_PATH}`);
    expect(body).toContain("Suites: noble");
    expect(body).not.toContain("trusted.gpg");
    expect(body).not.toContain("apt-key");
  });

  test("gateway Depends names the matching ROS packages", () => {
    expect(gatewayDepends("jazzy")).toContain("ros-jazzy-rcl");
    expect(gatewayDepends("jazzy")).not.toContain("ros-humble-");
    expect(gatewayDepends("humble")).toContain("ros-humble-rmw");
  });

  test("workspace version matches the debian upstream", () => {
    expect(debianVersion(readWorkspaceVersion(repoRoot))).toBe("0.0.6-1");
    expect(debianVersion("0.0.6", "noble")).toBe("0.0.6-1~noble");
    expect(debianVersion("0.0.6", "jammy")).toBe("0.0.6-1~jammy");
    expect(gatewayDebName({ version: "0.0.6", distro: "jazzy", arch: "amd64" })).toBe(
      "rclwebd_0.0.6-1~noble_amd64.deb",
    );
    expect(gatewayDebName({ version: "0.0.6", distro: "humble", arch: "amd64" })).toBe(
      "rclwebd_0.0.6-1~jammy_amd64.deb",
    );
    expect(gatewayDebName({ version: "0.0.6", distro: "jazzy", arch: "amd64" })).not.toBe(
      gatewayDebName({ version: "0.0.6", distro: "humble", arch: "amd64" }),
    );
    expect(GATEWAY_TARGETS).toHaveLength(4);
    expect(releaseBinaryName("0.0.6", "jazzy", "amd64")).toBe("rclwebd-0.0.6-jazzy-amd64");
  });
});

describe("pack rclwebd deb", () => {
  test("jazzy amd64 package is rclwebd, not ros-jazzy-rclwebd", () => {
    requireTool("dpkg-deb");
    const dir = tempDir("rclwebd-deb-");
    const packed = packRclwebdDeb({
      root: repoRoot,
      bin: stubBinary(dir),
      distro: "jazzy",
      arch: "amd64",
      outDir: dir,
      runtimeDepends: true,
    });
    expect(path.basename(packed.deb)).toBe("rclwebd_0.0.6-1~noble_amd64.deb");
    expect(packed.control).toContain(`Package: ${GATEWAY_PACKAGE}\n`);
    expect(packed.control).toContain("Version: 0.0.6-1~noble");
    expect(packed.control).toContain("X-ROS-Distro: jazzy");
    expect(packed.control).not.toContain("Package: ros-jazzy-rclwebd");
    expect(packed.control).toContain("Depends: libc6");
    expect(packed.control).toContain("ros-jazzy-rcl");
    expect(packed.control).toContain("Recommends: ros-jazzy-rmw-fastrtps-cpp");
    expect(readDebIdentity(packed.deb)).toMatchObject({
      name: GATEWAY_PACKAGE,
      distro: "jazzy",
      suite: "noble",
      arch: "amd64",
    });

    const listed = runCommand("dpkg-deb", ["-c", packed.deb]);
    expect(listed.status).toBe(0);
    expect(listed.stdout).toContain("./opt/rclwebd/lib/rclwebd/rclwebd");
    expect(listed.stdout).toContain("./opt/rclwebd/local_setup.bash");
    expect(listed.stdout).toContain("./opt/rclwebd/share/ament_index/resource_index/packages/rclwebd");
    expect(listed.stdout).toContain("./usr/lib/rclwebd/rclwebd-ros.sh");
    expect(listed.stdout).toContain("./lib/systemd/system/rclwebd.service");
    expect(listed.stdout).toContain("./usr/bin/rclwebd");

    const tar = runCommand("sh", [
      "-c",
      `dpkg-deb --fsys-tarfile "${packed.deb}" | tar -xOf - ./lib/systemd/system/rclwebd.service`,
    ]);
    expect(tar.stdout).toContain("ExecStart=/usr/lib/rclwebd/rclwebd-ros.sh");
    expect(tar.stdout).toContain("EnvironmentFile=-/etc/rclwebd/rclwebd.env");
    expect(tar.stdout).not.toContain("@EXEC@");
    expect(tar.stdout).not.toMatch(/^WantedBy=.*\nenable/m);

    const overlayBin = runCommand("sh", [
      "-c",
      `dpkg-deb --fsys-tarfile "${packed.deb}" | tar -t | grep lib/rclwebd/rclwebd`,
    ]);
    expect(overlayBin.stdout).not.toContain("->");
  });

  test("humble deb Depends on humble ROS packages", () => {
    requireTool("dpkg-deb");
    const dir = tempDir("rclwebd-humble-");
    const packed = packRclwebdDeb({
      root: repoRoot,
      bin: stubBinary(dir),
      distro: "humble",
      arch: "arm64",
      outDir: dir,
    });
    expect(path.basename(packed.deb)).toBe("rclwebd_0.0.6-1~jammy_arm64.deb");
    expect(packed.control).toContain("Version: 0.0.6-1~jammy");
    expect(packed.control).toContain("X-ROS-Distro: humble");
    expect(packed.control).toContain("ros-humble-rcl");
    expect(packed.control).not.toContain("ros-jazzy-");
    expect(readDebIdentity(packed.deb).suite).toBe("jammy");
  });

  test("jazzy and humble amd64 debs can share one directory", () => {
    requireTool("dpkg-deb");
    const dir = tempDir("rclwebd-both-");
    const jazzy = packRclwebdDeb({
      root: repoRoot,
      bin: stubBinary(dir),
      distro: "jazzy",
      arch: "amd64",
      outDir: dir,
    });
    const humble = packRclwebdDeb({
      root: repoRoot,
      bin: stubBinary(dir),
      distro: "humble",
      arch: "amd64",
      outDir: dir,
    });
    expect(path.basename(jazzy.deb)).not.toBe(path.basename(humble.deb));
    expect(existsSync(jazzy.deb)).toBe(true);
    expect(existsSync(humble.deb)).toBe(true);
  });

  test("pack-release-debs wraps all four release binary names", () => {
    requireTool("dpkg-deb");
    const dir = tempDir("rclwebd-release-debs-");
    const binDir = path.join(dir, "bins");
    mkdirSync(binDir, { recursive: true });
    for (const target of GATEWAY_TARGETS) {
      const bin = path.join(binDir, releaseBinaryName("0.0.6", target.distro, target.arch));
      writeFileSync(bin, "#!/bin/sh\necho rclwebd-stub\n");
      chmodSync(bin, 0o755);
    }
    const packed = packReleaseDebs({
      root: repoRoot,
      binDir,
      outDir: path.join(dir, "debs"),
      version: "0.0.6",
    });
    expect(packed.map((item) => path.basename(item.deb)).sort()).toEqual([
      "rclwebd_0.0.6-1~jammy_amd64.deb",
      "rclwebd_0.0.6-1~jammy_arm64.deb",
      "rclwebd_0.0.6-1~noble_amd64.deb",
      "rclwebd_0.0.6-1~noble_arm64.deb",
    ]);
  });
});

describe("apt repo", () => {
  test("signed noble repo is apt-get updateable", () => {
    requireTool("dpkg-deb");
    requireTool("gpg");
    requireTool("dpkg-scanpackages");
    const dir = tempDir("rclweb-apt-");
    const key = generateAptArchiveKey(path.join(dir, "key"));
    const gateway = packRclwebdDeb({
      root: repoRoot,
      bin: stubBinary(dir),
      distro: "jazzy",
      arch: "amd64",
      outDir: path.join(dir, "debs"),
    });
    const source = packRclwebAptSource({
      root: repoRoot,
      keyring: key.publicKeyring,
      outDir: path.join(dir, "debs"),
      uri: `file:${path.join(dir, "repo", "apt")}`,
    });
    expect(source.control).toContain(`Package: ${APT_SOURCE_PACKAGE}`);
    expect(source.control).toContain("Architecture: all");

    const published = publishAptRepo({
      debs: [gateway.deb, source.deb],
      outDir: path.join(dir, "repo"),
      secretArmor: key.secretArmor,
    });
    expect(published.suites).toEqual(["noble"]);
    expect(readdirSync(path.join(dir, "repo")).filter((name) => name.includes("gnupg"))).toEqual([]);
    expect(existsSync(path.join(published.aptRoot, "dists", "noble", "InRelease"))).toBe(true);
    expect(existsSync(path.join(published.aptRoot, "dists", "noble", "main", "binary-amd64", "Packages.gz"))).toBe(
      true,
    );
    const packages = readFileSync(
      path.join(published.aptRoot, "dists", "noble", "main", "binary-amd64", "Packages"),
      "utf8",
    );
    expect(packages).toContain(`Package: ${GATEWAY_PACKAGE}`);
    expect(packages).toContain(`Package: ${APT_SOURCE_PACKAGE}`);
    expect(packages).toContain("Filename: pool/noble/");
    expect(packages).toContain("rclwebd_0.0.6-1~noble_amd64.deb");

    const verify = runCommand("gpg", [
      "--batch",
      "--no-default-keyring",
      "--keyring",
      key.publicKeyring,
      "--verify",
      path.join(published.aptRoot, "dists", "noble", "InRelease"),
    ]);
    expect(verify.status).toBe(0);

    requireTool("apt-get");
    const lists = path.join(dir, "lists");
    mkdirSync(lists, { recursive: true });
    const sources = path.join(dir, "rclweb.sources");
    writeFileSync(
      sources,
      writeDeb822Sources({ uri: `file:${published.aptRoot}`, suite: "noble" }).replace(
        KEYRING_INSTALL_PATH,
        key.publicKeyring,
      ),
    );
    const update = runCommand("apt-get", [
      "update",
      `-oDir::Etc::sourcelist=${sources}`,
      "-oDir::Etc::sourceparts=/dev/null",
      `-oDir::State::lists=${lists}`,
      "-oAPT::Get::List-Cleanup=0",
    ]);
    expect(update.status).toBe(0);
    expect(update.stdout + update.stderr).toMatch(/rclweb|noble/);
  });

  test("jazzy and humble debs land in separate suite pools", () => {
    requireTool("dpkg-deb");
    requireTool("gpg");
    requireTool("dpkg-scanpackages");
    const dir = tempDir("rclweb-apt-both-");
    const key = generateAptArchiveKey(path.join(dir, "key"));
    const debsDir = path.join(dir, "debs");
    const jazzy = packRclwebdDeb({
      root: repoRoot,
      bin: stubBinary(dir),
      distro: "jazzy",
      arch: "amd64",
      outDir: debsDir,
    });
    const humble = packRclwebdDeb({
      root: repoRoot,
      bin: stubBinary(dir),
      distro: "humble",
      arch: "amd64",
      outDir: debsDir,
    });
    const published = publishAptRepo({
      debs: [jazzy.deb, humble.deb],
      outDir: path.join(dir, "repo"),
      secretArmor: key.secretArmor,
    });
    expect(published.suites).toEqual(["noble", "jammy"]);
    expect(existsSync(path.join(published.aptRoot, "pool", "noble", "main", "r", "rclwebd", path.basename(jazzy.deb)))).toBe(
      true,
    );
    expect(existsSync(path.join(published.aptRoot, "pool", "jammy", "main", "r", "rclwebd", path.basename(humble.deb)))).toBe(
      true,
    );
  });
});
