import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..");
const installer = path.join(repoRoot, "scripts", "install-rclwebd.sh");
const amentInstaller = path.join(repoRoot, "scripts", "install-rclwebd-ament.sh");
const fromPathWrapper = path.join(repoRoot, "packaging", "ament", "rclwebd", "rclwebd-from-path.sh");
const amentPackageXml = path.join(repoRoot, "packaging", "ament", "rclwebd", "package.xml");
const amentLaunch = path.join(repoRoot, "packaging", "ament", "rclwebd", "launch", "rclwebd.launch.py");
const amentCmake = path.join(repoRoot, "packaging", "ament", "rclwebd", "CMakeLists.txt");
const wrapper = path.join(repoRoot, "scripts", "rclwebd-ros.sh");
const systemUnit = path.join(repoRoot, "packaging", "systemd", "rclwebd.service");
const userUnit = path.join(repoRoot, "packaging", "systemd", "rclwebd.user.service");
const envExample = path.join(repoRoot, "packaging", "systemd", "rclwebd.env.example");

const tempRoots: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  while (tempRoots.length) {
    const dir = tempRoots.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

function read(rel: string): string {
  return readFileSync(rel, "utf8");
}

const INSTALLER_ENV = [
  "RCLWEBD_BIN",
  "RCLWEBD_AMENT_PREFIX",
  "RCLWEBD_VERSION",
  "RCLWEBD_INSTALL_DIR",
  "RCLWEBD_REPO",
  "RCLWEBD_UNIT_REF",
  "ROS_DISTRO",
] as const;

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
): { status: number | null; stdout: string; stderr: string } {
  const merged: NodeJS.ProcessEnv = { ...process.env, ...env };
  for (const key of INSTALLER_ENV) {
    if (!Object.hasOwn(env, key)) {
      delete merged[key];
    }
  }
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: merged,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function timeoutStopSec(unit: string): number {
  const match = unit.match(/^TimeoutStopSec=(\d+)$/m);
  expect(match).not.toBeNull();
  return Number(match![1]);
}

function writeFakeBinary(dir: string): string {
  mkdirSync(dir, { recursive: true });
  const bin = path.join(dir, "rclwebd");
  writeFileSync(bin, "#!/usr/bin/env bash\nprintf 'fake-rclwebd %s\\n' \"$*\"\n");
  chmodSync(bin, 0o755);
  return bin;
}

function blockedCurlPath(home: string): { path: string; log: string } {
  const log = path.join(home, "curl.log");
  const binDir = path.join(home, "blocked-bin");
  mkdirSync(binDir, { recursive: true });
  writeFileSync(
    path.join(binDir, "curl"),
    "#!/usr/bin/env bash\nprintf 'invoked\\n' >>\"${CURL_LOG}\"\nexit 1\n",
  );
  chmodSync(path.join(binDir, "curl"), 0o755);
  return { path: `${binDir}:${process.env.PATH ?? "/usr/bin"}`, log };
}

describe("systemd unit files", () => {
  test("share the host-binary contract and keep placeholders", () => {
    for (const unit of [read(systemUnit), read(userUnit)]) {
      expect(unit).toContain("Type=simple");
      expect(unit).toContain("ExecStart=@EXEC@");
      expect(unit).toContain("EnvironmentFile=-@ENVFILE@");
      expect(unit).toContain("KillSignal=SIGTERM");
      expect(unit).not.toMatch(/^ExecStop=/m);
      expect(unit).not.toContain("ProtectSystem=strict");
      expect(unit).not.toContain("RCLWEBD_AUTH_MODE");
      expect(unit).not.toContain("AUTH_MODE=oidc");
      expect(timeoutStopSec(unit)).toBeGreaterThanOrEqual(20);
    }
  });

  test("system unit waits for the network; user unit does not", () => {
    const system = read(systemUnit);
    const user = read(userUnit);
    expect(system).toContain("After=network-online.target");
    expect(system).toContain("Wants=network-online.target");
    expect(system).toContain("WantedBy=multi-user.target");
    expect(user).not.toContain("network-online.target");
    expect(user).toContain("WantedBy=default.target");
  });

  test("env example documents the wrapper and does not enable oidc or a row", () => {
    const env = read(envExample);
    expect(env).toContain("not a sourced ROS prefix");
    expect(env).toContain("Do not set RCLWEBD_AUTH_MODE=oidc");
    expect(env).not.toMatch(/^RCLWEBD_AUTH_MODE=/m);
    expect(env).not.toMatch(/^RCLWEBD_SUPPORT_ROW=/m);
    expect(env).not.toMatch(/^RCLWEBD_OFFER_WEBTRANSPORT=/m);
    expect(env).toContain("This unit does not start the router");
  });
});

describe("rclwebd-ros.sh", () => {
  test("sources with nounset off and does not default the support row", () => {
    const text = read(wrapper);
    expect(text).toMatch(/set \+u\s*\nsource "\$\{setup\}"\s*\nset -u/);
    expect(text).not.toMatch(/RCLWEBD_SUPPORT_ROW=\$\{RCLWEBD_SUPPORT_ROW:-/);
    expect(text).not.toMatch(/RCLWEBD_SUPPORT_ROW:-J-FT/);
    expect(text).toContain("Do not default RCLWEBD_SUPPORT_ROW");
  });

  test("fails when the configured setup.bash is missing", () => {
    const missing = path.join(tempDir("rclwebd-missing-setup-"), "nope", "setup.bash");
    const result = run("bash", [wrapper], { RCLWEBD_ROS_SETUP: missing });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no ROS 2 setup.bash");
  });

  test("sources the setup then execs RCLWEBD_BIN", () => {
    const root = tempDir("rclwebd-wrapper-");
    const prefix = path.join(root, "opt", "ros", "jazzy");
    mkdirSync(prefix, { recursive: true });
    writeFileSync(
      path.join(prefix, "setup.bash"),
      [
        "# pretend ROS setup; nounset is off here.",
        'echo "optional=${UNSET_OPTIONAL:-ok}" >/dev/null',
        "export WRAPPER_SOURCED=1",
        "",
      ].join("\n"),
    );
    const bin = path.join(root, "fake-rclwebd");
    writeFileSync(
      bin,
      [
        "#!/usr/bin/env bash",
        "printf 'sourced=%s\\n' \"${WRAPPER_SOURCED:-0}\"",
        "printf 'prefix=%s\\n' \"${ROS_PREFIX:-}\"",
        "printf 'row=%s\\n' \"${RCLWEBD_SUPPORT_ROW:-unset}\"",
        "printf 'args=%s\\n' \"$*\"",
        "",
      ].join("\n"),
    );
    chmodSync(bin, 0o755);

    const result = run("bash", [wrapper, "--probe"], {
      RCLWEBD_ROS_SETUP: path.join(prefix, "setup.bash"),
      RCLWEBD_BIN: bin,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("sourced=1");
    expect(result.stdout).toContain(`prefix=${prefix}`);
    expect(result.stdout).toContain("row=unset");
    expect(result.stdout).toContain("args=--probe");
  });
});

describe("install-rclwebd.sh --systemd-only", () => {
  test("installs a user unit from the local tree without downloading", () => {
    const home = tempDir("rclwebd-home-");
    const installDir = path.join(home, "bin");
    const curlLog = path.join(home, "curl.log");
    const binDir = path.join(home, "blocked-bin");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(
      path.join(binDir, "curl"),
      "#!/usr/bin/env bash\nprintf 'invoked\\n' >>\"${CURL_LOG}\"\nexit 1\n",
    );
    chmodSync(path.join(binDir, "curl"), 0o755);

    const result = run("bash", [installer, "--systemd-only", "--systemd", "user", "--dir", installDir], {
      HOME: home,
      CURL_LOG: curlLog,
      PATH: `${binDir}:${process.env.PATH ?? "/usr/bin"}`,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("not enabled");
    expect(result.stdout).toContain("systemctl --user daemon-reload");

    const unitPath = path.join(home, ".config", "systemd", "user", "rclwebd.service");
    const envPath = path.join(home, ".config", "rclwebd", "rclwebd.env");
    const wrapperDest = path.join(installDir, "rclwebd-ros.sh");
    const unit = readFileSync(unitPath, "utf8");
    expect(unit).toContain(`ExecStart=${wrapperDest}`);
    expect(unit).toContain(`EnvironmentFile=-${envPath}`);
    expect(unit).not.toContain("@EXEC@");
    expect(unit).not.toContain("@ENVFILE@");
    expect(unit).toContain("Type=simple");
    expect(unit).toContain("WantedBy=default.target");
    expect(readFileSync(envPath, "utf8")).toContain("not a sourced ROS prefix");
    expect(readFileSync(wrapperDest, "utf8")).toContain("Do not default RCLWEBD_SUPPORT_ROW");
    expect(() => readFileSync(curlLog, "utf8")).toThrow();
    expect(existsSync(path.join(home, ".local", "share", "rclwebd"))).toBe(false);
    expect(result.stdout).not.toContain("ament overlay");
  });

  test("does not overwrite an existing env file", () => {
    const home = tempDir("rclwebd-keep-env-");
    const installDir = path.join(home, "bin");
    const envPath = path.join(home, ".config", "rclwebd", "rclwebd.env");
    mkdirSync(path.dirname(envPath), { recursive: true });
    writeFileSync(envPath, "# operator-owned\nRCLWEBD_BIND=10.0.0.2:8794\n");

    const first = run("bash", [installer, "--systemd-only", "--systemd", "user", "--dir", installDir], {
      HOME: home,
    });
    expect(first.status).toBe(0);
    expect(first.stdout).toContain("kept existing");
    expect(readFileSync(envPath, "utf8")).toBe("# operator-owned\nRCLWEBD_BIND=10.0.0.2:8794\n");
  });

  test("infers user vs system from --dir and dry-run needs no network", () => {
    const home = tempDir("rclwebd-infer-");
    const curlLog = path.join(home, "curl.log");
    const binDir = path.join(home, "blocked-bin");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(
      path.join(binDir, "curl"),
      "#!/usr/bin/env bash\nprintf 'invoked\\n' >>\"${CURL_LOG}\"\nexit 1\n",
    );
    chmodSync(path.join(binDir, "curl"), 0o755);
    const blockedPath = `${binDir}:${process.env.PATH ?? "/usr/bin"}`;

    const userDry = run(
      "bash",
      [installer, "--systemd-only", "--dry-run", "--dir", path.join(home, "bin")],
      { HOME: home, CURL_LOG: curlLog, PATH: blockedPath },
    );
    expect(userDry.status).toBe(0);
    expect(userDry.stdout).toContain("systemd (user)");
    expect(userDry.stdout).toContain(path.join(home, ".config", "systemd", "user", "rclwebd.service"));

    const systemDry = run("bash", [installer, "--systemd-only", "--dry-run", "--dir", "/opt/rclwebd"], {
      HOME: home,
      CURL_LOG: curlLog,
      PATH: blockedPath,
    });
    expect(systemDry.status).toBe(0);
    expect(systemDry.stdout).toContain("systemd (system)");
    expect(systemDry.stdout).toContain("/etc/systemd/system/rclwebd.service");
    expect(systemDry.stdout).toContain("/etc/rclwebd.env");
    expect(() => readFileSync(curlLog, "utf8")).toThrow();
  });

  test("refuses --systemd system unless root", () => {
    if (process.getuid?.() === 0) {
      return;
    }
    const result = run("bash", [installer, "--systemd-only", "--systemd", "system", "--dir", "/usr/local/bin"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("run as root");
  });
});

describe("ament overlay sources", () => {
  test("package.xml is named rclwebd and does not depend on launch_ros", () => {
    const xml = read(amentPackageXml);
    expect(xml).toContain("<name>rclwebd</name>");
    expect(xml).toContain("<version>0.0.6</version>");
    expect(xml).toContain("<build_type>ament_cmake</build_type>");
    expect(xml).not.toContain("launch_ros");
  });

  test("launch uses ExecuteProcess and does not inject --ros-args", () => {
    const launch = read(amentLaunch);
    expect(launch).toContain("def generate_launch_description");
    expect(launch).toContain("ExecuteProcess");
    expect(launch).toContain('get_package_prefix("rclwebd")');
    expect(launch).not.toContain("launch_ros");
    expect(launch).not.toContain("Node(");
    expect(launch).not.toContain("--ros-args");
  });

  test("CMake overlay installs the binary or the PATH-free wrapper", () => {
    const cmake = read(amentCmake);
    expect(cmake).toContain("project(rclwebd)");
    expect(cmake).toContain("RCLWEBD_BIN");
    expect(cmake).toContain("rclwebd-from-path.sh");
    expect(cmake).toContain('install(DIRECTORY launch DESTINATION "share/${PROJECT_NAME}")');
  });

  test("from-path wrapper requires RCLWEBD_BIN and does not search PATH", () => {
    const text = read(fromPathWrapper);
    expect(text).not.toMatch(/command -v rclwebd/);
    expect(text).toContain("RCLWEBD_BIN");

    const missing = run("bash", [fromPathWrapper]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("RCLWEBD_BIN");

    const root = tempDir("rclwebd-from-path-");
    const bin = writeFakeBinary(root);
    const result = run("bash", [fromPathWrapper, "--probe"], { RCLWEBD_BIN: bin });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("fake-rclwebd --probe");
  });
});

describe("install-rclwebd-ament.sh", () => {
  test("dry-run prints the overlay layout without writing or fetching", () => {
    const home = tempDir("rclwebd-ament-dry-");
    const prefix = path.join(home, "overlay");
    const blocked = blockedCurlPath(home);
    const result = run("bash", [amentInstaller, "--prefix", prefix, "--dry-run"], {
      HOME: home,
      CURL_LOG: blocked.log,
      PATH: blocked.path,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`would write ${path.join(prefix, "lib", "rclwebd", "rclwebd")}`);
    expect(result.stdout).toContain(`would write ${path.join(prefix, "local_setup.bash")}`);
    expect(existsSync(prefix)).toBe(false);
    expect(() => readFileSync(blocked.log, "utf8")).toThrow();
  });

  test("writes the overlay, prepends AMENT_PREFIX_PATH, and links the binary", () => {
    const home = tempDir("rclwebd-ament-write-");
    const prefix = path.join(home, "overlay");
    const bin = writeFakeBinary(path.join(home, "bin"));
    const blocked = blockedCurlPath(home);

    const result = run("bash", [amentInstaller, "--prefix", prefix, "--bin", bin], {
      HOME: home,
      CURL_LOG: blocked.log,
      PATH: blocked.path,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ros2 run rclwebd rclwebd");

    const destBin = path.join(prefix, "lib", "rclwebd", "rclwebd");
    const setup = path.join(prefix, "local_setup.bash");
    expect(readFileSync(path.join(prefix, "share", "rclwebd", "package.xml"), "utf8")).toContain(
      "<name>rclwebd</name>",
    );
    expect(
      readFileSync(path.join(prefix, "share", "rclwebd", "launch", "rclwebd.launch.py"), "utf8"),
    ).toContain("generate_launch_description");
    expect(existsSync(path.join(prefix, "share", "ament_index", "resource_index", "packages", "rclwebd"))).toBe(
      true,
    );
    expect(realpathSync(destBin)).toBe(realpathSync(bin));

    const sourced = run("bash", [
      "-c",
      [
        "set -euo pipefail",
        "export AMENT_PREFIX_PATH=/opt/ros/jazzy",
        "export COLCON_PREFIX_PATH=/opt/ros/jazzy",
        `source "${setup}"`,
        'printf "ament=%s\\n" "$AMENT_PREFIX_PATH"',
        'printf "colcon=%s\\n" "$COLCON_PREFIX_PATH"',
      ].join("\n"),
    ]);
    expect(sourced.status).toBe(0);
    expect(sourced.stdout).toContain(`ament=${prefix}:/opt/ros/jazzy`);
    expect(sourced.stdout).toContain(`colcon=${prefix}:/opt/ros/jazzy`);
    expect(() => readFileSync(blocked.log, "utf8")).toThrow();
  });

  test("wrapper-only does not recurse through PATH", () => {
    const home = tempDir("rclwebd-ament-wrapper-");
    const prefix = path.join(home, "overlay");
    const result = run("bash", [amentInstaller, "--prefix", prefix, "--wrapper-only"]);
    expect(result.status).toBe(0);
    const dest = path.join(prefix, "lib", "rclwebd", "rclwebd");
    expect(readFileSync(dest, "utf8")).not.toMatch(/command -v rclwebd/);

    const missing = run("bash", [dest]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("RCLWEBD_BIN");

    const bin = writeFakeBinary(path.join(home, "real"));
    const execd = run("bash", [dest, "hello"], { RCLWEBD_BIN: bin });
    expect(execd.status).toBe(0);
    expect(execd.stdout).toContain("fake-rclwebd hello");
  });
});

describe("install-rclwebd.sh --ament-only", () => {
  test("writes the overlay from the local tree without downloading", () => {
    const home = tempDir("rclwebd-install-ament-");
    const installDir = path.join(home, "bin");
    const prefix = path.join(home, "overlay");
    writeFakeBinary(installDir);
    const blocked = blockedCurlPath(home);

    const result = run(
      "bash",
      [installer, "--ament-only", "--dir", installDir, "--ament-prefix", prefix],
      { HOME: home, CURL_LOG: blocked.log, PATH: blocked.path },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ament overlay");
    expect(result.stdout).toContain("ros2 run rclwebd rclwebd");
    expect(result.stdout).not.toContain("systemd (");
    expect(existsSync(path.join(prefix, "lib", "rclwebd", "rclwebd"))).toBe(true);
    expect(readFileSync(path.join(prefix, "share", "rclwebd", "package.xml"), "utf8")).toContain(
      "<name>rclwebd</name>",
    );
    expect(() => readFileSync(blocked.log, "utf8")).toThrow();
  });

  test("dry-run prints the overlay and needs no binary or network", () => {
    const home = tempDir("rclwebd-install-ament-dry-");
    const prefix = path.join(home, "overlay");
    const blocked = blockedCurlPath(home);
    const result = run("bash", [installer, "--ament-only", "--dry-run", "--ament-prefix", prefix], {
      HOME: home,
      CURL_LOG: blocked.log,
      PATH: blocked.path,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`would write ${path.join(prefix, "lib", "rclwebd", "rclwebd")}`);
    expect(result.stdout).toContain("ros2 run rclwebd rclwebd");
    expect(existsSync(prefix)).toBe(false);
    expect(() => readFileSync(blocked.log, "utf8")).toThrow();
  });

  test("fails when the binary is missing unless --wrapper-only", () => {
    const home = tempDir("rclwebd-install-ament-missing-");
    const prefix = path.join(home, "overlay");
    const missing = run("bash", [
      installer,
      "--ament-only",
      "--dir",
      path.join(home, "empty"),
      "--ament-prefix",
      prefix,
    ]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("no rclwebd binary");

    const wrapped = run("bash", [installer, "--ament-only", "--wrapper-only", "--ament-prefix", prefix], {
      HOME: home,
    });
    expect(wrapped.status).toBe(0);
    expect(readFileSync(path.join(prefix, "lib", "rclwebd", "rclwebd"), "utf8")).toContain("RCLWEBD_BIN");
  });

  test("refuses --no-ament with --ament-only", () => {
    const result = run("bash", [installer, "--ament-only", "--no-ament"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("cannot be combined");
  });

  test("--systemd-only --ament writes the overlay and the user unit", () => {
    const home = tempDir("rclwebd-systemd-ament-");
    const installDir = path.join(home, "bin");
    const prefix = path.join(home, "overlay");
    writeFakeBinary(installDir);
    const blocked = blockedCurlPath(home);
    const result = run(
      "bash",
      [
        installer,
        "--systemd-only",
        "--systemd",
        "user",
        "--dir",
        installDir,
        "--ament",
        "--ament-prefix",
        prefix,
      ],
      { HOME: home, CURL_LOG: blocked.log, PATH: blocked.path },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("systemd (user)");
    expect(result.stdout).toContain("ament overlay");
    expect(existsSync(path.join(home, ".config", "systemd", "user", "rclwebd.service"))).toBe(true);
    expect(existsSync(path.join(prefix, "local_setup.bash"))).toBe(true);
    expect(() => readFileSync(blocked.log, "utf8")).toThrow();
  });
});

