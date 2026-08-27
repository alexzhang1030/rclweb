import { createFileRoute } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { HomePage } from "@/components/home";
import { baseOptions } from "@/lib/layout.shared";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [{ title: "rclweb · docs" }],
  }),
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <HomePage />
    </HomeLayout>
  );
}
