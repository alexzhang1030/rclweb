import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="flex flex-col flex-1 justify-center px-4 py-16 max-w-2xl mx-auto">
        <h1 className="font-medium text-2xl mb-3">rclweb</h1>
        <p className="text-fd-muted-foreground mb-8">
          Browser access to ROS 2. Install <code>rcl-web</code>, run{" "}
          <code>rclwebd</code> on the machine that can see the ROS graph, then
          use <code>Node</code> the way you use rclcpp.
        </p>
        <div className="flex flex-row flex-wrap gap-3">
          <Link
            to="/docs/$"
            params={{ _splat: "typescript" }}
            className="px-3 py-2 rounded-lg bg-fd-primary text-fd-primary-foreground font-medium text-sm"
          >
            How to
          </Link>
          <Link
            to="/docs/$"
            params={{ _splat: "api" }}
            className="px-3 py-2 rounded-lg border text-sm"
          >
            API reference
          </Link>
          <Link
            to="/docs/$"
            params={{ _splat: "deploy" }}
            className="px-3 py-2 rounded-lg border text-sm"
          >
            Deploy
          </Link>
        </div>
      </div>
    </HomeLayout>
  );
}
