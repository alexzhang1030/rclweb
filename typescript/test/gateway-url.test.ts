import { describe, expect, test } from "bun:test";
import {
  IntranetQuicRequiresSecureContextError,
  WebTransportUnavailableError,
  resolveGatewayConnect,
} from "../src/gateway-url.ts";

const browserWt = { webTransport: true, secureContext: true };
const lanIpPage = { webTransport: true, secureContext: false };
const bunNoWt = { webTransport: false, secureContext: true };

describe("resolveGatewayConnect", () => {
  test("custom ws ports stay on WebSocket (tests and non-default binds)", () => {
    expect(
      resolveGatewayConnect("ws://127.0.0.1:54321/ws", {}, browserWt),
    ).toEqual({
      url: "ws://127.0.0.1:54321/ws",
      transport: "websocket",
    });
  });

  test("localhost Chromium upgrades the default HTTP port to WebTransport", () => {
    expect(resolveGatewayConnect("192.168.1.10", {}, browserWt)).toEqual({
      url: "https://192.168.1.10:4433/",
      transport: "webtransport",
    });
    expect(
      resolveGatewayConnect("ws://192.168.1.10:8794/ws", {}, browserWt),
    ).toEqual({
      url: "https://192.168.1.10:4433/",
      transport: "webtransport",
    });
    expect(
      resolveGatewayConnect("https://192.168.1.10:4433/", {}, browserWt),
    ).toEqual({
      url: "https://192.168.1.10:4433/",
      transport: "webtransport",
    });
  });

  test("LAN-IP page refuses silent WebSocket so QUIC stays the default", () => {
    expect(() => resolveGatewayConnect("192.168.1.10", {}, lanIpPage)).toThrow(
      IntranetQuicRequiresSecureContextError,
    );
    try {
      resolveGatewayConnect("192.168.1.10", {}, lanIpPage);
    } catch (err) {
      expect(err).toBeInstanceOf(IntranetQuicRequiresSecureContextError);
      expect((err as IntranetQuicRequiresSecureContextError).code).toBe(
        "intranet_quic_requires_secure_context",
      );
      expect((err as Error).message).toContain("http://127.0.0.1");
    }
  });

  test("explicit webtransport on an insecure page still refuses WebSocket", () => {
    expect(() =>
      resolveGatewayConnect(
        "https://10.0.0.5:4433/",
        { transport: "webtransport" },
        lanIpPage,
      ),
    ).toThrow(IntranetQuicRequiresSecureContextError);
  });

  test("explicit webtransport without the API refuses WebSocket", () => {
    expect(() =>
      resolveGatewayConnect("192.168.1.10", { transport: "webtransport" }, bunNoWt),
    ).toThrow(WebTransportUnavailableError);
  });

  test("explicit websocket never upgrades", () => {
    expect(
      resolveGatewayConnect(
        "ws://192.168.1.10:8794/ws",
        { transport: "websocket" },
        browserWt,
      ),
    ).toEqual({
      url: "ws://192.168.1.10:8794/ws",
      transport: "websocket",
    });
    expect(
      resolveGatewayConnect("192.168.1.10", { transport: "websocket" }, lanIpPage),
    ).toEqual({
      url: "ws://192.168.1.10:8794/ws",
      transport: "websocket",
    });
  });

  test("wss production URLs stay on WebSocket", () => {
    expect(
      resolveGatewayConnect("wss://gateway.example/ws", {}, browserWt),
    ).toEqual({
      url: "wss://gateway.example/ws",
      transport: "websocket",
    });
  });

  test("loopback stays on WebSocket even when Chromium has WebTransport", () => {
    expect(
      resolveGatewayConnect("ws://127.0.0.1:8794/ws", {}, browserWt),
    ).toEqual({
      url: "ws://127.0.0.1:8794/ws",
      transport: "websocket",
    });
    expect(resolveGatewayConnect("127.0.0.1", {}, browserWt)).toEqual({
      url: "ws://127.0.0.1:8794/ws",
      transport: "websocket",
    });
    expect(resolveGatewayConnect("localhost", {}, browserWt)).toEqual({
      url: "ws://localhost:8794/ws",
      transport: "websocket",
    });
    expect(resolveGatewayConnect("::1", {}, browserWt)).toEqual({
      url: "ws://[::1]:8794/ws",
      transport: "websocket",
    });
  });

  test("explicit https on loopback still requests WebTransport", () => {
    expect(
      resolveGatewayConnect("https://127.0.0.1:4433/", {}, browserWt),
    ).toEqual({
      url: "https://127.0.0.1:4433/",
      transport: "webtransport",
    });
  });

  test("bun without WebTransport keeps the default ws URL", () => {
    const resolved = resolveGatewayConnect(
      "ws://127.0.0.1:8794/ws",
      {},
      bunNoWt,
    );
    expect(resolved.url).toBe("ws://127.0.0.1:8794/ws");
    expect(resolved.transport).toBe("websocket");
    expect(resolved.note).toBeUndefined();
  });

  test("https default WT port maps back to HTTP 8794 on fallback", () => {
    expect(
      resolveGatewayConnect("https://192.168.1.10:4433/", {}, bunNoWt).url,
    ).toBe("ws://192.168.1.10:8794/ws");
  });

  test("explicit webtransport on loopback still requests QUIC", () => {
    expect(
      resolveGatewayConnect(
        "127.0.0.1",
        { transport: "webtransport" },
        browserWt,
      ),
    ).toEqual({
      url: "https://127.0.0.1:4433/",
      transport: "webtransport",
    });
  });
});
