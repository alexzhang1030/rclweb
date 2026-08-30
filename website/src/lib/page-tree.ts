import type { Item, Node, Root } from "fumadocs-core/page-tree";

const CUSTOMER_SLUGS = ["typescript", "api", "deploy"] as const;

function pageSlug(node: Item): string | undefined {
  if (node.type !== "page" || !node.url) return undefined;
  if (node.url === "/docs" || node.url === "/docs/") return "";
  const prefix = "/docs/";
  if (!node.url.startsWith(prefix)) return undefined;
  return node.url.slice(prefix.length).replace(/\/$/, "");
}

function hiddenFromNav(slug: string | undefined): boolean {
  if (slug === undefined) return false;
  return slug === "" || slug.toLowerCase() === "readme";
}

function flattenPages(nodes: Node[]): Item[] {
  const out: Item[] = [];
  for (const node of nodes) {
    if (node.type === "page") out.push(node);
    if (node.type === "folder") out.push(...flattenPages(node.children));
  }
  return out;
}

/** Customer pages first, then internals. Drop the GitHub README index. */
export function arrangeDocsTree(tree: Root): Root {
  const pages = flattenPages(tree.children).filter((page) => {
    const slug = pageSlug(page);
    return !hiddenFromNav(slug);
  });
  const bySlug = new Map(pages.map((page) => [pageSlug(page), page]));
  const customer: Node[] = [];
  for (const slug of CUSTOMER_SLUGS) {
    const page = bySlug.get(slug);
    if (page) customer.push(page);
  }
  const used = new Set<string>(CUSTOMER_SLUGS);
  const internals = pages.filter((page) => {
    const slug = pageSlug(page);
    return slug !== undefined && !used.has(slug);
  });
  const children: Node[] = [...customer];
  if (internals.length > 0) {
    children.push({
      type: "folder",
      name: "Internals",
      children: internals,
    });
  }
  return { ...tree, children };
}
