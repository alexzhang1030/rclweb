import { spawnSync } from "node:child_process";

export type RunResult = {
  status: number;
  stdout: string;
  stderr: string;
};

export function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): RunResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    encoding: "utf8",
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function runCommandBinary(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): { status: number; stdout: Buffer; stderr: string } {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
  return {
    status: result.status ?? 1,
    stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? ""),
    stderr: (result.stderr ?? "").toString(),
  };
}

export function requireCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; label?: string } = {},
): RunResult {
  const result = runCommand(command, args, options);
  if (result.status !== 0) {
    const label = options.label ?? `${command} ${args.join(" ")}`;
    throw new Error(`${label} failed:\n${result.stderr || result.stdout}`);
  }
  return result;
}

export function requireTool(name: string): void {
  const result = runCommand("sh", ["-c", `command -v ${name}`]);
  if (result.status !== 0) {
    throw new Error(`missing ${name}; install dpkg-dev / gnupg / gzip`);
  }
}
