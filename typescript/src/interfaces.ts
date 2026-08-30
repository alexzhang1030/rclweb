/**
 * ROS interface types as values, matching rclcpp `std_msgs::msg::String`.
 *
 *   const msg = new std_msgs.msg.String();
 *   msg.data = "hello";
 *
 * Field names follow the ROS IDL (snake_case), not JS camelCase.
 * Message classes are generated from `.msg` / `.srv` / `.action`
 * (`scripts/rosidl-dts.ts`).
 */

import {
  GENERATED_MSG_TYPE_NAMES,
  GENERATED_OP_TYPES,
} from "./interfaces.generated.ts";

export * from "./interfaces.generated.ts";

export type MessageType<T> = {
  readonly typeName: string;
  new (): T;
};

/** A ROS type: the message class, or a `{ typeName }` / wire name string. */
export type TypeNameLike = string | { readonly typeName: string };

export function typeNameOf(type: TypeNameLike): string {
  return typeof type === "string" ? type : type.typeName;
}

/**
 * Topic types the generated catalog can encode/decode.
 * String and PointCloud2 stay on their dedicated host paths.
 */
const DEDICATED_TOPIC_TYPES = new Set([
  "std_msgs/msg/String",
  "sensor_msgs/msg/PointCloud2",
  "sensor_msgs/PointCloud2",
]);

export function isGeneratedMsgType(typeName: string): boolean {
  return GENERATED_MSG_TYPE_NAMES.has(typeName) && !DEDICATED_TOPIC_TYPES.has(typeName);
}

export type GeneratedOpKind = "Request" | "Response" | "Goal" | "Result" | "Feedback";

/** Sectioned ROS type for a service/action payload on the OpenChannel parent name. */
export function generatedOpTypeName(
  channelType: string,
  op: GeneratedOpKind,
): string | undefined {
  const ops = GENERATED_OP_TYPES[channelType];
  if (!ops) return undefined;
  return ops[op];
}
