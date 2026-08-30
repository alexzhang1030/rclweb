# 0020: Fumadocs on TanStack Start for the docs site

## Status

Accepted

## Date

2026-08-27

## Context

Customer docs already live as GitHub Markdown under [`docs/`](../README.md).
A rendered site was still open. The first pass defaulted to VitePress
because it can `srcDir` the existing tree. The owner compared looks:
VitePress is worse than Fumadocs. They then named the host:
Fumadocs + TanStack.

GitHub Pages is already the apt origin
([ADR 0019](./0019-own-apt-repository.md)). That publisher force-pushes
an orphan `gh-pages`. This ADR does not change that publisher.

## Decision

- The docs site is Fumadocs UI on TanStack Start.
- The private workspace package is `@rclweb/website` at `website/`.
- Markdown source stays in `docs/`. Do not copy pages into
  `website/content` and do not convert customer pages to MDX for
  chrome. Do not add frontmatter to the `docs/` tree for titles.
- Heading anchors use the same GitHub slug algorithm as
  [`scripts/docs-check.ts`](../../scripts/docs-check.ts).
- The site is not on the published `rcl-web` graph.
- Hosting on `gh-pages` is a follow-up. Apt publish must not wipe a
  future site, and a site publish must not wipe `/apt`.

## Rationale

The owner named Fumadocs + TanStack. The look comparison against
VitePress is the reason Fumadocs won. No further rationale was given
for TanStack over Next.js.

## Consequences

- `just website` is the local dev server. `just website-check` is in
  `just check`.
- Direct workspace npm deps stay on the OSI-permissive allowlist
  ([licensing](../licensing.md)).
- Customer nav is how-to, API, deploy. Internals are a second group.
  PCR and `tasks/` stay off the public nav.
- Vue/VitePress and Next.js are not the site host.

## Revisit triggers

- The owner names a different renderer or host.
- Heading slugs diverge from `docs-check`.
- A required Fumadocs or TanStack Start release is not OSI-permissive.
- Pages coexistence with apt cannot be merged without a separate host.

## Source

Owner 2026-08-27: Fumadocs looks better than VitePress; use the
Fumadocs + TanStack stack. Markdown stays in `docs/`. The site
package is `website/`.
