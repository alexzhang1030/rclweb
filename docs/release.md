# Release

`rcl-web` publishes to npm with [trusted publishing](https://docs.npmjs.com/trusted-publishers)
(OIDC). `rclweb` / `rclwebd` publish to crates.io. The Jazzy and Humble
`rclwebd` runtime images publish to GHCR
([ADR 0018](./adr/0018-prebuilt-gateway-distribution.md)). The
`rclwebd` apt repo (package name `rclwebd`, never `ros-*-rclwebd`)
publishes from existing GitHub Release binaries via
`publish-apt.yml` / `apt-v<version>`
([ADR 0019](./adr/0019-own-apt-repository.md)).
There is no `NPM_TOKEN` or `CARGO_REGISTRY_TOKEN` in GitHub secrets
after the crates.io bootstrap below; images use the workflow
`GITHUB_TOKEN` (`packages: write` on that job only). Apt signing uses
`RCLWEB_APT_GPG_PRIVATE_KEY` (the apt exception to OIDC).

npm's trusted-publisher identity is the workflow **filename**
`release.yml` (not the path). Do not put a GitHub `environment:` on the
npm job, and leave **Environment** blank on npmjs.com. Do not rename
`release.yml` without updating npm and crates.io.

## One-time setup (human)

`rcl-web` already exists on npm, so the trusted publisher can be saved
as soon as this workflow is on the default branch.

1. On [npmjs.com/package/rcl-web](https://www.npmjs.com/package/rcl-web)
   → **Settings → Trusted Publisher** → GitHub Actions:
   - Organization or user: `alexzhang1030`
   - Repository: `rclweb`
   - Workflow filename: `release.yml` (filename only)
   - Environment: *leave blank*
   - Allowed action: `npm publish`
2. Or from a logged-in npm CLI (2FA):

   ```bash
   npm trust github rcl-web --file release.yml --repo alexzhang1030/rclweb --allow-publish
   ```

3. First crates.io publish (OIDC cannot create a crate that does not exist).
   If cargo says `crates-io is replaced with remote registry`, pass
   `--registry crates-io` (a local `[source.crates-io] replace-with`
   mirror). `rclwebd` cannot pack until the **sparse index** lists
   `rclweb` — cargo's “waiting for … to be available” after the first
   upload is not enough.

   ```bash
   just build
   bun run scripts/cargo-publish.ts --stage
   cargo login --registry crates-io
   cargo publish -p rclweb --locked --registry crates-io
   until curl -fsS https://index.crates.io/rc/lw/rclweb | grep -q '"vers":"0.0.1"'; do sleep 10; done
   cargo publish -p rclwebd --locked --registry crates-io
   ```

   If `rclwebd` still says `no matching package named rclweb`, the
   replace-with mirror does not have the new crate yet. Comment out
   `[source.crates-io] replace-with` in `~/.cargo/config.toml` for that
   one command, then put it back.

4. On [crates.io](https://crates.io) → each of `rclweb` and `rclwebd` →
   **Settings → Trusted Publishing**:
   - Repository: `alexzhang1030/rclweb`
   - Workflow filename: `release.yml`
   - Environment: *leave blank*

5. Apt archive key ([ADR 0019](./adr/0019-own-apt-repository.md)). Generate
   on a machine you trust. Do not commit the secret.

   ```bash
   bun run scripts/apt-archive-key.ts --generate --out-dir /tmp/rclweb-apt-key --write-secret
   ```

   Add `/tmp/rclweb-apt-key/rclweb-archive-key.secret.asc` as the
   repository secret `RCLWEB_APT_GPG_PRIVATE_KEY`. Optional:
   `RCLWEB_APT_GPG_PASSPHRASE` if you protected the key. Enable GitHub
   Pages on branch `gh-pages` (site root). Until the secret exists,
   `publish-apt` still uploads `rclwebd_*.deb` for `dpkg -i`.

## Publish a version

Bump the version in the tree (`typescript/package.json` and
`[workspace.package].version` plus the `rclweb` workspace dep version),
merge to `main`, then either:

```bash
git tag v0.0.6
git push origin v0.0.6
```

or run **Actions → release → Run workflow** (`npm` / `crates` /
`images` checkboxes; dispatched image jobs resolve the version from
`Cargo.toml`).

To publish **apt** from binaries already on the GitHub Release (no
image rebuild), push `apt-v<version>` or run
**Actions → publish-apt → Run workflow**:

```bash
git tag apt-v0.0.6 && git push origin apt-v0.0.6
```

To republish **only images** of an existing version (for example after
a workflow fix), push `rebuild-v<version>`; the npm and crates jobs
skip (the registries refuse duplicates anyway; GHCR tags move):

```bash
git tag rebuild-v0.0.6 && git push origin rebuild-v0.0.6
```

The npm job builds with Bun, then publishes with the official npm CLI
(`npm publish` from `typescript/`). The CLI detects the GitHub OIDC
token; provenance is automatic — do not pass `--provenance`. Do not set
`NODE_AUTH_TOKEN`. The job refuses a version already on the registry.
The crates job stages `LICENSE` / `NOTICE`, publishes `rclweb`, then
retries `rclwebd` until crates.io's index sees the new core crate.

The images job builds the J-FT and H-FT images from the committed
Dockerfiles per architecture (amd64 and arm64, each on a native
runner) and pushes
`ghcr.io/alexzhang1030/rclwebd:<version>-<row>-<arch>`; the manifests
job then combines them into `jazzy` / `humble` / `latest`
([deploy](./deploy.md#prebuilt-image)).

`publish-apt.yml` wraps Release binaries into `rclwebd_*~$suite_*.deb`,
signs `InRelease` when `RCLWEB_APT_GPG_PRIVATE_KEY` is set, and
force-pushes `gh-pages` ([deploy](./deploy.md#apt)). That secret is
the apt exception to OIDC. Leave it unset and the Release still gets
the `.deb` files.

This cut: `0.0.6` everywhere — npm and crate versions stay aligned so
the tag-named images match the crate version. This cut ships
`npx rcl-web gen` on the published `rcl-web` bin. Independent
versioning (ADR 0003) still stands as policy. Earlier cuts: `0.0.5`
aligned; `rcl-web@0.0.4` with crates `0.0.3`. First OIDC automatic
publish landed 2026-08-13 from tag `v0.0.3` on `e8365a8`
([release run](https://github.com/alexzhang1030/rclweb/actions/runs/31713576156)).
Do not retag a version already on the registry.

## Local checks

```bash
just npm-pack-check
just cargo-publish-check
```

`just check` runs both. Do not commit the staged `typescript/LICENSE` /
`typescript/NOTICE` copies. `rclweb/LICENSE`, `rclweb/NOTICE`,
`rclwebd/LICENSE`, and `rclwebd/NOTICE` are committed and must match the
root files (`just cargo-publish-check`).
