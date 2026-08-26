# rcl-web

TypeScript client for ROS 2 in the browser. Run
[`rclwebd`](https://crates.io/crates/rclwebd) on the machine that can
see the ROS graph, then use `Node` like rclcpp.

```ts
import { init, Node, std_msgs } from "rcl-web";

await init();
const node = new Node("listener");

node.createSubscription(std_msgs.msg.String, "chatter", 10, (msg) => {
  console.log(msg.data);
});
```

```bash
npm install rcl-web
```

Your own ROS interfaces (a package with `msg/` / `srv/` / `action/`):

```bash
npx rcl-web gen --package ./my_interfaces --out src/generated/my_interfaces.ts
```

```ts
import { my_interfaces } from "./generated/my_interfaces.ts";
const msg = new my_interfaces.msg.Status();
```

[How to](../docs/typescript.md#your-own-message-types). Topic codecs
still cover only the types this package ships.

- [How to: node, topics, services, actions](../docs/typescript.md)
- [API reference](../docs/api.md)

Do not import `rcl-web/internal` from application code.
