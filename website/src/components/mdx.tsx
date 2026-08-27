import type { ComponentPropsWithoutRef, ReactNode } from "react";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { allocateHeadingSlug, githubHeadingSlug } from "@/lib/github-slug";
import { rewriteDocsHref } from "@/lib/mdx-links";

function headingText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(headingText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return headingText((children as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

export function getMDXComponents(pageFile: string, components?: MDXComponents): MDXComponents {
  const used = new Set<string>();
  const heading = (Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") => {
    return function Heading({ children, ...props }: ComponentPropsWithoutRef<typeof Tag>) {
      const base = githubHeadingSlug(headingText(children));
      const id = base ? allocateHeadingSlug(base, used) : undefined;
      return (
        <Tag {...props} id={id}>
          {children}
        </Tag>
      );
    };
  };

  return {
    ...defaultMdxComponents,
    h1: heading("h1"),
    h2: heading("h2"),
    h3: heading("h3"),
    h4: heading("h4"),
    h5: heading("h5"),
    h6: heading("h6"),
    a: ({ href, ...props }) => <a {...props} href={rewriteDocsHref(href, pageFile)} />,
    ...components,
  } satisfies MDXComponents;
}

export function useMDXComponents(pageFile = ""): MDXComponents {
  return getMDXComponents(pageFile);
}

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
