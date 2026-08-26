/**
 * rclcpp-shaped context: `init` / `ok` / `spin` / `shutdown`.
 *
 * `init()` talks to the local default. Pass a host only when the ROS
 * graph is on another machine. Wasm, Worker, and leases stay inside
 * this module.
 */

import { connect, type RclwebClient } from "./client.ts";
import { DEFAULT_HTTP_PORT } from "./local-dev-tls.ts";
import type { ConnectOptions } from "./types.ts";

export type InitOptions = ConnectOptions;

/** Local WebSocket default. Same bind as host `rclwebd`. */
export const DEFAULT_INIT_URL = `ws://127.0.0.1:${DEFAULT_HTTP_PORT}/ws`;

type Context = {
  client: RclwebClient;
  shutdownPromise: Promise<void>;
  resolveShutdown: () => void;
};

let context: Context | null = null;

function isInitOptions(
  value: string | InitOptions | undefined,
): value is InitOptions {
  return typeof value === "object" && value !== null;
}

/** Split `init()` / `init(url)` / `init(options)` into a URL and options. */
export function resolveInitArgs(
  urlOrOptions?: string | InitOptions,
  options: InitOptions = {},
): { url: string; options: InitOptions } {
  if (urlOrOptions === undefined) {
    return { url: DEFAULT_INIT_URL, options };
  }
  if (isInitOptions(urlOrOptions)) {
    return { url: DEFAULT_INIT_URL, options: urlOrOptions };
  }
  return { url: urlOrOptions, options };
}

export async function init(): Promise<void>;
export async function init(options: InitOptions): Promise<void>;
export async function init(url: string, options?: InitOptions): Promise<void>;
export async function init(
  urlOrOptions?: string | InitOptions,
  options: InitOptions = {},
): Promise<void> {
  if (context) {
    throw new Error("rclweb.init() already called; call shutdown() first");
  }
  const resolved = resolveInitArgs(urlOrOptions, options);
  const client = await connect(resolved.url, resolved.options);
  let resolveShutdown = (): void => {};
  const shutdownPromise = new Promise<void>((resolve) => {
    resolveShutdown = resolve;
  });
  context = { client, shutdownPromise, resolveShutdown };
}

export function ok(): boolean {
  return context !== null;
}

export async function shutdown(): Promise<void> {
  const current = context;
  if (!current) return;
  context = null;
  await current.client.close();
  current.resolveShutdown();
}

/**
 * Wait until `shutdown()`. The browser event loop already delivers callbacks;
 * this matches `rclcpp::spin` as the "run until we stop" call.
 */
export async function spin(_node?: unknown): Promise<void> {
  if (!context) {
    throw new Error("rclweb.spin() requires init()");
  }
  await context.shutdownPromise;
}

export function requireClient(): RclwebClient {
  if (!context) {
    throw new Error("Node requires rclweb.init() first");
  }
  return context.client;
}
