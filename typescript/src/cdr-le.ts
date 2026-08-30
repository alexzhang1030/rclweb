/**
 * Little-endian CDR1 reader for host-retained sample bodies (ADR 0017).
 *
 * Wasm still owns R2WP and session. String, PointCloud2, generated corpus
 * msg roots, and generated service/action sections decode from the JS
 * WebSocket buffer so PointCloud2 `data` / Collections `bytes_value` are
 * views of that buffer, not a wasm memcpy.
 */

import {
  GENERATED_LAYOUTS,
  GENERATED_TYPE_NAMES,
  createGenerated,
  type GeneratedLayoutField,
} from "./interfaces.generated.ts";
import {
  Collections,
  EchoNested_Request,
  EchoNested_Response,
  MeasureSequence_Feedback,
  MeasureSequence_Goal,
  MeasureSequence_Result,
  NestedSample,
  PrimitiveScalars,
  Time,
} from "./interfaces.ts";
import type { PointCloud2 } from "./types.ts";

export type GeneratedCdrMsg = object;

export type GeneratedCdrValue = object;

export function isGeneratedCdrMsg(
  value: GeneratedCdrValue | null,
): value is GeneratedCdrMsg {
  if (value == null || typeof value !== "object") return false;
  const typeName = (value.constructor as { typeName?: string }).typeName;
  return typeof typeName === "string" && GENERATED_TYPE_NAMES.has(typeName);
}

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

/**
 * Phase 1 generated msg roots and service/action sections.
 * Returns null when the payload is not that type.
 */
