# Docs site renderer

Current conclusion: if this repository grows a rendered documentation
site, **default to VitePress**. Keep [`docs/`](../../docs/README.md) as
the Markdown source. Do not start an ADR until a human picks a
renderer. This page is the analysis from the 2026-08-27 question, not
a stack ruling.

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

## Recommendation

| Choice | Use when |
|---|---|
| **VitePress** (default) | Render the existing `docs/` tree as a library site (how-to + API + deploy). Vite is already named in [ADR 0002](../../docs/adr/0002-use-bun-for-javascript-tooling.md). `srcDir` can point at `docs/` without moving files or requiring frontmatter. MIT. Local MiniSearch. No built-in versioning — acceptable at `0.0.6`. |
| **Starlight** (Astro) | The human wants a more product-shaped site, first-class CN/EN, or zero JS by default. MIT. Cost: content collections want `src/content/docs/` plus title frontmatter, which fights the enrolled `docs/` tree. Astro is a new JS toolchain not named in ADR 0002. |
| **Stay on GitHub Markdown** | No public hostname or in-site search is required yet. The content and the `docs-check` gate already exist. |

VitePress wins here because the load-bearing constraint is **do not
relocate or rewrite `docs/`**. The customer surface is a TypeScript
library, which is VitePress's usual shape. Vue stays inside a private
site package and never enters `rcl-web`.

## Rejected for this repo

| Option | Why not |
|---|---|
| Docusaurus | Versioning and the React plugin surface are the reason to pay for it. This cut does not version docs. Heavier than the content. |
| Sphinx / MkDocs | Python. The stack keeps the language count at what the platform forces ([technology stack](./technology-stack.md)). ROS 2 docs use Sphinx; that is not a reason to add a third language here. |
| mdBook | Book metaphor. Customer docs are `Node` / topics / services / actions, not a Rust book. MPL-2.0 is not on the [license allowlist](../../docs/licensing.md) if it entered the Cargo graph. |
| TypeDoc as the primary API page | [`docs/api.md`](../../docs/api.md) is the hand-written rclcpp-shaped contract. Generated rustdoc on docs.rs stays for the crates. A TypeDoc appendix can wait. |
| Nextra / Fumadocs | Next.js. Overkill, and Studio is not in the tree yet. |
| Mintlify / GitBook / other hosted CMSes | Lock-in. Not a workspace package the inventory can check. |

## Constraints that bind a later implementation

- **Source stays in `docs/`.** A site package (`website/` or similar)
  configures the renderer. Do not copy Markdown into `src/content`.
  Do not add VitePress config under `docs/` if that enrolls junk in
  `docs-check`.
- **Slug algorithm is GitHub's.** `docs-check` already owns
  `githubHeadingSlug`. Set the site's `markdown.anchor.slugify` to the
  same function (VitePress defaults differ on punctuation). One
  algorithm, or in-page `#` links rot between GitHub and the site.
- **Customer nav first.** How to, API, `npx rcl-web gen`, deploy
  (`apt` / `ros2 run` / images). Internals, protocol, and ADRs are a
  second group. PCR and `tasks/` stay off the public nav.
- **Keep the site off the published `rcl-web` graph.** Private
  workspace package or root-only scripts. Do not add the renderer to
  `typescript/package.json`. Run `just license-inventory-check` before
  landing the lockfile — workspace npm deps follow the same
  OSI-permissive allowlist.
- **Pages coexistence.** Same origin
  (`alexzhang1030.github.io/rclweb`, VitePress `base: '/rclweb/'`)
  needs one publisher that merges the static site with `/apt` and
  stops the orphan force-push from deleting either tree. Or keep Pages
  for apt only and host the site elsewhere. Hosting is a separate
  pick from the renderer.
- **DESIGN.md is Studio**, not the docs chrome. Do not wait on the
  studio visual system to ship a site.

## What would settle this

A human names VitePress, Starlight, or "no site yet". That is when an
ADR (or a technology-stack row) is appropriate. Silence leaves
Markdown-on-GitHub as the customer path.
