import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Code2, Server } from "lucide-react";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [{ title: "rclweb · docs" }],
  }),
});

const cards = [
  {
    to: "typescript" as const,
    title: "How to",
    description: "Install rcl-web, construct a Node, then publish, subscribe, and run services or actions.",
    icon: BookOpen,
  },
  {
    to: "api" as const,
    title: "API reference",
    description: "Every public method. Names and QoS follow rclcpp.",
    icon: Code2,
  },
  {
    to: "deploy" as const,
    title: "Deploy",
    description: "Run rclwebd on the machine that can see the ROS 2 graph — apt, ros2 run, or systemd.",
    icon: Server,
  },
];

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--color-fd-primary)_0%,_transparent_55%)] opacity-[0.08] dark:opacity-[0.16]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--color-fd-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-fd-border)_1px,transparent_1px)] bg-size-[48px_48px] mask-[radial-gradient(ellipse_at_center,black_20%,transparent_70%)] opacity-40"
        />

        <section className="relative mx-auto max-w-5xl px-6 pt-20 pb-12 md:pt-28 md:pb-16">
          <p className="mb-4 text-sm font-medium tracking-wide text-fd-muted-foreground uppercase">
            Docs
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-fd-foreground md:text-6xl">
            Browser access to ROS 2
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-fd-muted-foreground md:text-xl">
            Install <code className="rounded-md bg-fd-secondary px-1.5 py-0.5 text-[0.95em]">rcl-web</code>,
            run <code className="rounded-md bg-fd-secondary px-1.5 py-0.5 text-[0.95em]">rclwebd</code>{" "}
            on the machine that can see the graph, then use{" "}
            <code className="rounded-md bg-fd-secondary px-1.5 py-0.5 text-[0.95em]">Node</code> the way
            you use rclcpp.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/docs/$"
              params={{ _splat: "typescript" }}
              className="inline-flex items-center rounded-xl bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              Start with How to
            </Link>
            <Link
              to="/docs/$"
              params={{ _splat: "api" }}
              className="inline-flex items-center rounded-xl border border-fd-border bg-fd-card px-5 py-2.5 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
            >
              API reference
            </Link>
          </div>
        </section>

        <section className="relative mx-auto grid max-w-5xl gap-4 px-6 pb-20 md:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.to}
                to="/docs/$"
                params={{ _splat: card.to }}
                className="group rounded-2xl border border-fd-border bg-fd-card/80 p-5 shadow-sm backdrop-blur-sm transition-colors hover:border-fd-primary/40 hover:bg-fd-accent/40"
              >
                <Icon className="mb-4 size-5 text-fd-primary" />
                <h2 className="text-base font-semibold text-fd-foreground">{card.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">
                  {card.description}
                </p>
              </Link>
            );
          })}
        </section>

        <section className="relative mx-auto max-w-5xl px-6 pb-24">
          <div className="overflow-hidden rounded-2xl border border-fd-border bg-fd-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-fd-border px-4 py-2.5 text-xs text-fd-muted-foreground">
              <span className="size-2.5 rounded-full bg-fd-border" />
              <span className="size-2.5 rounded-full bg-fd-border" />
              <span className="size-2.5 rounded-full bg-fd-border" />
              <span className="ml-2">from the how-to</span>
            </div>
            <pre className="overflow-x-auto p-5 text-sm leading-7 text-fd-foreground">
              <code>{`import { init, Node, std_msgs } from "rcl-web";

await init();
const node = new Node("talker");
const pub = node.createPublisher(std_msgs.msg.String, "chatter", 10);
const out = new std_msgs.msg.String();
out.data = "hello from the browser";
pub.publish(out);`}</code>
            </pre>
          </div>
        </section>
      </div>
    </HomeLayout>
  );
}