export function decodeGeneratedCdr(
  typeName: string,
  cdr: Uint8Array,
): GeneratedCdrValue | null {
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
    if (typeName === EchoNested_Request.typeName) {
      const msg = new EchoNested_Request();
      msg.input = readNestedSample(r);
      return msg;
    }
    if (typeName === EchoNested_Response.typeName) {
      const msg = new EchoNested_Response();
      msg.output = readNestedSample(r);
      msg.accepted = r.bool();
      return msg;
    }
    if (typeName === MeasureSequence_Goal.typeName) {
      const msg = new MeasureSequence_Goal();
      msg.target = readCollections(r);
      return msg;
    }
    if (typeName === MeasureSequence_Result.typeName) {
      const msg = new MeasureSequence_Result();
      msg.result = readNestedSample(r);
      return msg;
    }
    if (typeName === MeasureSequence_Feedback.typeName) {
      const msg = new MeasureSequence_Feedback();
      msg.progress = r.f32();
      msg.sample = readNestedSample(r);
      return msg;
    }
    return readCatalogCdr(typeName, r);
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

const te = new TextEncoder();

export class CdrLeWriter {
  #buf: number[] = [0, 1, 0, 0];
  #o = 4;

  private pad(n: number): void {
    const rem = (this.#o - 4) % n;
    if (rem === 0) return;
    const add = n - rem;
    for (let i = 0; i < add; i++) this.#buf.push(0);
    this.#o += add;
  }

  private writeAligned(n: number, write: (view: DataView) => void): void {
    this.pad(n);
    const tmp = new ArrayBuffer(n);
    write(new DataView(tmp));
    const bytes = new Uint8Array(tmp);
    for (let i = 0; i < bytes.length; i++) this.#buf.push(bytes[i]!);
    this.#o += bytes.length;
  }

  u8(v: number): void {
    this.#buf.push(v & 0xff);
    this.#o += 1;
  }

  i8(v: number): void {
    this.u8(v);
  }

  u16(v: number): void {
    this.writeAligned(2, (view) => view.setUint16(0, v, true));
  }

  i16(v: number): void {
    this.writeAligned(2, (view) => view.setInt16(0, v, true));
  }

  u32(v: number): void {
    this.writeAligned(4, (view) => view.setUint32(0, v, true));
  }

  i32(v: number): void {
    this.writeAligned(4, (view) => view.setInt32(0, v, true));
  }

  u64(v: bigint | number): void {
    this.writeAligned(8, (view) => view.setBigUint64(0, toBigUint(v), true));
  }

  i64(v: bigint | number): void {
    this.writeAligned(8, (view) => view.setBigInt64(0, toBigInt(v), true));
  }

  f32(v: number): void {
    this.writeAligned(4, (view) => view.setFloat32(0, v, true));
  }

  f64(v: number): void {
    this.writeAligned(8, (view) => view.setFloat64(0, v, true));
  }

  bool(v: boolean): void {
    this.u8(v ? 1 : 0);
  }

  str(value: string, maxBytes?: number): void {
    const bytes = te.encode(value);
    if (maxBytes !== undefined && bytes.length > maxBytes) {
      throw new Error("CDR string exceeds bound");
    }
    this.u32(bytes.length + 1);
    for (let i = 0; i < bytes.length; i++) this.#buf.push(bytes[i]!);
    this.#buf.push(0);
    this.#o += bytes.length + 1;
  }

  wstring(value: string, maxScalars?: number): void {
    const scalars = [...value].map((ch) => ch.codePointAt(0)!);
    if (maxScalars !== undefined && scalars.length > maxScalars) {
      throw new Error("CDR wstring exceeds bound");
    }
    this.u32(scalars.length);
    for (const slot of scalars) {
      if (!isAcceptedWstringScalar(slot)) {
        throw new Error("invalid CDR wstring scalar");
      }
      this.u32(slot);
    }
  }

  byteSeq(bytes: Uint8Array): void {
    this.u32(bytes.length);
    for (let i = 0; i < bytes.length; i++) this.#buf.push(bytes[i]!);
    this.#o += bytes.length;
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.#buf);
  }
}

function toBigInt(value: bigint | number | undefined): bigint {
  if (typeof value === "bigint") return value;
  return BigInt(value ?? 0);
}

function toBigUint(value: bigint | number | undefined): bigint {
  const n = toBigInt(value);
  return n < 0n ? 0n : n;
}

function isBytePrim(prim: string): boolean {
  return prim === "uint8" || prim === "byte";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function writePrim(w: CdrLeWriter, prim: string, value: unknown): void {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  switch (prim) {
    case "bool":
      w.bool(Boolean(value));
      return;
    case "byte":
    case "char":
    case "uint8":
      w.u8(n);
      return;
    case "int8":
      w.i8(n);
      return;
    case "uint16":
      w.u16(n);
      return;
    case "int16":
      w.i16(n);
      return;
    case "uint32":
      w.u32(n);
      return;
    case "int32":
      w.i32(n);
      return;
    case "uint64":
      w.u64(value as bigint | number);
      return;
    case "int64":
      w.i64(value as bigint | number);
      return;
    case "float32":
      w.f32(n);
      return;
    case "float64":
      w.f64(n);
      return;
    default:
      throw new Error(`unsupported primitive ${prim}`);
  }
}

function readPrim(r: CdrLeReader, prim: string): unknown {
  switch (prim) {
    case "bool":
      return r.bool();
    case "byte":
    case "char":
    case "uint8":
      return r.u8();
    case "int8":
      return r.i8();
    case "uint16":
      return r.u16();
    case "int16":
      return r.i16();
    case "uint32":
      return r.u32();
    case "int32":
      return r.i32();
    case "uint64":
      return r.u64();
    case "int64":
      return r.i64();
    case "float32":
      return r.f32();
    case "float64":
      return r.f64();
    default:
      throw new Error(`unsupported primitive ${prim}`);
  }
}

function writeLayoutField(w: CdrLeWriter, field: GeneratedLayoutField, value: unknown): void {
  const writeOne = (item: unknown) => {
    if (field.kind === "prim") {
      writePrim(w, field.prim, item);
      return;
    }
    if (field.kind === "str") {
      const text = typeof item === "string" ? item : String(item ?? "");
      if (field.wide) w.wstring(text, field.bound);
      else w.str(text, field.bound);
      return;
    }
    writeCatalogObject(w, field.typeName, item);
  };

  if (field.array.kind === "none") {
    writeOne(value);
    return;
  }
  if (field.kind === "prim" && isBytePrim(field.prim)) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array();
    if (field.array.kind === "fixed") {
      if (bytes.length !== field.array.size) {
        const padded = new Uint8Array(field.array.size);
        padded.set(bytes.subarray(0, field.array.size));
        for (let i = 0; i < padded.length; i++) w.u8(padded[i]!);
        return;
      }
      for (let i = 0; i < field.array.size; i++) w.u8(bytes[i]!);
      return;
    }
    if (field.array.kind === "bounded" && bytes.length > field.array.size) {
      throw new Error(`${field.name} exceeds bound ${field.array.size}`);
    }
    w.byteSeq(bytes);
    return;
  }
  const items = Array.isArray(value) ? value : [];
  if (field.array.kind === "fixed") {
    for (let i = 0; i < field.array.size; i++) writeOne(items[i]);
    return;
  }
  if (field.array.kind === "bounded" && items.length > field.array.size) {
    throw new Error(`${field.name} exceeds bound ${field.array.size}`);
  }
  w.u32(items.length);
  for (const item of items) writeOne(item);
}

function readLayoutField(r: CdrLeReader, field: GeneratedLayoutField): unknown {
  const readOne = (): unknown => {
    if (field.kind === "prim") return readPrim(r, field.prim);
    if (field.kind === "str") {
      return field.wide ? r.wstring(field.bound) : r.str(field.bound);
    }
    return readCatalogCdr(field.typeName, r);
  };

  if (field.array.kind === "none") return readOne();
  if (field.kind === "prim" && isBytePrim(field.prim)) {
    if (field.array.kind === "fixed") {
      const out = new Uint8Array(field.array.size);
      for (let i = 0; i < field.array.size; i++) out[i] = r.u8();
      return out;
    }
    const bytes = r.byteSeq();
    if (field.array.kind === "bounded" && bytes.length > field.array.size) {
      throw new Error(`${field.name} exceeds bound ${field.array.size}`);
    }
    return bytes;
  }
  if (field.array.kind === "fixed") {
    const out: unknown[] = [];
    for (let i = 0; i < field.array.size; i++) out.push(readOne());
    return out;
  }
  const n = r.u32();
  if (field.array.kind === "bounded" && n > field.array.size) {
    throw new Error(`${field.name} exceeds bound ${field.array.size}`);
  }
  const out: unknown[] = [];
  for (let i = 0; i < n; i++) out.push(readOne());
  return out;
}

function writeCatalogObject(w: CdrLeWriter, typeName: string, value: unknown): void {
  const layout = GENERATED_LAYOUTS[typeName];
  if (!layout) throw new Error(`unknown generated type ${typeName}`);
  const rec = asRecord(value);
  for (const field of layout) {
    writeLayoutField(w, field, rec[field.name]);
  }
}

function readCatalogCdr(typeName: string, r: CdrLeReader): object | null {
  const layout = GENERATED_LAYOUTS[typeName];
  const created = createGenerated(typeName);
  if (!layout || !created) return null;
  const rec = created as Record<string, unknown>;
  for (const field of layout) {
    rec[field.name] = readLayoutField(r, field);
  }
  return created;
}

export function encodeCatalogCdr(typeName: string, message: unknown): Uint8Array {
  const w = new CdrLeWriter();
  writeCatalogObject(w, typeName, message);
  return w.finish();
}
