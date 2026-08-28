import { expect, test } from "bun:test";
import { nitroPreset } from "./nitro-preset";

test("Vercel builds emit the vercel preset", () => {
  expect(nitroPreset({ VERCEL: "1" })).toBe("vercel");
});

test("local and just website-check keep the Node server", () => {
  expect(nitroPreset({})).toBe("node-server");
});
