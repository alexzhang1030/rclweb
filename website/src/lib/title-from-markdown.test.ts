import { expect, test } from "bun:test";
import { titleFromMarkdown } from "./title-from-markdown";

test("uses the first ATX heading", () => {
  expect(titleFromMarkdown("# How to use rcl-web\n\nBody\n", "typescript.md")).toBe(
    "How to use rcl-web",
  );
});

test("strips backticks and links in the heading", () => {
  expect(titleFromMarkdown("# `rclweb` core\n", "runtime/core.md")).toBe("rclweb core");
});

test("falls back to the file stem", () => {
  expect(titleFromMarkdown("No heading\n", "adr/0020-fumadocs-tanstack-docs-site.md")).toBe(
    "0020-fumadocs-tanstack-docs-site",
  );
});
