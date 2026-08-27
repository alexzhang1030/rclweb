/** Normalize heading text to a GitHub-style base slug (no uniqueness). */
export function githubHeadingSlug(text: string): string {
  const plain = text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/\[([^\]]+)\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_~]+/g, "")
    .trim();
  return plain
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s-]/gu, "")
    .trim()
    .replace(/[\s]+/g, "-");
}

/**
 * Allocate a unique slug given already-used slugs (GitHub behavior).
 * "# Foo", "# Foo-1", "# Foo" => foo, foo-1, foo-2
 */
export function allocateHeadingSlug(base: string, used: Set<string>): string {
  if (!base) return base;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 1;
  while (used.has(`${base}-${n}`)) n += 1;
  const slug = `${base}-${n}`;
  used.add(slug);
  return slug;
}
