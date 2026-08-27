import { expect, test } from "bun:test";
import { fieldStars, GRAPH_EDGES, GRAPH_NODES } from "./graph-nodes";

test("every interactive node has a docs slug", () => {
  const slugs = new Set(GRAPH_NODES.map((node) => node.to));
  expect(slugs.has("typescript")).toBe(true);
  expect(slugs.has("api")).toBe(true);
  expect(slugs.has("deploy")).toBe(true);
  expect(slugs.has("architecture")).toBe(true);
});

test("edge ends name real nodes", () => {
  const ids = new Set(GRAPH_NODES.map((node) => node.id));
  for (const edge of GRAPH_EDGES) {
    expect(ids.has(edge.from)).toBe(true);
    expect(ids.has(edge.to)).toBe(true);
  }
});

test("field stars are stable and miss the live nodes", () => {
  const a = fieldStars(72);
  expect(a).toEqual(fieldStars(72));
  expect(a.length).toBeGreaterThan(30);
  for (const star of a) {
    for (const node of GRAPH_NODES) {
      expect((node.x - star.x) ** 2 + (node.y - star.y) ** 2).toBeGreaterThanOrEqual(40 ** 2);
    }
  }
});
