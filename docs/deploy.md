# Deploying `rclwebd`

Operator profile for the runtime images and process operations. The
gateway remains the trust boundary ([security](./security.md)); this
page covers how to run it.

## Prebuilt image

The release workflow publishes the Jazzy (J-FT) and Humble (H-FT)
images to GHCR
([ADR 0018](./adr/0018-prebuilt-gateway-distribution.md),
[release](./release.md)). No clone or toolchain required:

```bash
docker run --rm --network host ghcr.io/alexzhang1030/rclwebd:jazzy
```

Use `:humble` on Humble. Other tags: `<version>-j-ft`, `j-ft`,
`latest` (J-FT); `<version>-h-ft`, `h-ft` (H-FT). Every tag is a
multi-arch manifest (`linux/amd64` + `linux/arm64`).

Local rebuild:

```bash
just image-rclwebd
just gateway
```

`just gateway` is host-network compose so the process can join the
machine's ROS domain.

## From source

Needs Rust plus the ROS 2 development libraries for that distro:

```bash
cargo install rclwebd --features ros
rclwebd
```

Add `webtransport` for the HTTP/3 accept loop (intranet:
`RCLWEBD_OFFER_WEBTRANSPORT=1`). Default crate builds stay ROS-free
(library + tests). `RCLWEBD_SUPPORT_ROW` is auto-detected from the
sourced environment when unset.

## Artifact

One support row per process
([ADR 0008](./adr/0008-one-adapter-row-per-gateway-process.md)). The
Jazzy image is J-FT (`rmw_fastrtps_cpp`). The Humble image is H-FT.
Pair the image with the matching ROS prefix. Unset
`RCLWEBD_SUPPORT_ROW` derives the row from `ROS_DISTRO` +
`RMW_IMPLEMENTATION`.

## Operations

| Endpoint | Role |
|---|---|
| `GET /healthz` | Liveness. Body `ok` even while draining. |
| `GET /livez` | JSON liveness |
| `GET /readyz` | Readiness. 503 after `POST /drain` or SIGTERM. |
| `GET /configz` | Effective config. ACL rule count only. Audit health, not event bodies. |
| `GET /metrics` | Scrape-only counters |
| `POST /drain` | Stop admitting new sessions |

`GET /ws` is the R2WP WebSocket. `init()` talks to
`ws://127.0.0.1:8794/ws`.

Authenticate stays **off**. Do not set `RCLWEBD_AUTH_MODE=oidc` until
a tenant is named ([security](./security.md)).

## Intranet WebTransport

Local `init()` stays on WebSocket. Another host from a localhost page:

```ts
await init("192.168.1.10");
```

That is WebTransport (QUIC). Runtime images compile
`--features ros,webtransport`. Set `RCLWEBD_OFFER_WEBTRANSPORT=1` on
the robot. The flag implies local-dev TLS
([ADR 0011](./adr/0011-local-dev-webtransport-tls.md)), CORS `*` when
unset, and a WT UDP bind on the HTTP host at port 4433. A tab opened
via a LAN IP is not a secure context. `init` throws unless
`{ transport: "websocket" }`. Do not ask operators to install a CA.
Production PKI stays a follow-up.

### Intranet certificates

The gateway mints a short-lived ECDSA cert and serves hashes at
`GET /local-dev/tls`. Chromium only. Rotate before the browser's
14-day ceiling. The hash fetch is HTTP on 8794, not UDP 4433.

## Bind

Default HTTP/WS bind is `127.0.0.1:8794`. Host-network images use
`0.0.0.0:8794` so a laptop page can reach the robot. Unset
`RCLWEBD_WT_BIND` copies the HTTP bind host to UDP 4433.
