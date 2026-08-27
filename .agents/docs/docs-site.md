# Docs site renderer

Current conclusion: if this repository grows a rendered documentation
site, **default to Fumadocs**. Keep [`docs/`](../../docs/README.md) as
the Markdown source. Do not start an ADR until a human names the
renderer. This page is analysis plus one human comparison, not a stack
pin.

## What already exists

Customer-facing docs are already written: [how to](../../docs/typescript.md)
and the [API reference](../../docs/api.md), indexed from
[`docs/README.md`](../../docs/README.md) (customer first, internals
second). [`scripts/docs-check.ts`](../../scripts/docs-check.ts) is the
gate: GitHub-style heading slugs, local links, and enrollment from
those two README maps. PCR stays in [`.agents/docs/`](./README.md) and
is not the product site.

GitHub Pages is already live for apt
([ADR 0019](../../docs/adr/0019-own-apt-repository.md)):
`https://alexzhang1030.github.io/rclweb/` with the archive under
`/apt`. [`scripts/push-apt-gh-pages.sh`](../../scripts/push-apt-gh-pages.sh)
force-pushes an orphan `gh-pages` that contains only the apt landing
`index.html`, `apt/`, the public keyring, `enable-apt.sh`, and
`.nojekyll`. A second publisher that force-pushes the same branch
wipes the archive; an apt publish today would wipe a docs site.

## Human comparison

VitePress is less good-looking than Fumadocs. That is the reason
given. No further rationale.

That comparison is why the default is Fumadocs, not VitePress. The
earlier "Next.js is overkill" rejection was engineering taste, not a
human ruling, and it does not outrank looks.

## Recommendation

| Choice | Use when |
|---|---|
| **Fumadocs** (default) | A rendered site should look like current product docs (Fumadocs UI), not like the VitePress default chrome. MIT. `defineDocs` / `@fumadocs/local-md` can set `dir` at the existing `docs/` tree. Static export (`output: 'export'`) is documented for GitHub Pages. |
| **VitePress** | Looks are accepted as second to a smaller JS host. Vite is already named in [ADR 0002](../../docs/adr/0002-use-bun-for-javascript-tooling.md). `srcDir` eats `docs/` with no frontmatter. |
| **Starlight** (Astro) | First-class CN/EN or zero JS by default, and Fumadocs's Next.js (or TanStack / React Router) host is the objection. Content collections still want their own tree plus title frontmatter. |
| **Stay on GitHub Markdown** | No public hostname or in-site search is required yet. |

Fumadocs wins on the stated criterion: appearance. The customer
surface is still how-to + API + deploy. React and the Fumadocs host
stay inside a private site package and never enter `rcl-web`.

## Rejected for this repo

| Option | Why not |
|---|---|
| Docusaurus | Versioning and the React plugin surface are the reason to pay for it. This cut does not version docs. Heavier than the content, and not the look that was named. |
| Sphinx / MkDocs | Python. The stack keeps the language count at what the platform forces ([technology stack](./technology-stack.md)). ROS 2 docs use Sphinx; that is not a reason to add a third language here. |
| mdBook | Book metaphor. Customer docs are `Node` / topics / services / actions, not a Rust book. MPL-2.0 is not on the [license allowlist](../../docs/licensing.md) if it entered the Cargo graph. |
| TypeDoc as the primary API page | [`docs/api.md`](../../docs/api.md) is the hand-written rclcpp-shaped contract. Generated rustdoc on docs.rs stays for the crates. A TypeDoc appendix can wait. |
| Mintlify / GitBook / other hosted CMSes | Lock-in. Not a workspace package the inventory can check. |

Nextra is the older Next.js docs theme. It was not the named look.

## Constraints that bind a later implementation

- **Source stays in `docs/`.** A site package (`website/` or similar)
  configures the renderer. Point `dir` at that tree. Do not copy
  Markdown into `content/docs`. Do not convert the customer pages to
  MDX unless a page actually needs a component.
- **Do not rewrite the tree for frontmatter.** Fumadocs UI treats
  frontmatter `title` as the page `h1`; this repo's pages already lead
  with an ATX `#` heading (`# How to use rcl-web`, `# API reference`).
  Derive title from that heading (schema default / loader), or the
  first H1 will double-render. Sidebar labels can live in site config
  or `meta.json` next to the site package, not as YAML on every page.
- **Slug algorithm is GitHub's.** `docs-check` already owns
  `githubHeadingSlug`. Fumadocs sanitizes heading ids; set the same
  function. One algorithm, or in-page `#` links rot between GitHub
  and the site.
- **Customer nav first.** How to, API, `npx rcl-web gen`, deploy
  (`apt` / `ros2 run` / images). Internals, protocol, and ADRs are a
  second group. PCR and `tasks/` stay off the public nav.
- **Keep the site off the published `rcl-web` graph.** Private
  workspace package or root-only scripts. Do not add Next.js /
  Fumadocs to `typescript/package.json`. Run
  `just license-inventory-check` before landing the lockfile —
  workspace npm deps follow the same OSI-permissive allowlist.
- **Host tax is Next.js (usual) or TanStack / React Router.** That is
  the cost of the named look. Static export still needs
  `images.unoptimized`, a `basePath` of `/rclweb` on project Pages,
  and `.nojekyll` so Jekyll does not drop `_next/`. Apt already drops
  `.nojekyll` for `InRelease`.
- **Pages coexistence.** Same origin
  (`alexzhang1030.github.io/rclweb`) needs one publisher that merges
  the static site with `/apt` and stops the orphan force-push from
  deleting either tree. Or keep Pages for apt only and host the site
  elsewhere. Hosting is a separate pick from the renderer.
- **DESIGN.md is Studio**, not the docs chrome. Do not wait on the
  studio visual system to ship a site.

## What would settle this

A human names Fumadocs, VitePress, Starlight, or "no site yet". That
is when an ADR (or a technology-stack row) is appropriate. Silence
leaves Markdown-on-GitHub as the customer path.
