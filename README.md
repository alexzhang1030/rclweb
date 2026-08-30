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
- [Docs site](https://rclweb-website.vercel.app)

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
run `rclwebd` so that process can join the ROS domain. On Ubuntu 24.04
(Jazzy) or 22.04 (Humble) the host install is apt
([deploy](./docs/deploy.md#apt), [ADR 0019](./docs/adr/0019-own-apt-repository.md)).
The package name is `rclwebd`:

```bash
curl -fsSL https://raw.githubusercontent.com/alexzhang1030/rclweb/main/scripts/enable-rclweb-apt.sh | sudo bash
sudo apt update
sudo apt install rclwebd
```

Docker (`:humble` for Humble) and a from-source crate build are
secondary:

```bash
docker run --rm --network host ghcr.io/alexzhang1030/rclwebd:jazzy
```

```bash
cargo install rclwebd --features ros
rclwebd
```

Another host: `init("192.168.1.10")`. Rows, images, and operations:
[deploy](./docs/deploy.md).

## License

Apache-2.0. [LICENSE](./LICENSE), [NOTICE](./NOTICE).

Contributing and the `just` command surface: [CONTRIBUTING.md](./CONTRIBUTING.md).
