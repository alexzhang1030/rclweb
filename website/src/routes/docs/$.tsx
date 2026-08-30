import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { createServerFn } from "@tanstack/react-start";
import { docs, source } from "@/lib/source";
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import { baseOptions } from "@/lib/layout.shared";
import { encodeMarkdownUrl } from "@/lib/shared";
import { arrangeDocsTree } from "@/lib/page-tree";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { Suspense, use } from "react";
import { useMDXComponents } from "@/components/mdx";

export const Route = createFileRoute("/docs/$")({
  component: Page,
  loader: async ({ params }) => {
    const slugs = (params._splat?.split("/") ?? []).filter((part) => part.length > 0);
    if (slugs.length === 0 || (slugs.length === 1 && slugs[0].toLowerCase() === "readme")) {
      throw redirect({
        to: "/docs/$",
        params: { _splat: "typescript" },
      });
    }
    const data = await serverLoader({ data: slugs });
    await docs.getPage(data.path)?.preload();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.title ? `${loaderData.title} · rclweb` : "rclweb",
      },
    ],
  }),
});

const serverLoader = createServerFn({
  method: "GET",
})
  .validator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs) ?? source.getPage([...slugs, "README"]);
    if (!page) throw notFound();

    return {
      path: page.path,
      title: page.data.title,
      markdownUrl: encodeMarkdownUrl(page.slugs, page.locale),
      pageTree: await source.serializePageTree(arrangeDocsTree(source.getPageTree())),
    };
  });

function Content({ path }: { path: string }) {
  const page = docs.getPage(path);
  if (!page) throw new Error(`unknown page: ${path}`);

  const { toc } = use(page.load());
  const MDX = page.body;

  return (
    <DocsPage toc={toc}>
      <DocsBody>
        <MDX components={useMDXComponents(path)} />
      </DocsBody>
    </DocsPage>
  );
}

function Page() {
  const { path, pageTree } = useFumadocsLoader(Route.useLoaderData());

  return (
    <DocsLayout {...baseOptions()} tree={pageTree}>
      <Suspense>
        <Content path={path} />
      </Suspense>
    </DocsLayout>
  );
}
