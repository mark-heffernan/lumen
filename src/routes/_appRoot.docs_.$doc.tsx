import { createFileRoute, notFound } from "@tanstack/react-router"
import { BookIcon16 } from "../components/icons"
import { MarkdownContent } from "../components/markdown"
import { PageLayout } from "../components/page-layout"

const docFiles = import.meta.glob("../../docs/*.md", { eager: true, query: "?raw" }) as Record<
  string,
  { default: string }
>

function getDoc(slug: string): { title: string; content: string } | null {
  const key = `../../docs/${slug}.md`
  const mod = docFiles[key]
  if (!mod) return null

  const raw = mod.default
  const firstLine = raw.split("\n")[0] ?? ""
  const title = firstLine.startsWith("# ") ? firstLine.slice(2) : slug
  const content = raw.split("\n").slice(1).join("\n").trimStart()

  return { title, content }
}

export const Route = createFileRoute("/_appRoot/docs_/$doc")({
  component: RouteComponent,
  loader: ({ params }) => {
    const doc = getDoc(params.doc)
    if (!doc) throw notFound()
    return doc
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.title} · Lumen` }],
  }),
})

function RouteComponent() {
  const { title, content } = Route.useLoaderData()

  return (
    <PageLayout title={title} icon={<BookIcon16 />}>
      <div className="p-4 pt-0">
        <div className="markdown markdown-large">
          <MarkdownContent>{content}</MarkdownContent>
        </div>
      </div>
    </PageLayout>
  )
}
