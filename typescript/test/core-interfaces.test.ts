import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import path from "node:path";
import { decodeGeneratedCdr, encodeCatalogCdr } from "../src/cdr-le.ts";
import {
  GENERATED_MSG_TYPE_NAMES,
  GENERATED_TYPE_NAMES,
  builtin_interfaces,
  createGenerated,
  geometry_msgs,
  isGeneratedMsgType,
  std_msgs,
  std_srvs,
} from "../src/interfaces.ts";

const ROSIDL_ROOT = path.resolve(import.meta.dir, "../rosidl");

function interfaceFiles(pkgDir: string): { kind: string; name: string }[] {
  const out: { kind: string; name: string }[] = [];
  for (const kind of ["msg", "srv", "action"] as const) {
    let entries: string[] = [];
    try {
      entries = readdirSync(path.join(pkgDir, kind));
    } catch {
      continue;
    }
    for (const file of entries) {
      if (file.endsWith(`.${kind}`)) {
        out.push({ kind, name: file.slice(0, -(kind.length + 1)) });
      }
    }
  }
  return out;
}

describe("vendored ROS core interfaces", () => {
  const packages = readdirSync(ROSIDL_ROOT).filter((name) => !name.startsWith("."));

  test("every vendored package file has a generated class", () => {
    expect(packages.length).toBeGreaterThanOrEqual(20);
    for (const pkg of packages) {
      const files = interfaceFiles(path.join(ROSIDL_ROOT, pkg));
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        if (file.kind === "msg") {
          expect(GENERATED_MSG_TYPE_NAMES.has(`${pkg}/msg/${file.name}`)).toBe(true);
          expect(createGenerated(`${pkg}/msg/${file.name}`)).toBeDefined();
          continue;
        }
        if (file.kind === "srv") {
          expect(createGenerated(`${pkg}/srv/${file.name}_Request`)).toBeDefined();
          expect(createGenerated(`${pkg}/srv/${file.name}_Response`)).toBeDefined();
          continue;
        }
        expect(createGenerated(`${pkg}/action/${file.name}_Goal`)).toBeDefined();
        expect(createGenerated(`${pkg}/action/${file.name}_Result`)).toBeDefined();
        expect(createGenerated(`${pkg}/action/${file.name}_Feedback`)).toBeDefined();
      }
    }
  });

  test("constructs non-sample core types", () => {
    const i32 = new std_msgs.msg.Int32();
    expect(i32.data).toBe(0);
    expect(std_msgs.msg.Int32.typeName).toBe("std_msgs/msg/Int32");

    const twist = new geometry_msgs.msg.Twist();
    expect(twist.linear.x).toBe(0);
    expect(twist.angular.z).toBe(0);

    const duration = new builtin_interfaces.msg.Duration();
    expect(duration.sec).toBe(0);
    expect(duration.nanosec).toBe(0);

    expect(new std_msgs.msg.Empty()).toBeDefined();
    expect(std_srvs.srv.Empty.typeName).toBe("std_srvs/srv/Empty");
  });

  test("core topic types are generated and usable", () => {
    expect(isGeneratedMsgType("std_msgs/msg/Int32")).toBe(true);
    expect(isGeneratedMsgType("geometry_msgs/msg/Twist")).toBe(true);
    expect(isGeneratedMsgType("builtin_interfaces/msg/Duration")).toBe(true);
    expect(isGeneratedMsgType("std_msgs/msg/String")).toBe(false);
    expect(isGeneratedMsgType("sensor_msgs/msg/PointCloud2")).toBe(false);
    expect(GENERATED_TYPE_NAMES.has("std_srvs/srv/Empty_Request")).toBe(true);
  });

  test("catalog CDR round-trips Int32 Twist Duration", () => {
    const i32 = new std_msgs.msg.Int32();
    i32.data = 42;
    const i32Cdr = encodeCatalogCdr(std_msgs.msg.Int32.typeName, i32);
    const i32Back = decodeGeneratedCdr(std_msgs.msg.Int32.typeName, i32Cdr) as std_msgs.msg.Int32;
    expect(i32Back).toBeInstanceOf(std_msgs.msg.Int32);
    expect(i32Back.data).toBe(42);

    const twist = new geometry_msgs.msg.Twist();
    twist.linear.x = 1.5;
    twist.angular.z = -0.25;
    const twistCdr = encodeCatalogCdr(geometry_msgs.msg.Twist.typeName, twist);
    const twistBack = decodeGeneratedCdr(
      geometry_msgs.msg.Twist.typeName,
      twistCdr,
    ) as geometry_msgs.msg.Twist;
    expect(twistBack.linear.x).toBeCloseTo(1.5);
    expect(twistBack.angular.z).toBeCloseTo(-0.25);

    const duration = new builtin_interfaces.msg.Duration();
    duration.sec = 3;
    duration.nanosec = 7;
    const durCdr = encodeCatalogCdr(builtin_interfaces.msg.Duration.typeName, duration);
    const durBack = decodeGeneratedCdr(
      builtin_interfaces.msg.Duration.typeName,
      durCdr,
    ) as builtin_interfaces.msg.Duration;
    expect(durBack.sec).toBe(3);
    expect(durBack.nanosec).toBe(7);
  });
});
