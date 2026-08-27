# rclweb docs site

Fumadocs UI on TanStack Start. Markdown source is the repository
[`docs/`](../docs/README.md) tree, not a copy under this package.

```bash
just website
```

Build check: `just website-check`.

Vercel: Root Directory `website`, or the repo-root `vercel.json`.
`VERCEL=1` selects Nitro's `vercel` preset. Do not pin `node-server`
on that host — Vercel will not start `.output/server` and every path
is a platform 404.
