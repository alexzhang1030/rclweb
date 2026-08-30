/** First ATX heading, or the file stem. Do not add YAML to docs/. */
export function titleFromMarkdown(source: string, filePath: string): string {
  const heading = source.match(/^#\s+(.+)$/m);
  if (heading) {
    return heading[1]
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .trim();
  }
  const base = filePath.split("/").pop() ?? filePath;
  return base.replace(/\.mdx?$/i, "");
}
