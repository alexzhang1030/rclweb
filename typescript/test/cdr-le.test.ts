import { expect, test } from "bun:test";
import path from "node:path";
import {
  decodeGeneratedCdr,
  decodeStdMsgsStringCdr,
} from "../src/cdr-le.ts";
import {
  Collections,
  EchoNested_Request,
  EchoNested_Response,
  MeasureSequence_Feedback,
  MeasureSequence_Goal,
  MeasureSequence_Result,
  NestedSample,
  PrimitiveScalars,
} from "../src/interfaces.ts";

const corpus = path.join(import.meta.dir, "../../conformance/cdr/fixtures");

async function readBin(...parts: string[]): Promise<Uint8Array> {
  const file = Bun.file(path.join(corpus, ...parts));
  return new Uint8Array(await file.arrayBuffer());
}

function stringCdr(text: string): Uint8Array {
  const payload = new TextEncoder().encode(text);
  const n = payload.length + 1;
  const out = new Uint8Array(8 + n);
  out[1] = 1;
  out[4] = n & 0xff;
  out[5] = (n >>> 8) & 0xff;
  out[6] = (n >>> 16) & 0xff;
  out[7] = (n >>> 24) & 0xff;
  out.set(payload, 8);
  return out;
}

test("decodeStdMsgsStringCdr reads LE CDR without a reader object", () => {
  expect(decodeStdMsgsStringCdr(stringCdr("hello-from-fixture"))).toBe(
    "hello-from-fixture",
  );
  expect(decodeStdMsgsStringCdr(stringCdr(""))).toBe("");
  expect(decodeStdMsgsStringCdr(new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0]))).toBe(
    "",
  );
});

test("decodeStdMsgsStringCdr rejects truncated or non-LE payloads", () => {
  expect(decodeStdMsgsStringCdr(new Uint8Array([0, 1, 0, 0]))).toBeNull();
  expect(decodeStdMsgsStringCdr(stringCdr("hi").subarray(0, 9))).toBeNull();
  const be = stringCdr("hi");
  be[1] = 0;
  expect(decodeStdMsgsStringCdr(be)).toBeNull();
});

test("decodeGeneratedCdr reads J-FT PrimitiveScalars including tail slack and wstring", async () => {
  const cdr = await readBin("J-FT", "primitive_scalars.bin");
  expect(cdr.byteLength).toBe(104);
  const msg = decodeGeneratedCdr(PrimitiveScalars.typeName, cdr);
  expect(msg).toBeInstanceOf(PrimitiveScalars);
  if (!(msg instanceof PrimitiveScalars)) throw new Error("expected scalars");
  expect(msg.bool_value).toBe(true);
  expect(msg.byte_value).toBe(165);
  expect(msg.char_value).toBe(90);
  expect(msg.float32_value).toBe(-12.5);
  expect(msg.float64_value).toBe(12345.125);
  expect(msg.int8_value).toBe(-120);
  expect(msg.uint8_value).toBe(250);
  expect(msg.int16_value).toBe(-32000);
  expect(msg.uint16_value).toBe(65000);
  expect(msg.int32_value).toBe(-2000000000);
  expect(msg.uint32_value).toBe(4000000000);
  expect(msg.int64_value).toBe(-9000000000000000000n);
  expect(msg.uint64_value).toBe(18000000000000000000n);
  expect(msg.string_value).toBe("rclweb CDR ✓!!");
  expect(msg.wstring_value).toBe("月面CDR");
});

test("decodeGeneratedCdr reads exact Cyclone PrimitiveScalars (no tail)", async () => {
  const cdr = await readBin("J-CY", "primitive_scalars.bin");
  const msg = decodeGeneratedCdr(PrimitiveScalars.typeName, cdr);
  expect(msg).toBeInstanceOf(PrimitiveScalars);
  if (!(msg instanceof PrimitiveScalars)) throw new Error("expected scalars");
  expect(msg.wstring_value).toBe("月面CDR");
  expect(msg.int64_value).toBe(-9000000000000000000n);
});

test("decodeGeneratedCdr rejects big-endian PrimitiveScalars", async () => {
  const cdr = await readBin("J-FT", "primitive_scalars_big_endian.bin");
  expect(decodeGeneratedCdr(PrimitiveScalars.typeName, cdr)).toBeNull();
});

test("decodeGeneratedCdr reads J-FT Collections bounds and byte view", async () => {
  const cdr = await readBin("J-FT", "collections.bin");
  const msg = decodeGeneratedCdr(Collections.typeName, cdr);
  expect(msg).toBeInstanceOf(Collections);
  if (!(msg instanceof Collections)) throw new Error("expected collections");
  expect(msg.fixed_i32).toEqual([-2147483648, 0, 2147483647]);
  expect(msg.bounded_f64).toEqual([-1.25, 0, 3.5, 1024.125]);
  expect([...msg.bytes_value]).toEqual([0, 1, 127, 128, 255]);
  expect(msg.bytes_value.buffer).toBe(cdr.buffer);
  expect(msg.bounded_string).toBe("0123456789abcdef");
  expect(msg.bounded_wstring).toBe("0123456789abcdef");
});

