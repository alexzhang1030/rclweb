/**
 * Little-endian CDR1 reader for host-retained sample bodies (ADR 0017).
 *
 * Wasm still owns R2WP, session, and generated codecs. String and
 * PointCloud2 decode from the JS WebSocket buffer so PointCloud2 `data`
 * is a view of that buffer (Foxglove-class), not a wasm memcpy.
 */

import type { PointCloud2 } from "./types.ts";

const td = new TextDecoder();

export class CdrLeReader {
  constructor(
    private readonly buf: Uint8Array,
    private o = 4,
  ) {
    if (buf.length < 4 || buf[1] !== 1) {
      throw new Error("expected little-endian CDR encapsulation");
    }
  }

  private need(n: number): void {
    if (this.o + n > this.buf.length) {
      throw new Error("truncated CDR");
    }
  }

  private align4(): void {
    this.o += (4 - (this.o % 4)) % 4;
  }

  u8(): number {
    this.need(1);
    return this.buf[this.o++]!;
  }

  u32(): number {
    this.align4();
    this.need(4);
    const v =
      this.buf[this.o]! |
      (this.buf[this.o + 1]! << 8) |
      (this.buf[this.o + 2]! << 16) |
      (this.buf[this.o + 3]! << 24);
    this.o += 4;
    return v >>> 0;
  }

  i32(): number {
    return this.u32() | 0;
  }

  bool(): boolean {
    const b = this.u8();
    if (b > 1) throw new Error("invalid CDR boolean");
    return b !== 0;
  }

  str(): string {
    const n = this.u32();
    if (n === 0) return "";
    this.need(n);
    const bytes = this.buf.subarray(this.o, this.o + n - 1);
    this.o += n;
    return td.decode(bytes);
  }

  byteSeq(): Uint8Array {
    const n = this.u32();
    this.need(n);
    const view = this.buf.subarray(this.o, this.o + n);
    this.o += n;
    return view;
  }
}

/** `std_msgs/msg/String`. Returns null when the payload is not LE CDR string. */
export function decodeStdMsgsStringCdr(cdr: Uint8Array): string | null {
  // Encapsulation + u32 length; no CdrLeReader / try/catch on the hot path.
  if (cdr.length < 8 || cdr[1] !== 1) return null;
  const n =
    (cdr[4]! | (cdr[5]! << 8) | (cdr[6]! << 16) | (cdr[7]! << 24)) >>> 0;
  if (n === 0) return "";
  if (8 + n > cdr.length) return null;
  return td.decode(cdr.subarray(8, 8 + n - 1));
}

/** PointCloud2: metadata plus a view of `data` into `cdr`. */
export function decodePointCloud2Cdr(cdr: Uint8Array): PointCloud2 | null {
  try {
    const r = new CdrLeReader(cdr);
    const stampSec = r.i32();
    const stampNanosec = r.u32();
    const frameId = r.str();
    const height = r.u32();
    const width = r.u32();
    const fieldCount = r.u32();
    const fields: PointCloud2["fields"] = [];
    for (let i = 0; i < fieldCount; i++) {
      fields.push({
        name: r.str(),
        offset: r.u32(),
        datatype: r.u8(),
        count: r.u32(),
      });
    }
    const isBigendian = r.bool();
    const pointStep = r.u32();
    const rowStep = r.u32();
    const data = r.byteSeq();
    const isDense = r.bool();
    return {
      stampSec,
      stampNanosec,
      frameId,
      height,
      width,
      fields,
      isBigendian,
      pointStep,
      rowStep,
      isDense,
      data,
    };
  } catch {
    return null;
  }
}
