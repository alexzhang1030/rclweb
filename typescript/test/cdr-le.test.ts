import { expect, test } from "bun:test";
import { decodeStdMsgsStringCdr } from "../src/cdr-le.ts";

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