test("decodeGeneratedCdr reads J-FT NestedSample", async () => {
  const cdr = await readBin("J-FT", "nested_sample.bin");
  const msg = decodeGeneratedCdr(NestedSample.typeName, cdr);
  expect(msg).toBeInstanceOf(NestedSample);
  if (!(msg instanceof NestedSample)) throw new Error("expected nested");
  expect(msg.stamp.sec).toBe(1700000000);
  expect(msg.stamp.nanosec).toBe(123456789);
  expect(msg.scalars.string_value).toBe("rclweb CDR ✓!!");
  expect(msg.scalars.wstring_value).toBe("月面CDR");
  expect(msg.collections.bounded_string).toBe("0123456789abcdef");
  expect([...msg.collections.bytes_value]).toEqual([0, 1, 127, 128, 255]);
});

test("CdrLeReader aligns 8-byte members from the body origin", async () => {
  const cdr = await readBin("J-FT", "primitive_scalars.bin");
  // bool+byte+char+pad+f32 ends at 12. Body-relative align-8 is already
  // satisfied (12 - 4 == 8); absolute align-8 would skip to 16 and miss 12345.125.
  const msg = decodeGeneratedCdr(PrimitiveScalars.typeName, cdr);
  expect(msg).toBeInstanceOf(PrimitiveScalars);
  if (!(msg instanceof PrimitiveScalars)) throw new Error("expected scalars");
  expect(msg.float64_value).toBe(12345.125);
});

test("decodeGeneratedCdr returns null for unknown types and truncated CDR", async () => {
  const cdr = await readBin("J-FT", "primitive_scalars.bin");
  expect(decodeGeneratedCdr("std_msgs/msg/String", cdr)).toBeNull();
  expect(decodeGeneratedCdr(PrimitiveScalars.typeName, cdr.subarray(0, 8))).toBeNull();
});

test("decodeGeneratedCdr reads J-FT EchoNested request and response", async () => {
  const requestCdr = await readBin("J-FT", "echo_nested_request.bin");
  const request = decodeGeneratedCdr(EchoNested_Request.typeName, requestCdr);
  expect(request).toBeInstanceOf(EchoNested_Request);
  if (!(request instanceof EchoNested_Request)) throw new Error("expected request");
  expect(request.input.scalars.string_value).toBe("rclweb CDR ✓!!");
  expect(request.input.collections.bytes_value.buffer).toBe(requestCdr.buffer);

  const responseCdr = await readBin("J-FT", "echo_nested_response.bin");
  const response = decodeGeneratedCdr(EchoNested_Response.typeName, responseCdr);
  expect(response).toBeInstanceOf(EchoNested_Response);
  if (!(response instanceof EchoNested_Response)) throw new Error("expected response");
  expect(response.accepted).toBe(true);
  expect(response.output.scalars.string_value).toBe("rclweb CDR ✓!!");
});

test("decodeGeneratedCdr reads J-FT MeasureSequence sections", async () => {
  const goalCdr = await readBin("J-FT", "measure_sequence_goal.bin");
  const goal = decodeGeneratedCdr(MeasureSequence_Goal.typeName, goalCdr);
  expect(goal).toBeInstanceOf(MeasureSequence_Goal);
  if (!(goal instanceof MeasureSequence_Goal)) throw new Error("expected goal");
  expect(goal.target.bytes_value.buffer).toBe(goalCdr.buffer);

  const resultCdr = await readBin("J-FT", "measure_sequence_result.bin");
  const result = decodeGeneratedCdr(MeasureSequence_Result.typeName, resultCdr);
  expect(result).toBeInstanceOf(MeasureSequence_Result);
  if (!(result instanceof MeasureSequence_Result)) throw new Error("expected result");
  expect(result.result.scalars.string_value).toBe("rclweb CDR ✓!!");

  const feedbackCdr = await readBin("J-FT", "measure_sequence_feedback.bin");
  const feedback = decodeGeneratedCdr(MeasureSequence_Feedback.typeName, feedbackCdr);
  expect(feedback).toBeInstanceOf(MeasureSequence_Feedback);
  if (!(feedback instanceof MeasureSequence_Feedback)) {
    throw new Error("expected feedback");
  }
  expect(typeof feedback.progress).toBe("number");
  expect(feedback.sample.scalars.string_value).toBe("rclweb CDR ✓!!");
});
