import { pageSchema } from "fumadocs-core/source/schema";
import { loader, type LoaderPlugin } from "fumadocs-core/source";
import { defineDocs } from "fumadocs-mdx/macro";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { z } from "zod";
import { docsRoute } from "./shared";
import { isRootReadmeFile } from "./omit-root-readme";
import { titleFromMarkdown } from "./title-from-markdown";

export const docs = defineDocs({
  dir: "../docs",
  docs: {
    async: true,
    files: ["**/*.md", "**/*.mdx"],
    postprocess: {
      includeProcessedMarkdown: true,
    },
    schema: (ctx) =>
      pageSchema.extend({
        title: z.string().default(titleFromMarkdown(ctx.source, ctx.path)),
      }),
  },
});

function omitRootReadme(): LoaderPlugin {
  return {
    name: "omit-root-readme",
    transformStorage({ storage }) {
      for (const filePath of storage.getFiles()) {
        if (isRootReadmeFile(filePath)) storage.delete(filePath);
      }
    },
  };
}

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: docsRoute,
  plugins: [lucideIconsPlugin(), omitRootReadme()],
});

export async function getLLMText(page: (typeof source)["$inferPage"]) {
  const processed = await page.data.getText("processed");
  const title = page.data.title ?? page.slugs.at(-1) ?? "untitled";

  return `# ${title} (${page.url})

${processed}`;
}
