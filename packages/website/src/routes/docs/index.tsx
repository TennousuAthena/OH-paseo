import { createFileRoute } from "@tanstack/react-router";
import { MarkdownAsync } from "react-markdown";
import { DocsSourceFooter } from "~/components/docs-source-footer";
import { getDoc } from "~/docs";
import { docsRehypePlugins, docsRemarkPlugins } from "~/docs-rehype";
import { pageMeta } from "~/meta";

export const Route = createFileRoute("/docs/")({
  head: () => {
    const doc = getDoc("");
    if (!doc) return { meta: pageMeta("Docs - Paseo", "Paseo documentation.") };
    return {
      meta: pageMeta(`${doc.frontmatter.title} - Paseo Docs`, doc.frontmatter.description),
    };
  },
  component: DocsIndex,
});

async function DocsIndex() {
  const doc = getDoc("");
  if (!doc) return <p className="text-muted-foreground">Doc not found.</p>;
  return (
    <>
      <MarkdownAsync remarkPlugins={docsRemarkPlugins} rehypePlugins={docsRehypePlugins}>
        {doc.content}
      </MarkdownAsync>
      <DocsSourceFooter doc={doc} />
    </>
  );
}
