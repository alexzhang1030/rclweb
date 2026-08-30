export type GraphNodeId = "browser" | "api" | "wire" | "edge" | "ros";

export type GraphNode = {
  id: GraphNodeId;
  x: number;
  y: number;
  label: string;
  hint: string;
  to: "typescript" | "api" | "protocol/r2wp" | "deploy" | "architecture";
};

export const GRAPH_WIDTH = 1000;
export const GRAPH_HEIGHT = 560;

export const GRAPH_NODES: readonly GraphNode[] = [
  { id: "browser", x: 150, y: 300, label: "rcl-web", hint: "How to", to: "typescript" },
  { id: "api", x: 270, y: 150, label: "Node", hint: "API", to: "api" },
  { id: "wire", x: 430, y: 240, label: "R2WP", hint: "Protocol", to: "protocol/r2wp" },
  { id: "edge", x: 680, y: 320, label: "rclwebd", hint: "Deploy", to: "deploy" },
  { id: "ros", x: 880, y: 180, label: "ROS 2", hint: "Graph", to: "architecture" },
];

export const GRAPH_EDGES: readonly { from: GraphNodeId; to: GraphNodeId; d: string }[] = [
  { from: "browser", to: "api", d: "M150,300 C160,220 220,160 270,150" },
  { from: "browser", to: "wire", d: "M150,300 C260,300 320,240 430,240" },
  { from: "wire", to: "edge", d: "M430,240 C530,240 580,320 680,320" },
  { from: "edge", to: "ros", d: "M680,320 C780,320 820,180 880,180" },
];

export function fieldStars(count: number): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = [];
  let seed = 0x9e3779b9;
  for (let i = 0; i < count; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const x = 24 + (seed % (GRAPH_WIDTH - 48));
    const y = 24 + ((seed >>> 10) % (GRAPH_HEIGHT - 48));
    const r = 1.1 + ((seed >>> 20) % 18) / 10;
    const near = GRAPH_NODES.some((node) => (node.x - x) ** 2 + (node.y - y) ** 2 < 40 ** 2);
    if (near) continue;
    out.push({ x, y, r });
  }
  return out;
}
