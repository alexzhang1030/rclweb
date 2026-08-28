# Deploying `rclwebd`

Operator profile for the runtime images (all six support rows) and process
operations. The gateway remains the trust boundary ([security](./security.md));
this page covers how to run it.

## Prebuilt artifacts

The release workflow publishes every support row to GHCR and attaches
prebuilt binaries to the GitHub Release
([ADR 0018](./adr/0018-prebuilt-gateway-distribution.md), [release](./release.md)).
No clone or toolchain required:

```bash
docker run --rm --network host ghcr.io/alexzhang1030/rclwebd:jazzy
```

| Tag | Row |
|---|---|
| `<version>-j-ft` … `<version>-h-zn` | Pinned version, one tag per row |
| `j-ft` / `j-cy` / `j-zn` / `h-ft` / `h-cy` / `h-zn` | Rolling latest per row |
| `jazzy` | Rolling J-FT |
| `humble` | Rolling H-FT |
| `latest` | Rolling J-FT |

Every tag is a multi-arch manifest (`linux/amd64` + `linux/arm64`, both
built on native runners); per-arch tags (`<version>-<row>-<arch>`) also
exist for pinning one platform. Zenoh-row containers still need the
router companion described under [Artifact](#artifact).

Host binaries (`rclwebd-<version>-{jazzy,humble}-{amd64,arm64}` plus
`.sha256`) are built in the same digest-pinned builder stages and run
against a sourced matching prefix. Ubuntu hosts can
[`apt install rclwebd`](#apt). The curl installer writes a thin ament
overlay so `ros2 run` works without apt
([ADR 0018](./adr/0018-prebuilt-gateway-distribution.md)):

```bash
curl -fsSL https://raw.githubusercontent.com/alexzhang1030/rclweb/main/scripts/install-rclwebd.sh | bash
```

Host units for unattended machines: [systemd](#systemd). Cluster
units: [Kubernetes](#kubernetes).

## apt

Ubuntu 24.04 (Jazzy / `noble`) and 22.04 (Humble / `jammy`). This is
this project's repo, not bloom and not `packages.ros.org`
([ADR 0019](./adr/0019-own-apt-repository.md)). The package name is
`rclwebd`. The browser page is
[alexzhang1030.github.io/rclweb](https://alexzhang1030.github.io/rclweb/).
`apt` uses `…/rclweb/apt` (files under `dists/`).

```bash
curl -fsSL https://alexzhang1030.github.io/rclweb/enable-apt.sh | sudo bash
source /opt/ros/$ROS_DISTRO/setup.bash
source /opt/rclwebd/local_setup.bash
ros2 run rclwebd rclwebd
```

That script fetches the public keyring (not the signing secret) and
writes a `Signed-By` source, then `apt install rclwebd`. Offline:
`dpkg -i rclweb-apt-source_*_all.deb` from the Release, or
`dpkg -i rclwebd_*~noble_amd64.deb` / `~jammy` without a source.

The unit is installed and **not** enabled. `systemctl enable --now
rclwebd` after you edit `/etc/rclwebd/rclwebd.env`. Do not
`apt-key add`.

## Artifact

One support row per process ([ADR 0008](./adr/0008-one-adapter-row-per-gateway-process.md)).
The Fast DDS reference rows have dedicated images; the Cyclone DDS and Zenoh
rows build from the same two Dockerfiles with the row identity baked in:

```bash
just image-rclwebd          # docker build -t rclwebd:j-ft
just gateway                # host-network compose (J-FT)
just gateway-wt             # same + intranet WebTransport (rebuilds)
just image-rclwebd-h-ft     # docker build -t rclwebd:h-ft (regenerates FFI)
just gateway-h-ft           # host-network compose (H-FT)
just gateway-wt-h-ft        # H-FT + intranet WebTransport (rebuilds)
just image-rclwebd-row j-cy # rclwebd:j-cy (also j-zn, h-cy, h-zn)
just gateway-row j-zn       # host-network compose; zn rows start rmw_zenohd
```

All images are multi-stage: builder compiles `rclwebd --features ros,webtransport`, runtime
is the digest-pinned ROS base plus the binary, running as uid `10001`.
`HEALTHCHECK` probes `GET /readyz`. Extra ROS interface packages must be
installed in the image or mounted into `ROS_PREFIX` — typesupport is dlopen,
not link-time. Remaining-row images install the row's RMW apt package in the
runtime stage (`RMW_APT_PACKAGES` build arg) and bake `RCLWEBD_SUPPORT_ROW` /
`RMW_IMPLEMENTATION` (`SUPPORT_ROW` / `RMW_IMPLEMENTATION` build args); the
adapter probe refuses start-up when the pair is inconsistent.

The Humble builders regenerate vendored rcl bindings against Humble headers
before linking. Do not run an `H-*` binary against a Jazzy prefix (or the
reverse).

The entrypoint sources `$ROS_PREFIX/setup.bash` (`J-*` default
`/opt/ros/jazzy`, `H-*` `/opt/ros/humble`).

**Zenoh rows** (`J-ZN` / `H-ZN`) need a running `rmw_zenohd` router reachable
from the gateway (default `tcp/localhost:7447`; discovery is router gossip).
[`docker/compose.r4-02-gateway-rmw.yml`](../docker/compose.r4-02-gateway-rmw.yml)
starts a router companion from the same image and sets
`ZENOH_ROUTER_CHECK_ATTEMPTS` so the gateway retries while the router boots.
For an existing robot router, point the gateway at it with the standard
`rmw_zenoh` configuration (`ZENOH_CONFIG_OVERRIDE` / config URI) instead of
running the companion.

## Listen address

| Context | Default |
|---|---|
| Host binary | `RCLWEBD_BIND=127.0.0.1:8794` |
| Container entrypoint | `0.0.0.0:8794` |

Do not treat a container publish of 8794 as TLS. Put a reverse proxy in front
for production WSS / HTTPS. Local-dev WebTransport TLS stays opt-in
([ADR 0011](./adr/0011-local-dev-webtransport-tls.md)) and must not be the
default on this image. Images compile the accept loop; they do not enable it.

## Intranet WebTransport

Robot LAN / lab path. Not production PKI. Chromium only.

On the robot (host-network compose already shares UDP):

```bash
just gateway-wt
# or, on any image built from these Dockerfiles:
#   RCLWEBD_OFFER_WEBTRANSPORT=1
```

That one flag implies local-dev TLS, CORS `*` when `RCLWEBD_CORS_ORIGINS` is
unset, and a WebTransport UDP bind on the HTTP bind host at port 4433
(`0.0.0.0:8794` → `0.0.0.0:4433`). Set `RCLWEBD_WT_BIND` only to override.

On the laptop, open the page at `http://127.0.0.1` or `http://localhost`
(those are secure contexts). Type the robot host — no CA, no transport
flag. That is the QUIC path:

```ts
await init("192.168.1.10");
```

The package uses WebTransport, fetches
`http://192.168.1.10:8794/local-dev/tls` for `serverCertificateHashes`
(default WT `4433` maps to HTTP `8794`), and never asks the operator to
install a certificate. A page opened via `http://192.168.x.x` is not a
secure context, so the same `init` throws instead of quietly using TCP.
Pass `{ transport: "websocket" }` only to skip QUIC. Do not put the page
on self-signed HTTPS — Chrome's interstitial is more trouble than
opening localhost. Production PKI stays the [open](../tasks/plan.md)
follow-up. UDP 4433 must be reachable from the laptop.

Remaining-row compose services are not named `rclwebd`; set
`RCLWEBD_OFFER_WEBTRANSPORT=1` on that service instead of the J-FT/H-FT
overlay.

## Intranet certificates

Two HTTPS surfaces. They do not share a trust API.

**WebTransport** already has a cert. `new WebTransport("https://…")`
requires TLS; the intranet path does **not** buy a public certificate and
does **not** install mkcert. `RCLWEBD_OFFER_WEBTRANSPORT=1` auto-mints an
ECDSA P-256 self-signed cert (validity ≤13 days, default 7, remint when
less than 24h remain). The SDK fetches `GET /local-dev/tls` over plain HTTP and
passes the SHA-256 SPKI hash into `serverCertificateHashes`. Chromium
pins that exact key for the QUIC handshake. SANs are `localhost` /
`127.0.0.1` / `::1`; the hash check does not need the robot LAN IP in the
SAN. The private key never leaves the gateway process
([ADR 0011](./adr/0011-local-dev-webtransport-tls.md)). This is not
production PKI.

**The page** cannot use that hash. `serverCertificateHashes` is a
`WebTransport` constructor option only — it cannot trust a document you
open in the address bar.

| Page origin | What the operator does |
|---|---|
| `http://127.0.0.1` / `http://localhost` | Nothing. Secure context; `init("192.168.1.10")` uses WebTransport (QUIC). |
| `http://<lan-ip>/…` | Open the page on localhost instead. Not a secure context; `init` throws. `{ transport: "websocket" }` skips QUIC. |
| `https://<lan-ip>/…` | Do not. Needs a CA the browser already trusts (mkcert / internal CA / reverse proxy). Not this recipe. |

Sharing the auto-minted WT cert as the page cert does not skip Chrome's
interstitial. This project does not ask operators to install mkcert or
click through a warning: keep the page on localhost so QUIC works. A
runtime without `WebTransport` still falls back to WebSocket.
Production WSS / HTTPS stays the [open](../tasks/plan.md) follow-up.

## Identity and row

Set `RCLWEBD_GATEWAY_INSTANCE_ID` to a stable deployment id if the instance
should survive ordinary restart. Unset keeps a random id (a replacement
instance every process start). Pair `RCLWEBD_SUPPORT_ROW` with the matching
prefix (`J-*` ↔ `/opt/ros/jazzy`, `H-*` ↔ `/opt/ros/humble`) and keep
`RMW_IMPLEMENTATION` on the row's RMW — the adapter probe fails start-up on a
mismatch. When `RCLWEBD_SUPPORT_ROW` is unset (host binaries; the container
entrypoint bakes the row), the process derives it from the sourced
environment: `ROS_DISTRO` plus `RMW_IMPLEMENTATION` (Fast DDS default),
falling back to J-FT without a sourced environment
([ADR 0018](./adr/0018-prebuilt-gateway-distribution.md)). `ROS_DOMAIN_ID`
selects the domain.

Authenticate stays **off**. Do not set `RCLWEBD_AUTH_MODE=oidc` until a tenant is named ([security](./security.md), [open work](../tasks/plan.md)).

Channel ACLs stay **off** unless `RCLWEBD_ACL_MODE=enforce` plus `RCLWEBD_ACL` or `RCLWEBD_ACL_PATH`. The reference matrix is [acl-reference.json](./acl-reference.json).

Audit stays on **stderr** unless `RCLWEBD_AUDIT_SINK=file` plus `RCLWEBD_AUDIT_PATH`. The file is hash-chained JSONL ([security](./security.md#audit)); `/configz` reports the path, last hash, and integrity, not event bodies. Rotate at `RCLWEBD_AUDIT_MAX_BYTES` (default 8 MiB) and keep `RCLWEBD_AUDIT_RETAIN` copies (default 3). A broken live file fails start (`RCLWEBD_AUDIT_ON_CORRUPT=fail`) or is moved aside (`rotate`). Export is a verified concatenation of the live file plus `.1`..`.N` — copy those files off the host and check `audit_last_sha256` against `/configz`.

## Operations endpoints

| Method | Path | Role |
|---|---|---|
| GET | `/healthz` | Liveness. Plain `ok` when local-dev TLS is off. 200 during drain. The e2e harness treats that exact body as “gateway is up”. |
| GET | `/livez` | Liveness JSON. 200 during drain. |
| GET | `/readyz` | Readiness JSON. 503 after drain. Use this for load balancers. |
| GET | `/configz` | Non-secret config (row, domain, auth mode, budgets, audit sink health). No OIDC secrets and no audit event bodies. |
| GET | `/telemetryz` | JSON copy/disposition counters. |
| GET | `/metrics` | Prometheus text 0.0.4 of those counters plus session gauges and audit counters. |
| POST | `/drain` | Mark not-ready; reject new `/ws`. Existing sessions continue. |
| GET | `/ws` | R2WP binary WebSocket. 503 while draining. |
| GET | `/local-dev/tls` | ADR 0011 advertisement when local-dev TLS is on. |

Browser isolation headers (COOP/COEP/CORP) are opt-in via
`RCLWEBD_ISOLATION_HEADERS=1`. CORS is an allow list
(`RCLWEBD_CORS_ORIGINS`, comma-separated; `*` allowed). Empty means no CORS
headers.

## Drain

1. `POST /drain` (preStop / deploy hook) so the load balancer sees `/readyz` 503.
2. Wait until `sessions` in `/readyz` is 0, or until the drain timeout.
3. SIGTERM. The process also drains on SIGTERM / ctrl_c and waits
   `RCLWEBD_DRAIN_TIMEOUT_SECS` (default 15) before exit.

## Compose shape

[`docker/compose.r4-02-gateway.yml`](../docker/compose.r4-02-gateway.yml) (J-FT),
[`docker/compose.r4-02-gateway-h-ft.yml`](../docker/compose.r4-02-gateway-h-ft.yml)
(H-FT), and [`docker/compose.r4-02-gateway-rmw.yml`](../docker/compose.r4-02-gateway-rmw.yml)
(J-CY / J-ZN / H-CY / H-ZN plus zenoh router companions) use
`network_mode: host` so the RMW can see the robot domain. That is a local /
robot-edge shape, not a cloud overlay network. The [Kubernetes](#kubernetes)
units keep the same host-network bind.
[`docker/compose.webtransport.yml`](../docker/compose.webtransport.yml) overlays
`RCLWEBD_OFFER_WEBTRANSPORT=1` on the `rclwebd` service (`just gateway-wt` /
`just gateway-wt-h-ft`).

## ros2 run

Interactive robot-side start. `rclwebd` is still a native process
(browsers cannot bind rcl). This overlay only makes that process look
like a normal ROS package. It is not bloom
([ADR 0018](./adr/0018-prebuilt-gateway-distribution.md)). Debian
packages are the [apt](#apt) repo ([ADR 0019](./adr/0019-own-apt-repository.md)).

Default `scripts/install-rclwebd.sh` writes
`~/.local/share/rclwebd` (override with `--ament-prefix` /
`RCLWEBD_AMENT_PREFIX`). `--no-ament` skips it. `--systemd-only`
stays systemd-only unless you also pass `--ament`.

```bash
source /opt/ros/$ROS_DISTRO/setup.bash
source ~/.local/share/rclwebd/local_setup.bash
ros2 run rclwebd rclwebd
# or
ros2 launch rclwebd rclwebd.launch.py
```

`ros2 run` already has a sourced prefix. The overlay executable is the
binary, not [`scripts/rclwebd-ros.sh`](../scripts/rclwebd-ros.sh).
Do not wrap `setup.bash` again on this path. Configuration stays on the
environment (`RCLWEBD_BIND`, `ROS_DOMAIN_ID`,
`RCLWEBD_OFFER_WEBTRANSPORT`, …). Extra `--ros-args` from
`launch_ros.actions.Node` would be ignored, so the launch file uses
`ExecuteProcess`.

From a clone with a built binary:

```bash
just install-rclwebd-ament
```

`--ament-only` writes the overlay against an existing
`--dir/rclwebd` or `RCLWEBD_BIN` without downloading. `curl | bash`
fetches `packaging/ament/rclwebd` from `RCLWEBD_UNIT_REF` (default
`main`) when the script is not running from a clone.

Docker images already source the image prefix and stay
`docker run`. systemd stays for unattended hosts. Kubernetes is the
cluster unit.

## systemd

Unattended hosts. Interactive start is [`ros2 run`](#ros2-run).

Host binaries need a sourced ROS prefix before `exec rclwebd`. systemd
`EnvironmentFile=` only assigns variables — it cannot run `setup.bash` —
so typesupport dlopen and row auto-detect would fail if `ExecStart` were
the binary. Units therefore start
[`scripts/rclwebd-ros.sh`](../scripts/rclwebd-ros.sh) (installed next to
`rclwebd`). Templates live in [`packaging/systemd/`](../packaging/systemd/).
The installer rewrites `@EXEC@` / `@ENVFILE@` and copies the env example
only when the destination does not exist. It does not enable or start
the service.

```bash
# from a clone; also downloads the binary unless --systemd-only
./scripts/install-rclwebd.sh --distro jazzy --systemd user
./scripts/install-rclwebd.sh --systemd-only --systemd user --dir ~/.local/bin
```

| Kind | Unit | Env |
|---|---|---|
| user | `~/.config/systemd/user/rclwebd.service` | `~/.config/rclwebd/rclwebd.env` |
| system (root) | `/etc/systemd/system/rclwebd.service` | `/etc/rclwebd.env` |

`--systemd` without `user`/`system` infers user when `--dir` is under
`$HOME`, otherwise system. `curl | bash` fetches the templates from
`RCLWEBD_UNIT_REF` (default `main`), not from `--version`: release tags
older than this landing do not contain `packaging/systemd`.

```bash
systemctl --user daemon-reload
systemctl --user enable --now rclwebd
```

`TimeoutStopSec=30` stays above the default drain
(`RCLWEBD_DRAIN_TIMEOUT_SECS=15`). Do not add `ExecStop` — SIGTERM
already drains. Leave `RCLWEBD_SUPPORT_ROW` unset so the sourced prefix
selects the row ([ADR 0018](./adr/0018-prebuilt-gateway-distribution.md)).
Authenticate stays **off**; do not set `RCLWEBD_AUTH_MODE=oidc`. Intranet
WebTransport is still the one env. This unit does not start `rmw_zenohd`.
`ProtectSystem=strict` would block `/opt/ros` dlopen; these units stay
simple.

## Kubernetes

Cluster units for the same host-network robot-edge shape as
[compose](#compose-shape). systemd stays for unattended hosts without a
cluster. This is not a cloud overlay network.

Templates live in [`packaging/kubernetes/`](../packaging/kubernetes/).

```bash
kubectl apply -k packaging/kubernetes
```

`hostNetwork: true` so the RMW sees the robot domain. `replicas: 1` —
one process, one row, one node bind of 8794 ([ADR 0008](./adr/0008-one-adapter-row-per-gateway-process.md)).
`strategy: Recreate`: a RollingUpdate surge would collide on that bind.
The image default is `ghcr.io/alexzhang1030/rclwebd:jazzy` (J-FT). Change
the image tag for another row (`:humble`, `:j-zn`, …). Do not set
`RCLWEBD_SUPPORT_ROW` on the pod — the image bakes the row, and a
disagreement fails the adapter probe. This unit does not start
`rmw_zenohd`.

Probes: liveness [`/healthz`](#operations-endpoints), readiness
[`/readyz`](#operations-endpoints). `preStop` POSTs `/drain`.
`terminationGracePeriodSeconds` is 30 (above the default drain of 15s).
Do not probe `/healthz` for admission.

Authenticate stays **off**; do not set `RCLWEBD_AUTH_MODE=oidc`. Intranet
WebTransport is still the one env. Production WSS / HTTPS stays a reverse
proxy or Ingress in front of 8794 — this unit does not terminate TLS.

A ClusterIP Service is for in-cluster scrape of `/metrics` and in-cluster
`/readyz`. Browsers on the robot LAN use the node address the same way
they use compose host network.

## Follow-ups

Production PKI, remote metrics/trace export, and upgrade/rollback
playbooks remain [open work](../tasks/plan.md).
SROS2 is parked while auth is out of scope.
