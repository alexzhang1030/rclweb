const GITHUB_BLOB = "https://github.com/alexzhang1030/rclweb/blob/main";

function splitHref(href: string): { pathPart: string; fragment: string } {
  const hash = href.indexOf("#");
  if (hash === -1) return { pathPart: href, fragment: "" };
  return { pathPart: href.slice(0, hash), fragment: href.slice(hash) };
}

/** Rewrite repo-relative Markdown hrefs for the rendered site. */
export function rewriteDocsHref(href: string | undefined, pageFile: string): string | undefined {
  if (!href || href.startsWith("mailto:") || href.startsWith("#")) return href;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) return href;

  const { pathPart, fragment } = splitHref(href);
  if (!pathPart || pathPart === ".") return href;

  const fromDir = pageFile.includes("/") ? pageFile.slice(0, pageFile.lastIndexOf("/")) : "";
  const parts = [...fromDir.split("/").filter(Boolean), ...pathPart.split("/")];
  const resolved: string[] = [];
  let outside = 0;
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      if (resolved.length > 0) resolved.pop();
      else outside += 1;
    } else {
      resolved.push(part);
    }
  }

  if (outside === 0) {
    const docsRel = resolved.join("/");
    if (docsRel.toLowerCase().endsWith(".md")) {
      const withoutExt = docsRel.slice(0, -3);
      if (/^README$/i.test(withoutExt)) return `/docs/typescript${fragment}`;
      return `/docs/${withoutExt}${fragment}`;
    }
    return `${GITHUB_BLOB}/docs/${docsRel}${fragment}`;
  }

  return `${GITHUB_BLOB}/${resolved.join("/")}${fragment}`;
}
