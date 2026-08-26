import { describe, expect, test } from "bun:test";
import {
  DEFAULT_INIT_URL,
  resolveInitArgs,
} from "../src/context.ts";

describe("resolveInitArgs", () => {
  test("init() uses the local WebSocket default", () => {
    expect(resolveInitArgs()).toEqual({
      url: DEFAULT_INIT_URL,
      options: {},
    });
    expect(DEFAULT_INIT_URL).toBe("ws://127.0.0.1:8794/ws");
  });

  test("init(options) keeps the default URL", () => {
    expect(resolveInitArgs({ reconnect: true })).toEqual({
      url: DEFAULT_INIT_URL,
      options: { reconnect: true },
    });
  });

  test("init(url, options) keeps an explicit host", () => {
    expect(resolveInitArgs("192.168.1.10", { transport: "websocket" })).toEqual({
      url: "192.168.1.10",
      options: { transport: "websocket" },
    });
  });
});
