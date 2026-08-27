import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen, Code2, Server } from "lucide-react";

const snippet = (
  <code>
    <span className="home-kw">import</span>
    {" { init, Node, std_msgs } "}
    <span className="home-kw">from</span> <span className="home-str">"rcl-web"</span>;
    {"\n\n"}
    <span className="home-kw">await</span> <span className="home-fn">init</span>();
    {"\n"}
    <span className="home-kw">const</span> node = <span className="home-kw">new</span>{" "}
    <span className="home-fn">Node</span>(<span className="home-str">"talker"</span>);
    {"\n"}
    <span className="home-kw">const</span> pub = node.
    <span className="home-fn">createPublisher</span>(std_msgs.msg.String,{" "}
    <span className="home-str">"chatter"</span>, <span className="home-num">10</span>);
    {"\n"}
    <span className="home-kw">const</span> out = <span className="home-kw">new</span> std_msgs.msg.
    <span className="home-fn">String</span>();
    {"\n"}
    out.data = <span className="home-str">"hello from the browser"</span>;
    {"\n"}
    pub.<span className="home-fn">publish</span>(out);
  </code>
);

const path = [
  { step: "01", name: "Browser · rcl-web", to: "typescript" },
  { step: "02", name: "R2WP / CDR", to: "architecture" },
  { step: "03", name: "Edge · rclwebd", to: "deploy" },
  { step: "04", name: "ROS 2", to: "architecture" },
] as const;

const cards = [
  {
    to: "typescript" as const,
    title: "How to",
    go: "Install and connect",
    description: "Install rcl-web, construct a Node, then publish, subscribe, and run services or actions.",
    icon: BookOpen,
  },
  {
    to: "api" as const,
    title: "API reference",
    go: "Every public method",
    description: "Names and QoS follow rclcpp. Look up init, Node, topics, services, and actions.",
    icon: Code2,
  },
  {
    to: "deploy" as const,
    title: "Deploy",
    go: "Run the edge process",
    description: "rclwebd on the machine that can see the ROS 2 graph — apt, ros2 run, or systemd.",
    icon: Server,
  },
];

export function HomePage() {
  return (
    <div className="home">
      <section className="home-hero">
        <div>
          <p className="home-kicker">rclweb docs</p>
          <h1 className="home-title">
            Browser access
            <br />
            to ROS 2
          </h1>
          <p className="home-lead">
            Install <code>rcl-web</code>, run <code>rclwebd</code> on the machine that can
            see the graph, then use <code>Node</code> the way you use rclcpp.
          </p>
          <div className="home-actions">
            <Link to="/docs/$" params={{ _splat: "typescript" }} className="home-btn home-btn-primary">
              Start with How to
            </Link>
            <Link to="/docs/$" params={{ _splat: "api" }} className="home-btn home-btn-ghost">
              API reference
            </Link>
          </div>
        </div>

        <div className="home-panel" aria-label="Snippet from the how-to">
          <div className="home-panel-bar">
            <span className="home-dot" />
            <span className="home-dot" />
            <span className="home-dot" />
            <span>from the how-to</span>
          </div>
          <pre>{snippet}</pre>
        </div>
      </section>

      <ol className="home-path">
        {path.map((item) => (
          <li key={item.step}>
            <Link to="/docs/$" params={{ _splat: item.to }}>
              <span className="home-path-step">{item.step}</span>
              <span className="home-path-name">{item.name}</span>
            </Link>
          </li>
        ))}
      </ol>

      <section className="home-cards">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.to} to="/docs/$" params={{ _splat: card.to }} className="home-card">
              <span className="home-card-icon">
                <Icon size={16} />
              </span>
              <h2>{card.title}</h2>
              <p>{card.description}</p>
              <span className="home-card-go">
                {card.go} <ArrowUpRight size={14} className="inline-block" />
              </span>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
