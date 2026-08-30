# Validation

rclweb turns design targets into release authority through reproducible
conformance, security, and operations evidence. Support rows begin as
**Qualification targets** and become **Qualified** when a human updates
the [support matrix](./support-matrix.md).

## What must be true

| Claim | Evidence |
|---|---|
| Wire agreement | CDR, schemas, graph, QoS, and ROS time agree for the gated rows (`just test`, committed corpus) |
| Live path | Talker → `rclwebd` → TypeScript subscribe in CI (`just e2e`) |
| Ros-feature compile | `cargo check -p rclwebd --features ros --tests` in digest-pinned Jazzy (`just ros-check-docker` / CI `ros-feature-check`) |
| Browser runtime | Wasm core plus real ROS operations (subscribe, publish, service, action, graph) |
| Release | Identity, policy, deployment, reviewed matrix, and package `rcl-web@0.0.6` |

## Live path

```text
ROS talker
  -> serialized rcl surface in rclwebd
  -> R2WP over binary WebSocket
  -> browser I/O Worker
  -> host-retain JS CDR (wasm owns control; service/action inbound decodes in JS)
  -> typed event in a demo page or harness
```

`just e2e` is the live J-FT gate. Details of the sample path:
[performance](./performance.md).

## Engineering targets

| Dimension | Target |
|---|---:|
| CDR agreement | 100% for the declared corpus |
| Small-message bridge latency | Loopback p99 at or below 3 ms for 1 KiB |
| Medium-message bridge latency | LAN p99 at or below 8 ms for 32 KiB |
| Memory | Stable post-warmup envelope |
| Cached package startup | At or below 1.5 seconds |
| LAN graph readiness | At or below 500 ms |

These are engineering targets, not CI fails.

## Foundation

`just check`, `just test`, and `just build` are the ROS-free gate.
CI `foundation` runs them. `ros-feature-check` compiles
`rclwebd --features ros --tests` and does not run `cargo test`.
