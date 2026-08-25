/**
 * Little-endian CDR1 reader for host-retained sample bodies (ADR 0017).
 *
 * Wasm still owns R2WP and session. String, PointCloud2, and the three
 * generated corpus msg roots decode from the JS WebSocket buffer so
 * PointCloud2 `data` / Collections `bytes_value` are views of that
 * buffer, not a wasm memcpy. Service/action codecs stay in wasm.
 */

import {
  Collections,
  NestedSample,
  PrimitiveScalars,
  Time,
} from "./interfaces.ts";
import type { PointCloud2 } from "./types.ts";

export type GeneratedCdrMsg = PrimitiveScalars | NestedSample | Collections;

const td = new TextDecoder();

export class CdrLeReader {
  #view: DataView | null = null;

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

  /** CDR1 alignment is from the body origin (after the 4-byte header). */
  private align(n: number): void {
    const rem = (this.o - 4) % n;
    if (rem !== 0) this.o += n - rem;
  }

  private align4(): void {
    this.align(4);
  }

  private view(): DataView {
    if (!this.#view) {
      this.#view = new DataView(
        this.buf.buffer,
        this.buf.byteOffset,
        this.buf.byteLength,
      );
    }
    return this.#view;
  }

  u8(): number {
    this.need(1);
    return this.buf[this.o++]!;
  }

  i8(): number {
    return (this.u8() << 24) >> 24;
  }

  u16(): number {
    this.align(2);
    this.need(2);
    const v = this.view().getUint16(this.o, true);
    this.o += 2;
    return v;
  }

  i16(): number {
    this.align(2);
    this.need(2);
    const v = this.view().getInt16(this.o, true);
    this.o += 2;
    return v;
  }

  u32(): number {
    this.align4();
    this.need(4);
    const v = this.view().getUint32(this.o, true);
    this.o += 4;
    return v;
  }

  i32(): number {
    return this.u32() | 0;
  }

  u64(): bigint {
    this.align(8);
    this.need(8);
    const v = this.view().getBigUint64(this.o, true);
    this.o += 8;
    return v;
  }

  i64(): bigint {
    this.align(8);
    this.need(8);
    const v = this.view().getBigInt64(this.o, true);
    this.o += 8;
    return v;
  }

  f32(): number {
    this.align4();
    this.need(4);
    const v = this.view().getFloat32(this.o, true);
    this.o += 4;
    return v;
  }

  f64(): number {
    this.align(8);
    this.need(8);
    const v = this.view().getFloat64(this.o, true);
    this.o += 8;
    return v;
  }

  bool(): boolean {
    const b = this.u8();
    if (b > 1) throw new Error("invalid CDR boolean");
    return b !== 0;
  }

  str(maxBytes?: number): string {
    const n = this.u32();
    if (n === 0) return "";
    this.need(n);
    if (this.buf[this.o + n - 1] !== 0) {
      throw new Error("missing CDR string terminator");
    }
    const payload = n - 1;
    if (maxBytes !== undefined && payload > maxBytes) {
      throw new Error("CDR string exceeds bound");
    }
    const bytes = this.buf.subarray(this.o, this.o + payload);
    this.o += n;
    return td.decode(bytes);
  }

  /**
   * ROS 2 / Fast-CDR legacy wstring: UInt32 slot count N, then N × 4
   * little-endian Unicode scalars ([docs/runtime/cdr.md](../../docs/runtime/cdr.md)).
   */
  wstring(maxScalars?: number): string {
    const n = this.u32();
    if (maxScalars !== undefined && n > maxScalars) {
      throw new Error("CDR wstring exceeds bound");
    }
    const payload = n * 4;
    this.need(payload);
    let out = "";
    const view = this.view();
    for (let i = 0; i < n; i++) {
      const slot = view.getUint32(this.o + i * 4, true);
      if (!isAcceptedWstringScalar(slot)) {
        throw new Error("invalid CDR wstring scalar");
      }
      out += String.fromCodePoint(slot);
    }
    this.o += payload;
    return out;
  }

  byteSeq(): Uint8Array {
    const n = this.u32();
    this.need(n);
    const view = this.buf.subarray(this.o, this.o + n);
    this.o += n;
    return view;
  }
}

function isAcceptedWstringScalar(slot: number): boolean {
  return slot <= 0xd7ff || (slot >= 0xe000 && slot <= 0x10ffff);
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

/** Phase 1 generated msg roots. Returns null when the payload is not that type. */
export function decodeGeneratedCdr(
  typeName: string,
  cdr: Uint8Array,
): GeneratedCdrMsg | null {
  try {
    const r = new CdrLeReader(cdr);
    if (typeName === PrimitiveScalars.typeName) {
      return readPrimitiveScalars(r);
    }
    if (typeName === Collections.typeName) {
      return readCollections(r);
    }
    if (typeName === NestedSample.typeName) {
      return readNestedSample(r);
    }
    return null;
  } catch {
    return null;
  }
}

function readPrimitiveScalars(r: CdrLeReader): PrimitiveScalars {
  const msg = new PrimitiveScalars();
  msg.bool_value = r.bool();
  msg.byte_value = r.u8();
  msg.char_value = r.u8();
  msg.float32_value = r.f32();
  msg.float64_value = r.f64();
  msg.int8_value = r.i8();
  msg.uint8_value = r.u8();
  msg.int16_value = r.i16();
  msg.uint16_value = r.u16();
  msg.int32_value = r.i32();
  msg.uint32_value = r.u32();
  msg.int64_value = r.i64();
  msg.uint64_value = r.u64();
  msg.string_value = r.str();
  msg.wstring_value = r.wstring();
  return msg;
}

function readCollections(r: CdrLeReader): Collections {
  const msg = new Collections();
  msg.fixed_i32 = [r.i32(), r.i32(), r.i32()];
  const f64Len = r.u32();
  if (f64Len > 4) throw new Error("bounded_f64 exceeds 4");
  msg.bounded_f64 = [];
  for (let i = 0; i < f64Len; i++) {
    msg.bounded_f64.push(r.f64());
  }
  msg.bytes_value = r.byteSeq();
  msg.bounded_string = r.str(16);
  msg.bounded_wstring = r.wstring(16);
  return msg;
}

function readNestedSample(r: CdrLeReader): NestedSample {
  const msg = new NestedSample();
  msg.stamp = new Time();
  msg.stamp.sec = r.i32();
  msg.stamp.nanosec = r.u32();
  msg.scalars = readPrimitiveScalars(r);
  msg.collections = readCollections(r);
  return msg;
}
