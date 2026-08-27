import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { appName, gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: appName,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: [
      {
        text: "How to",
        url: "/docs/typescript",
      },
      {
        text: "API",
        url: "/docs/api",
      },
      {
        text: "Deploy",
        url: "/docs/deploy",
      },
    ],
  };
}
