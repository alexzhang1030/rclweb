# Architecture rationale

rclweb places deterministic ROS application state in browser Wasm and robot trust at the edge, with **one Rust core serving both sides of the wire**. This is the load-bearing decision ([ADR 0010](../../docs/adr/0010-restructure-single-rust-core.md)): the gateway must be native (it binds the rcl C surface), the browser must be Wasm, and a second language for the browser runtime would force every shared contract to exist twice plus permanent cross-implementation verification.

Detailed contracts live in [architecture](../../docs/architecture.md), [R2WP](../../docs/protocol/r2wp.md), [`rclweb` core](../../docs/runtime/core.md), and [`rclwebd`](../../docs/gateway/rclwebd.md).

## System shape

```text
Browser application
  TypeScript package + Workers + rclweb core (wasm32)
                 |
                 | R2WP / CDR
                 v
Robot edge
  one rclwebd process (same core, native) and one adapter support row
                 |
                 v
ROS 2 domains for that row
```

One gateway process may expose multiple domain IDs within its support row. Fleet views combine independent sessions across rows. Every event keeps gateway, support-row, and domain provenance.

`gateway_instance_id` identifies a logical gateway deployment. It survives ordinary restart and in-place upgrade when resumable state is preserved. `support_row_id` identifies the immutable ROS distribution and RMW profile of the running gateway artifact.

## Ownership

| Unit | Responsibility |
|---|---|
| R2WP | Frames, control messages, channels, schema identity, errors, versioning, and provenance |
| `rclweb` core | Protocol codecs, CDR ([core contract](../../docs/runtime/cdr.md)), session/channel state, type registry, ROS state, QoS, and host poll contract |
| TypeScript package | Public API (`init` / `Node` / pub / sub / service / action). `init()` does not name the edge process. Host, session `connect`, and wasm ABI stay on `rcl-web/internal` ([how to](../../docs/typescript.md), [API](../../docs/api.md)). ROS interface classes come from `.msg` / `.srv` / `.action` via `scripts/rosidl-dts.ts` |
| `rclwebd` | ROS attachment (versioned serialized adapter ABI + dlopen typesupport), sessions, schema cache, scheduling, policy, audit, and operations |
| Conformance system | Fixtures (single oracle), corpus, workloads, environment identity, and the support matrix |
| Studio | Optional post-release workspace, panels, rendering, media, and command presentation |

## Design rules

- CDR stays on the binary data path; the gateway never parses sample bodies.
- Browser APIs remain in JavaScript Workers; the core crosses the boundary through bounded poll batches ([ADR 0004](../../docs/adr/0004-browser-wasm-host-boundary.md)). Idle-queue ROS_SAMPLE does not enter that batch ([ADR 0017](../../docs/adr/0017-host-retain-inbound-sample-payload.md)).
- The copy budget is one controllable payload copy end to end (RMW take). ROS_SAMPLE stays in the host WebSocket buffer; wasm is not on that data plane ([ADR 0017](../../docs/adr/0017-host-retain-inbound-sample-payload.md), [performance contracts](../../docs/architecture.md#performance-contracts)). Wasm-thread views are 0 copies; Worker→main host-retain String / PointCloud2 / generated corpus msg / service/action CDR is a transfer (0 copies). The public `Node` API copies PointCloud2 `data`. Foxglove / rosbridge: [performance](../../docs/performance.md).
- Queue, buffer, timeout, retry, and memory budgets are explicit; best-effort channels drop at the edge with stable dispositions.
- Large-message / PointCloud2 delivery keeps O(1) borrowed CDR views and measures both host buffer strategies.
- Service/action channels use `OPERATION_ID` streams; graph state arrives as GraphSnapshot/Delta after SessionReady.
- Fixtures are the single conformance oracle; there is no cross-implementation agreement apparatus.
- Security-sensitive work records effective policy, audit identity, and failure behavior.
- Process operations (`/livez`, `/readyz`, `/configz`, `/metrics`, `POST /drain`), the runtime images, the thin ament overlay (`ros2 run rclwebd rclwebd`, [deploy](../../docs/deploy.md#ros2-run)), host systemd units (`packaging/systemd`, [deploy](../../docs/deploy.md#systemd)), and the own apt repo (`rclwebd` / `rclweb-apt-source`, [ADR 0019](../../docs/adr/0019-own-apt-repository.md), [deploy](../../docs/deploy.md#apt)) are the deploy surface; `/healthz` stays liveness. Audit file-sink health lives on `/configz` / `/metrics`, not as event bodies. Kubernetes remains open. The overlay is not bloom. Bloom / `packages.ros.org` stays deferred ([ADR 0018](../../docs/adr/0018-prebuilt-gateway-distribution.md)).
- The TypeScript happy path is `init()`. It talks to the local default and does not name `rclwebd`. The native process stays: browsers cannot bind rcl. Pass a host only when ROS is on another machine. Local `init()` is WebSocket on purpose. Copies on that hop are done; the remaining WS cost is HOL plus kernel/browser RX ([performance](../../docs/performance.md#websocket)).
- Intranet / lab WebTransport is ADR 0011 local-dev TLS plus `RCLWEBD_OFFER_WEBTRANSPORT`. `init("192.168.1.10")` uses WebTransport (QUIC) from a localhost page. Loopback and `init()` stay on WebSocket. A LAN-IP page is not a secure context. `init` throws unless `{ transport: "websocket" }`. Do not ask operators to install a CA. Production PKI is a separate follow-up ([intranet recipe](../../docs/deploy.md#intranet-webtransport)).
- Platform expansion enters through the [support matrix](../../docs/support-matrix.md) and [validation](../../docs/validation.md).
- Application TypeScript bindings for ROS interfaces are generated from `.msg` / `.srv` / `.action` with `npx rcl-web gen` (published `dist/cli.js`). That path does not emit CDR codecs or accept OMG `.idl`. Topic encode/decode stays on the shipped surface; dynamic projection remains later work.
