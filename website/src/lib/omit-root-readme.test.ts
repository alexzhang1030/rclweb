import { expect, test } from "bun:test";
import { isRootReadmeFile, isRootReadmeUrl } from "./omit-root-readme";

test("matches only the docs root README", () => {
  expect(isRootReadmeFile("README.md")).toBe(true);
  expect(isRootReadmeFile("readme.md")).toBe(true);
  expect(isRootReadmeFile("adr/README.md")).toBe(false);
  expect(isRootReadmeFile("typescript.md")).toBe(false);
});

test("matches only the root README site URL", () => {
  expect(isRootReadmeUrl("/docs/README")).toBe(true);
  expect(isRootReadmeUrl("/docs/README#documentation")).toBe(true);
  expect(isRootReadmeUrl("/docs/adr/README")).toBe(false);
  expect(isRootReadmeUrl("/docs/api#node")).toBe(false);
});
