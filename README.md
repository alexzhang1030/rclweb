# rclweb

Browser access to ROS 2. Install [`rcl-web`](https://www.npmjs.com/package/rcl-web),
run [`rclwebd`](https://crates.io/crates/rclwebd) on the machine that can see
the ROS graph, then use `Node` the way you use rclcpp.

```ts
import { init, Node, std_msgs } from "rcl-web";

await init();
const node = new Node("talker");

const pub = node.createPublisher(std_msgs.msg.String, "chatter", 10);
const msg = new std_msgs.msg.String();
msg.data = "hello";
pub.publish(msg);

node.createSubscription(std_msgs.msg.String, "chatter", 10, (incoming) => {
  console.log(incoming.data);
});
```

- [How to: node, topics, services, actions](./docs/typescript.md)
- [API reference](./docs/api.md)

## Install

```bash
npm install rcl-web
```

Your own `.msg` / `.srv` / `.action` files:

```bash
npx rcl-web gen --package ./my_interfaces --out src/generated/my_interfaces.ts
```

```ts
import { my_interfaces } from "./generated/my_interfaces.ts";
const msg = new my_interfaces.msg.Status();
```

[How to](./docs/typescript.md#your-own-message-types). Topic encode/decode
still covers the types `rcl-web` ships.

`init()` talks to `ws://127.0.0.1:8794/ws`. On the robot (or your laptop)
run `rclwebd` so that process can join the ROS domain. Prebuilt image,
no clone, no toolchain (`:humble` for Humble):

```bash
docker run --rm --network host ghcr.io/alexzhang1030/rclwebd:jazzy
```

On Ubuntu 24.04 (Jazzy) or 22.04 (Humble), after the Release has
`rclweb-apt-source` ([deploy](./docs/deploy.md#apt)):

```bash
sudo dpkg -i rclweb-apt-source_*_all.deb
sudo apt update
sudo apt install rclwebd
source /opt/ros/$ROS_DISTRO/setup.bash
source /opt/rclwebd/local_setup.bash
ros2 run rclwebd rclwebd
```

Or install a prebuilt binary into a sourced ROS 2 environment (Jazzy or
Humble; the support row is auto-detected from that environment). The
installer also writes an ament overlay so the process starts like a
normal ROS node:

```bash
curl -fsSL https://raw.githubusercontent.com/alexzhang1030/rclweb/main/scripts/install-rclwebd.sh | bash
source /opt/ros/$ROS_DISTRO/setup.bash
source ~/.local/share/rclwebd/local_setup.bash
ros2 run rclwebd rclwebd
```

Host systemd units (`--systemd`) are for unattended machines:
[deploy](./docs/deploy.md#systemd). `ros2 run` details:
[deploy](./docs/deploy.md#ros2-run).

Or build from source (needs Rust plus the ROS 2 development libraries):

```bash
cargo install rclwebd --features ros
rclwebd
```

Another host: `init("192.168.1.10")`. Rows, images, and operations:
[deploy](./docs/deploy.md).

## License

Apache-2.0. [LICENSE](./LICENSE), [NOTICE](./NOTICE).

Contributing and the `just` command surface: [CONTRIBUTING.md](./CONTRIBUTING.md).
