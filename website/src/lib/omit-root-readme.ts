/** GitHub `docs/README.md` is the map, not a site page. Nested README files stay. */
export function isRootReadmeFile(filePath: string): boolean {
  return /^(README|readme)\.mdx?$/.test(filePath.replace(/\\/g, "/"));
}

export function isRootReadmeUrl(url: string): boolean {
  const path = url.split("#")[0].replace(/\/$/, "");
  return path === "/docs/README" || path === "/docs/readme";
}
