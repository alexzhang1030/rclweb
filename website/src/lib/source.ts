import { pageSchema } from "fumadocs-core/source/schema";
import { loader } from "fumadocs-core/source";
import { defineDocs } from "fumadocs-mdx/macro";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { z } from "zod";
import { docsRoute } from "./shared";
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

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: docsRoute,
  plugins: [lucideIconsPlugin()],
});

export async function getLLMText(page: (typeof source)["$inferPage"]) {
  const processed = await page.data.getText("processed");
  const title = page.data.title ?? page.slugs.at(-1) ?? "untitled";

  return `# ${title} (${page.url})

${processed}`;
}
