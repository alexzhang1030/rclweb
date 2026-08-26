/**
 * Pick a URL and transport so remote `init("192.168.1.10")` uses QUIC,
 * while `init()` / loopback stays on the local WebSocket default.
 *
 * Chromium + `http://127.0.0.1` can use WebTransport (hash-pinned local-dev
 * cert) for a *remote* host. A page opened via a LAN IP is not a secure
 * context, so the same `init("192.168.1.10")` throws. Pass
 * `{ transport: "websocket" }` only to skip QUIC. Do not serve the page
 * over a self-signed HTTPS URL. That interstitial is more trouble than
 * opening localhost.
 */

import {
  DEFAULT_HTTP_PORT,
  DEFAULT_WEBTRANSPORT_PORT,
} from "./local-dev-tls.ts";
import type { ConnectOptions } from "./types.ts";

export type GatewayTransport = "websocket" | "webtransport";

export type GatewayRuntime = {
  webTransport: boolean;
  secureContext: boolean;
};

export type ResolvedGatewayConnect = {
  url: string;
  transport: GatewayTransport;
  /** Set when WebTransport was requested or implied but WebSocket is used. */
  note?: string;
};

export const INTRANET_QUIC_SECURE_CONTEXT_HINT =
  "WebTransport (QUIC) needs a secure context. Open this page at http://127.0.0.1 or http://localhost, then init(\"robot-ip\"). Pass { transport: \"websocket\" } only to skip QUIC.";

const NO_WEBTRANSPORT_API_NOTE =
  "WebTransport (QUIC) is not available in this runtime. Using WebSocket. Use Chromium with this page at http://127.0.0.1 for QUIC, or pass { transport: \"websocket\" } to silence this.";

/** Chromium has `WebTransport` but the page is `http://<lan-ip>`. */
export class IntranetQuicRequiresSecureContextError extends Error {
  readonly code = "intranet_quic_requires_secure_context" as const;

  constructor() {
    super(INTRANET_QUIC_SECURE_CONTEXT_HINT);
    this.name = "IntranetQuicRequiresSecureContextError";
  }
}

/** `transport: "webtransport"` in a runtime that has no `WebTransport`. */
export class WebTransportUnavailableError extends Error {
  readonly code = "webtransport_unavailable" as const;

  constructor() {
    super(
      'WebTransport (QUIC) is not available in this runtime. Use Chromium, or pass { transport: "websocket" }.',
    );
    this.name = "WebTransportUnavailableError";
  }
}

/** `isSecureContext === false` is a LAN-IP page. Unset (bun) is not insecure. */
export function detectGatewayRuntime(
  global: typeof globalThis = globalThis,
): GatewayRuntime {
  return {
    webTransport:
      typeof (global as { WebTransport?: unknown }).WebTransport === "function",
    secureContext: global.isSecureContext !== false,
  };
}

function parseGatewayInput(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("rclweb.init() URL is empty");
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return new URL(trimmed);
  }
  if (
    !trimmed.startsWith("[") &&
    trimmed.includes(":") &&
    trimmed.split(":").length > 2
  ) {
    return new URL(`http://[${trimmed}]`);
  }
  return new URL(`http://${trimmed}`);
}

function wsPath(u: URL): string {
  if (!u.pathname || u.pathname === "/") return "/ws";
  return `${u.pathname}${u.search}`;
}

function asWebSocketUrl(u: URL): string {
  if (u.protocol === "ws:" || u.protocol === "wss:") {
    return u.href;
  }
  if (u.protocol === "https:") {
    const port = u.port || "443";
    if (port === DEFAULT_WEBTRANSPORT_PORT) {
      return `ws://${u.hostname}:${DEFAULT_HTTP_PORT}/ws`;
    }
    const host = port === "443" ? u.hostname : `${u.hostname}:${u.port}`;
    return `wss://${host}${wsPath(u)}`;
  }
  const port = u.port || DEFAULT_HTTP_PORT;
  return `ws://${u.hostname}:${port}${wsPath(u)}`;
}

function asWebTransportUrl(u: URL): string {
  if (u.protocol === "https:") {
    const path = !u.pathname || u.pathname === "/" ? "/" : u.pathname;
    return `https://${u.host}${path}`;
  }
  return `https://${u.hostname}:${DEFAULT_WEBTRANSPORT_PORT}/`;
}

function defaultHttpOrWtPort(port: string): boolean {
  return (
    port === "" ||
    port === DEFAULT_HTTP_PORT ||
    port === DEFAULT_WEBTRANSPORT_PORT ||
    port === "80"
  );
}

/** Loopback talks to the process on this machine. That stays WebSocket. */
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * Remote intranet hint: bare LAN host, HTTP/WS on 8794, or HTTPS on 4433.
 * Loopback never implies QUIC — default `rclwebd` does not offer it.
 * Explicit `https://` (including loopback:4433) still requests WebTransport.
 */
function impliesIntranetWebTransport(u: URL): boolean {
  if (u.protocol === "wss:") return false;
  if (u.protocol === "https:") return true;
  if (isLoopbackHost(u.hostname)) return false;
  if (u.protocol === "ws:" || u.protocol === "http:") {
    return defaultHttpOrWtPort(u.port);
  }
  return false;
}

function canUseWebTransport(runtime: GatewayRuntime): boolean {
  return runtime.webTransport && runtime.secureContext;
}

function refuseUnlessWebTransport(runtime: GatewayRuntime): never {
  if (runtime.webTransport && !runtime.secureContext) {
    throw new IntranetQuicRequiresSecureContextError();
  }
  throw new WebTransportUnavailableError();
}

/**
 * Resolve `init` / `connect` input to a concrete URL and transport.
 *
 * A remote host on the default ports uses WebTransport (QUIC). Loopback
 * and `init()` stay on WebSocket. A LAN-IP page is not a secure context
 * — this throws unless `{ transport: "websocket" }`.
 *
 * Pass `runtime` in tests. Applications leave it unset.
 */
export function resolveGatewayConnect(
  input: string,
  options: Pick<ConnectOptions, "transport"> = {},
  runtime: GatewayRuntime = detectGatewayRuntime(),
): ResolvedGatewayConnect {
  const parsed = parseGatewayInput(input);
  const canWt = canUseWebTransport(runtime);
  const explicit = options.transport;

  if (explicit === "websocket") {
    return { url: asWebSocketUrl(parsed), transport: "websocket" };
  }

  if (explicit === "webtransport") {
    if (canWt) {
      return { url: asWebTransportUrl(parsed), transport: "webtransport" };
    }
    refuseUnlessWebTransport(runtime);
  }

  if (impliesIntranetWebTransport(parsed)) {
    if (canWt) {
      return { url: asWebTransportUrl(parsed), transport: "webtransport" };
    }
    if (runtime.webTransport && !runtime.secureContext) {
      throw new IntranetQuicRequiresSecureContextError();
    }
    return {
      url: asWebSocketUrl(parsed),
      transport: "websocket",
      note: NO_WEBTRANSPORT_API_NOTE,
    };
  }

  return { url: asWebSocketUrl(parsed), transport: "websocket" };
}
