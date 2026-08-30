import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  LARGE_FRAME_INLINE_THRESHOLD,
  encodeHostBatch,
  loadWasm,
  pollEngine,
  readTelemetry,
} from "../src/internal.ts";

const wasmPath = path.join(import.meta.dir, "..", "wasm", "rclweb.wasm");

function loadWasmBytes(): ArrayBuffer {
  const bytes = readFileSync(wasmPath);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

test("encodeHostBatch two-pass handles ~1 MiB frame without RangeError", () => {
  const payload = new Uint8Array(1024 * 1024);
  for (let i = 0; i < payload.length; i += 4096) payload[i] = i & 0xff;
  const batch = encodeHostBatch([
    { type: "wsBytes", bufferId: 0, bytes: payload },
  ]);
  expect(batch.length).toBe(12 + 4 + 12 + payload.length);
  // Spot-check magic + inline payload tail byte.
  expect(batch[0]).toBe(0x42); // 'B' of RCLB little-endian 0x52434c42
  expect(batch[batch.length - 1]).toBe(payload[payload.length - 1]!);
});

test("wsBytes poll uses external path and records one engine copy", async () => {
  const wasm = await loadWasm(loadWasmBytes());
  // 32 KiB is the medium-message validation target; 64 KiB was the
  // old inline/external split. Both must take the one-copy path.
  // Each size gets a fresh engine: garbage bootstrap bytes fail the
  // session, so a second poll on the same handle would not ingest.
  for (const size of [128, 32 * 1024, LARGE_FRAME_INLINE_THRESHOLD]) {
    const handle = wasm.rclweb_engine_new();
    expect(handle).toBeGreaterThan(0);
    try {
      pollEngine(wasm, handle, [
        {
          type: "command",
          command: { type: "start", transferableArrayBuffer: true },
        },
      ]);
      const frame = new Uint8Array(size);
      frame[0] = 0x00;
      frame[1] = 0x01;
      const before = readTelemetry(wasm, handle);
      pollEngine(wasm, handle, [
        { type: "wsBytes", bufferId: 0, bytes: frame },
      ]);
      const after = readTelemetry(wasm, handle);
      expect(after.copiesIntoEngine - before.copiesIntoEngine).toBe(1);
      expect(after.bytesCopiedIntoEngine - before.bytesCopiedIntoEngine).toBe(
        frame.length,
      );
    } finally {
      wasm.rclweb_engine_free(handle);
    }
  }
});
