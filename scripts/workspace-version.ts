import { readFileSync } from "node:fs";
import path from "node:path";

/** `[workspace.package].version` from the root Cargo.toml. */
export function readWorkspaceVersion(root: string): string {
  const text = readFileSync(path.join(root, "Cargo.toml"), "utf8");
  const marker = "[workspace.package]";
  const start = text.indexOf(marker);
  if (start < 0) {
    throw new Error("Cargo.toml missing [workspace.package]");
  }
  const section = text.slice(start + marker.length);
  const match = section.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error("Cargo.toml missing workspace.package.version");
  }
  return match[1];
}
