import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const vercelJson = join(dirname(fileURLToPath(import.meta.url)), "vercel.json");

test("Vercel Root Directory is website, so the build must not copy website/.vercel/output", () => {
  const cfg = JSON.parse(readFileSync(vercelJson, "utf8")) as {
    buildCommand: string;
    installCommand: string;
  };
  expect(cfg.buildCommand).toBe("bun run build");
  expect(cfg.buildCommand).not.toContain("website/.vercel");
  expect(cfg.installCommand).toContain("bun install");
});
