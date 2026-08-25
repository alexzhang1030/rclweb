/**
 * WebTransport / local-dev TLS SDK surface (R3-03).
 * Bun has no WebTransport; the connect path must stay on websocket by default.
 */

import { describe, expect, test } from "bun:test";
import {
  decodeCertificateHashValue,
  httpOriginFromWebTransportUrl,
} from "../src/local-dev-tls.ts";
import {
  createLengthPrefixedInbox,
  pushLengthPrefixedChunk,
} from "../src/host.ts";

describe("local-dev TLS helpers", () => {
  test("decodeCertificateHashValue accepts base64", () => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = i;
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const b64 = btoa(binary);
    const decoded = decodeCertificateHashValue(b64);
    expect([...decoded]).toEqual([...bytes]);
  });

  test("httpOriginFromWebTransportUrl maps default WT 4433 to HTTP 8794", () => {
    expect(httpOriginFromWebTransportUrl("https://127.0.0.1:4433/r2wp")).toBe(
      "http://127.0.0.1:8794",
    );
    expect(httpOriginFromWebTransportUrl("https://192.168.1.10:4433/")).toBe(
      "http://192.168.1.10:8794",
    );
  });

  test("httpOriginFromWebTransportUrl keeps a custom WT port", () => {
    expect(httpOriginFromWebTransportUrl("https://127.0.0.1:9443/r2wp")).toBe(
      "http://127.0.0.1:9443",
    );
    expect(httpOriginFromWebTransportUrl("https://example.com/")).toBe(
      "http://example.com",
    );
  });

  test("WebTransport constructor path is skipped without globalThis.WebTransport", () => {
    const WT = (globalThis as { WebTransport?: unknown }).WebTransport;
    expect(WT).toBeUndefined();
  });
});

describe("length-prefixed WT inbox", () => {
  function frameWithPrefix(body: Uint8Array): Uint8Array {
    const out = new Uint8Array(4 + body.length);
    new DataView(out.buffer).setUint32(0, body.length, false);
    out.set(body, 4);
    return out;
  }

  test("emits one complete frame and copies it off the inbox", () => {
    const inbox = createLengthPrefixedInbox(16);
    const body = new Uint8Array([1, 2, 3, 4]);
    const got: Uint8Array[] = [];
    pushLengthPrefixedChunk(inbox, frameWithPrefix(body), (frame) => {
      got.push(frame);
    });
    expect(got).toHaveLength(1);
    expect([...got[0]!]).toEqual([1, 2, 3, 4]);
    expect(inbox.start).toBe(0);
    expect(inbox.end).toBe(0);
    inbox.buf.fill(0xff);
    expect([...got[0]!]).toEqual([1, 2, 3, 4]);
  });

  test("splits a frame across chunks and grows the inbox", () => {
    const inbox = createLengthPrefixedInbox(8);
    const body = new Uint8Array(20).fill(7);
    const prefixed = frameWithPrefix(body);
    const got: Uint8Array[] = [];
    pushLengthPrefixedChunk(inbox, prefixed.subarray(0, 6), (frame) => {
      got.push(frame);
    });
    expect(got).toHaveLength(0);
    pushLengthPrefixedChunk(inbox, prefixed.subarray(6), (frame) => {
      got.push(frame);
    });
    expect(got).toHaveLength(1);
    expect(got[0]!.length).toBe(20);
    expect(got[0]![0]).toBe(7);
    expect(inbox.buf.length).toBeGreaterThanOrEqual(24);
  });

  test("compacts leftover bytes instead of reallocating the remainder", () => {
    const inbox = createLengthPrefixedInbox(32);
    const first = frameWithPrefix(new Uint8Array([9]));
    const secondPrefix = new Uint8Array([0, 0, 0, 2, 8]);
    const got: number[][] = [];
    const chunk = new Uint8Array(first.length + secondPrefix.length);
    chunk.set(first);
    chunk.set(secondPrefix, first.length);
    pushLengthPrefixedChunk(inbox, chunk, (frame) => {
      got.push([...frame]);
    });
    expect(got).toEqual([[9]]);
    expect(inbox.end - inbox.start).toBe(5);
    pushLengthPrefixedChunk(inbox, new Uint8Array([10]), (frame) => {
      got.push([...frame]);
    });
    expect(got).toEqual([[9], [8, 10]]);
    expect(inbox.start).toBe(0);
    expect(inbox.end).toBe(0);
  });
});
