# Docs site renderer

Current conclusion: the rendered site is **Fumadocs UI on TanStack Start**
([ADR 0020](../../docs/adr/0020-fumadocs-tanstack-docs-site.md)). Markdown
source stays in [`docs/`](../../docs/README.md). The private package is
`@rclweb/website` at `website/`. `just website` / `just website-check`.
The site is a product. Hosting is the Vercel project
`https://rclweb-website.vercel.app` (Root Directory `website`).

## What already exists

Customer-facing docs are already written: [how to](../../docs/typescript.md)
and the [API reference](../../docs/api.md), indexed from
[`docs/README.md`](../../docs/README.md) (customer first, internals
second). [`scripts/docs-check.ts`](../../scripts/docs-check.ts) is the
gate: GitHub-style heading slugs, local links, and enrollment from
those two README maps. PCR stays in [`.agents/docs/`](./README.md) and
is not the product site.

The landing graph is the core path: `rcl-web` → `Node` → R2WP →
`rclwebd` → ROS 2. Customer nav is how-to, API, deploy. Protocol and
the other internals stay in the Internals folder.

## Human comparison

VitePress is less good-looking than Fumadocs. Then: use the Fumadocs +
TanStack stack. No further rationale.

## Constraints that bind the site

- **Source stays in `docs/`.** `defineDocs({ dir })` points at that
  tree. Do not copy Markdown into `website/content`. Do not convert
  customer pages to MDX unless a page actually needs a component.
- **Do not rewrite the tree for frontmatter.** Page titles come from
  the leading ATX heading. Do not render a second `DocsTitle`.
- **Slug algorithm is GitHub's.** Heading `id`s use
  `githubHeadingSlug` / `allocateHeadingSlug` from
  [`scripts/github-slug.ts`](../../scripts/github-slug.ts) (same helpers
  `docs-check` uses). Do not import `docs-check.ts` into the client.
- **Customer nav first.** How to, API, deploy. Internals are a folder.
  The GitHub `docs/README.md` index is not a site page (`/docs`
  redirects to how-to). PCR stays off the public nav.
  Links that leave `docs/` become GitHub blob URLs.
- **Keep the site off the published `rcl-web` graph.** Direct npm deps
  stay on the OSI-permissive allowlist.
- **Nitro must emit the `vercel` preset** on Vercel, and
  `vercel.json` lives in `website/` because Root Directory is
  `website`
  ([gotchas](./gotchas.md#vercel-will-not-start-the-node-server-preset)).
- **Landing is chrome.** The homepage is a node field: decorative
  dots, five live nodes on the Browser → R2WP → rclwebd → ROS 2
  path from [architecture](../../docs/architecture.md), and a hover
  chip. It is not a docs index. The field SVG must shrink in the
  `body` flex column
  ([gotchas](./gotchas.md#docs-landing-svg-must-min-width-0-in-the-flex-column)).
- **Mark.** The site mark is a viewport, a node inside it, and a wire
  to a smaller edge node. Not the ROS turtle. SVG in
  [`website/src/components/logo.tsx`](../../website/src/components/logo.tsx).
