# rclweb docs site

Fumadocs UI on TanStack Start. Markdown source is the repository
[`docs/`](../docs/README.md) tree, not a copy under this package.

```bash
just website
```

Build check: `just website-check`.

Vercel Root Directory is `website`. `website/vercel.json` installs
from the repo root and runs `bun run build`. `VERCEL=1` selects
Nitro's `vercel` preset. Do not pin `node-server`, and do not copy
`website/.vercel/output` from a repo-root command — cwd is already
`website/`.
