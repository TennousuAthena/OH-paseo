import { createFileRoute } from "@tanstack/react-router";
import { MarkdownAsync } from "react-markdown";
import { DocsSourceFooter } from "~/components/docs-source-footer";
import { getDoc } from "~/docs";
import { docsRehypePlugins, docsRemarkPlugins } from "~/docs-rehype";
import { pageMeta } from "~/meta";

export const Route = createFileRoute("/docs/$")({
  head: ({ params }) => {
    const slug = params._splat ?? "";
    const doc = getDoc(slug);
    if (!doc) return { meta: pageMeta("Not Found - Paseo Docs", "Doc not found.") };
    return {
      meta: pageMeta(`${doc.frontmatter.title} - Paseo Docs`, doc.frontmatter.description),
    };
  },
  component: DocsPage,
});

function DocsPage() {
  const { _splat } = Route.useParams();
  const slug = _splat ?? "";
  return <RenderedDoc slug={slug} />;
}

async function RenderedDoc({ slug }: { slug: string }) {
  const doc = getDoc(slug);

  if (!doc) {
    return <p className="text-muted-foreground">Doc not found.</p>;
  }

  return (
    <>
      <MarkdownAsync remarkPlugins={docsRemarkPlugins} rehypePlugins={docsRehypePlugins}>
        {doc.content}
      </MarkdownAsync>
      <DocsSourceFooter doc={doc} />
    </>
  );
}
