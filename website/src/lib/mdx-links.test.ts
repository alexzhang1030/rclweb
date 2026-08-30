import { expect, test } from "bun:test";
import { rewriteDocsHref } from "./mdx-links";

test("keeps in-docs markdown links on the site", () => {
  expect(rewriteDocsHref("./api.md", "typescript.md")).toBe("/docs/api");
  expect(rewriteDocsHref("./deploy.md#ros2-run", "typescript.md")).toBe("/docs/deploy#ros2-run");
  expect(rewriteDocsHref("../runtime/core.md", "gateway/rclwebd.md")).toBe("/docs/runtime/core");
  expect(rewriteDocsHref("./README.md", "typescript.md")).toBe("/docs/typescript");
  expect(rewriteDocsHref("../README.md", "adr/0020-fumadocs-tanstack-docs-site.md")).toBe(
    "/docs/typescript",
  );
  expect(rewriteDocsHref("./adr/README.md", "README.md")).toBe("/docs/adr/README");
});

test("sends repo paths outside docs/ to GitHub", () => {
  expect(rewriteDocsHref("../examples/subscribe-chatter/", "README.md")).toBe(
    "https://github.com/alexzhang1030/rclweb/blob/main/examples/subscribe-chatter",
  );
  expect(rewriteDocsHref("../CONTRIBUTING.md", "README.md")).toBe(
    "https://github.com/alexzhang1030/rclweb/blob/main/CONTRIBUTING.md",
  );
});

test("sends non-markdown docs files to GitHub", () => {
  expect(rewriteDocsHref("./acl-reference.json", "security.md")).toBe(
    "https://github.com/alexzhang1030/rclweb/blob/main/docs/acl-reference.json",
  );
});

test("leaves http and hash links alone", () => {
  expect(rewriteDocsHref("https://example.com/x", "api.md")).toBe("https://example.com/x");
  expect(rewriteDocsHref("#install", "typescript.md")).toBe("#install");
});
