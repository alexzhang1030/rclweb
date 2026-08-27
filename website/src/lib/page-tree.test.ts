import { expect, test } from "bun:test";
import type { Root } from "fumadocs-core/page-tree";
import { arrangeDocsTree } from "./page-tree";

test("puts customer pages first and hides readme", () => {
  const tree: Root = {
    name: "Docs",
    children: [
      { type: "page", name: "Documentation", url: "/docs" },
      { type: "page", name: "Readme file", url: "/docs/README" },
      { type: "page", name: "Deploy", url: "/docs/deploy" },
      { type: "page", name: "Architecture", url: "/docs/architecture" },
      { type: "page", name: "How to", url: "/docs/typescript" },
      { type: "page", name: "API", url: "/docs/api" },
    ],
  };
  const arranged = arrangeDocsTree(tree);
  const names = arranged.children.map((node) => String(node.name));
  expect(names[0]).toBe("How to");
  expect(names[1]).toBe("API");
  expect(names[2]).toBe("Deploy");
  expect(names[3]).toBe("Internals");
  const internals = arranged.children[3];
  expect(internals.type).toBe("folder");
  if (internals.type === "folder") {
    expect(internals.children.map((node) => String(node.name))).toEqual(["Architecture"]);
  }
});
