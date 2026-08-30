import { createFileRoute } from "@tanstack/react-router";
import { source } from "@/lib/source";
import { isRootReadmeUrl } from "@/lib/omit-root-readme";
import { createFromSource } from "fumadocs-core/search/server";

const server = createFromSource(source, {
  // https://docs.orama.com/docs/orama-js/supported-languages
  language: "english",
});

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const response = await server.GET(request);
        const hits = (await response.json()) as { url?: string }[];
        return Response.json(hits.filter((hit) => !isRootReadmeUrl(hit.url ?? "")));
      },
    },
  },
});
