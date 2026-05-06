import { createFileRoute, Link } from "@tanstack/react-router"
import { BookIcon16, ChevronRightIcon12 } from "../components/icons"
import { PageLayout } from "../components/page-layout"

const docs = [
  { slug: "keyboard-shortcuts", title: "Keyboard shortcuts" },
  { slug: "markdown-syntax", title: "Markdown syntax" },
  { slug: "metadata", title: "Metadata" },
  { slug: "query-language", title: "Query language" },
  { slug: "status", title: "Status" },
  { slug: "templates", title: "Templates" },
  { slug: "CHANGELOG", title: "Changelog" },
]

export const Route = createFileRoute("/_appRoot/docs/")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Docs · Lumen" }],
  }),
})

function RouteComponent() {
  return (
    <PageLayout title="Docs" icon={<BookIcon16 />}>
      <div className="p-4 pt-0">
        <ul className="flex flex-col">
          {docs.map((doc) => (
            <li key={doc.slug}>
              <Link
                to="/docs/$doc"
                params={{ doc: doc.slug }}
                className="flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 hover:bg-bg-secondary active:bg-bg-secondary-active coarse:py-3"
              >
                <span>{doc.title}</span>
                <ChevronRightIcon12 className="shrink-0 text-text-secondary" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PageLayout>
  )
}
