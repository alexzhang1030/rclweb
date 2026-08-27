import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  fieldStars,
  GRAPH_EDGES,
  GRAPH_HEIGHT,
  GRAPH_NODES,
  GRAPH_WIDTH,
  type GraphNode,
  type GraphNodeId,
} from "@/lib/graph-nodes";

const stars = fieldStars(72);

function NodeGlyph({ id }: { id: GraphNodeId }) {
  if (id === "browser") {
    return (
      <svg viewBox="0 0 36 32" className="home-chip-glyph" aria-hidden>
        <rect x="2.5" y="6" width="18.6" height="20" rx="5.6" stroke="currentColor" strokeWidth="1.85" fill="none" />
        <circle cx="10.35" cy="16" r="2.95" fill="currentColor" />
        <path d="M13.4 16H26.4" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
        <circle cx="28.85" cy="16" r="2.35" fill="currentColor" />
      </svg>
    );
  }
  if (id === "api") {
    return (
      <svg viewBox="0 0 36 32" className="home-chip-glyph" aria-hidden>
        <path d="M11 8 L6 16 L11 24" stroke="currentColor" strokeWidth="1.85" fill="none" strokeLinecap="round" />
        <path d="M25 8 L30 16 L25 24" stroke="currentColor" strokeWidth="1.85" fill="none" strokeLinecap="round" />
        <circle cx="18" cy="16" r="2.4" fill="currentColor" />
      </svg>
    );
  }
  if (id === "wire") {
    return (
      <svg viewBox="0 0 36 32" className="home-chip-glyph" aria-hidden>
        <rect x="3" y="10" width="10" height="12" rx="3" stroke="currentColor" strokeWidth="1.7" fill="none" />
        <rect x="23" y="10" width="10" height="12" rx="3" stroke="currentColor" strokeWidth="1.7" fill="none" />
        <path d="M13 16H23" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="18" cy="16" r="2" fill="currentColor" />
      </svg>
    );
  }
  if (id === "edge") {
    return (
      <svg viewBox="0 0 36 32" className="home-chip-glyph" aria-hidden>
        <rect x="8" y="7" width="20" height="6" rx="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <rect x="8" y="13.5" width="20" height="6" rx="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <rect x="8" y="20" width="20" height="6" rx="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <circle cx="13" cy="16.5" r="1.4" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 36 32" className="home-chip-glyph" aria-hidden>
      <circle cx="12" cy="12" r="2.3" fill="currentColor" />
      <circle cx="24" cy="12" r="2.3" fill="currentColor" />
      <circle cx="18" cy="22" r="2.3" fill="currentColor" />
      <path d="M12 12L24 12L18 22Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function isOnPath(id: GraphNodeId, active: GraphNodeId): boolean {
  return GRAPH_EDGES.some(
    (edge) =>
      (edge.from === id || edge.to === id) && (edge.from === active || edge.to === active),
  );
}

export function GraphField() {
  const [active, setActive] = useState<GraphNodeId>("browser");
  const current = GRAPH_NODES.find((node) => node.id === active) ?? GRAPH_NODES[0];

  return (
    <div className="home-stage">
      <div
        className="home-graph"
        style={{ aspectRatio: `${GRAPH_WIDTH} / ${GRAPH_HEIGHT}` }}
      >
        <svg
          className="home-graph-svg"
          viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
          role="img"
          aria-label="rcl-web to rclwebd to ROS 2. Click a node."
        >
          {stars.map((star, index) => (
            <g key={index} className="home-star-hit">
              <circle className="home-star-pad" cx={star.x} cy={star.y} r="7.5" />
              <circle className="home-star" cx={star.x} cy={star.y} r={star.r} />
            </g>
          ))}
          {GRAPH_EDGES.map((edge, index) => {
            const lit = edge.from === active || edge.to === active;
            return (
              <g key={`${edge.from}-${edge.to}`}>
                <path className={lit ? "home-wire is-on" : "home-wire"} d={edge.d} />
                <circle className="home-packet" r="3.2">
                  <animateMotion
                    dur="5.2s"
                    repeatCount="indefinite"
                    begin={`${-1.3 * index}s`}
                    path={edge.d}
                  />
                </circle>
              </g>
            );
          })}
          {GRAPH_NODES.map((node) => {
            const on = node.id === active;
            const near = on || isOnPath(node.id, active);
            return (
              <g
                key={node.id}
                className={on ? "home-node is-on" : near ? "home-node is-near" : "home-node"}
              >
                <circle className="home-node-halo" cx={node.x} cy={node.y} r="28" />
                <circle className="home-node-ring" cx={node.x} cy={node.y} r="16" />
                <circle className="home-node-core" cx={node.x} cy={node.y} r="6.5" />
                <text className="home-node-name" x={node.x} y={node.y + 34} textAnchor="middle">
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {GRAPH_NODES.map((node) => (
          <Link
            key={node.id}
            to="/docs/$"
            params={{ _splat: node.to }}
            className={node.id === active ? "home-hotspot is-on" : "home-hotspot"}
            style={{
              left: `${(node.x / GRAPH_WIDTH) * 100}%`,
              top: `${(node.y / GRAPH_HEIGHT) * 100}%`,
            }}
            aria-label={`${node.label}. ${node.hint}`}
            onMouseEnter={() => setActive(node.id)}
            onFocus={() => setActive(node.id)}
          />
        ))}

        <Chip node={current} />
      </div>
    </div>
  );
}

function Chip({ node }: { node: GraphNode }) {
  const left = Math.min(78, Math.max(6, (node.x / GRAPH_WIDTH) * 100));
  const top = Math.min(76, (node.y / GRAPH_HEIGHT) * 100 + 10);

  return (
    <Link
      to="/docs/$"
      params={{ _splat: node.to }}
      className="home-chip"
      style={{ left: `${left}%`, top: `${top}%` }}
    >
      <span className="home-chip-mark">
        <NodeGlyph id={node.id} />
      </span>
      <span className="home-chip-copy">
        <strong>{node.label}</strong>
        <em>{node.hint}</em>
      </span>
    </Link>
  );
}
