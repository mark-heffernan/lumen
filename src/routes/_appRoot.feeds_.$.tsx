import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useAtomValue } from "jotai"
import React from "react"
import { IconButton } from "../components/icon-button"
import {
  ArrowLeftIcon16,
  CheckIcon16,
  ExternalLinkIcon16,
  LoadingIcon16,
  NoteIcon16,
  RssFeedIcon16,
} from "../components/icons"
import { PageLayout } from "../components/page-layout"
import { feedsAtom } from "../global-state"
import { useSaveNote } from "../hooks/note"
import { useFeed } from "../hooks/feeds"
import { generateNoteId } from "../utils/note-id"
import { formatDate, formatDateDistance } from "../utils/date"
import type { RssFeedItem } from "../../api/rss"

export const Route = createFileRoute("/_appRoot/feeds_/$")({
  component: RouteComponent,
})

function RouteComponent() {
  const { _splat: feedId } = Route.useParams()
  const feeds = useAtomValue(feedsAtom)
  const navigate = useNavigate()

  const feed = feeds.find((f) => f.id === feedId)
  const { data, isLoading, error } = useFeed(feed?.url ?? null)

  if (!feed) {
    return (
      <PageLayout title="Feed not found" icon={<RssFeedIcon16 />}>
        <div className="p-4 flex flex-col gap-3">
          <p className="text-text-secondary text-sm">This feed no longer exists.</p>
          <Link to="/feeds" className="text-sm text-border-focus hover:underline">
            ← Back to Feeds
          </Link>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title={data?.title ?? feed.title}
      icon={<RssFeedIcon16 />}
      actions={
        <IconButton
          aria-label="Back to feeds"
          size="small"
          tooltipSide="bottom"
          onClick={() => navigate({ to: "/feeds" })}
        >
          <ArrowLeftIcon16 />
        </IconButton>
      }
    >
      <div className="mx-auto w-full max-w-2xl p-4 pb-8 flex flex-col gap-4">
        {/* Feed meta */}
        {data?.description ? <p className="text-text-secondary">{data.description}</p> : null}

        {/* Loading */}
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-text-secondary text-sm">
            <LoadingIcon16 />
            Loading articles…
          </div>
        ) : null}

        {/* Error */}
        {error ? (
          <div className="card-1 p-4 text-sm text-(--color-error,red)">
            Failed to load feed: {error}
          </div>
        ) : null}

        {/* Articles */}
        {data?.items && data.items.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {data.items.map((item) => (
              <ArticleItem key={item.id} item={item} feedTitle={data.title} />
            ))}
          </ul>
        ) : null}

        {data?.items?.length === 0 ? (
          <p className="text-sm text-text-secondary py-8 text-center">
            No articles in this feed yet.
          </p>
        ) : null}
      </div>
    </PageLayout>
  )
}

function ArticleItem({ item, feedTitle }: { item: RssFeedItem; feedTitle: string }) {
  const saveNote = useSaveNote()
  const [saved, setSaved] = React.useState(false)

  const pubDateString = item.pubDate
    ? (() => {
        try {
          const d = new Date(item.pubDate)
          const iso = d.toISOString().slice(0, 10)
          return { iso, display: formatDate(iso), distance: formatDateDistance(iso) }
        } catch {
          return null
        }
      })()
    : null

  async function handleSaveAsNote() {
    const id = generateNoteId()
    const lines = [
      `---`,
      `url: ${item.link}`,
      `tags: [rss]`,
      `---`,
      `# ${item.title}`,
      ``,
      `Source: [${feedTitle}](${item.link})${pubDateString ? `  ` : ""}`,
      pubDateString ? `Published: ${pubDateString.display}` : "",
      ``,
      item.contentSnippet ? `> ${item.contentSnippet.split("\n")[0]}` : "",
    ]
      .filter((l) => l !== "")
      .join("\n")

    await saveNote({ id, content: lines })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <li className="card-1 flex flex-col gap-2 p-4 group">
      <div className="flex items-start justify-between gap-2">
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:underline flex-1 min-w-0"
        >
          {item.title}
          <ExternalLinkIcon16 className="inline ml-1 opacity-50 shrink-0" />
        </a>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconButton
            aria-label={saved ? "Saved!" : "Save as note"}
            size="small"
            tooltipSide="left"
            onClick={handleSaveAsNote}
          >
            {saved ? <CheckIcon16 /> : <NoteIcon16 />}
          </IconButton>
        </div>
      </div>

      {item.contentSnippet ? (
        <p className="text-sm text-text-secondary line-clamp-3">{item.contentSnippet}</p>
      ) : null}

      <div className="flex items-center gap-2 text-xs text-text-secondary">
        {item.author ? <span>{item.author}</span> : null}
        {item.author && pubDateString ? <span>·</span> : null}
        {pubDateString ? <span title={pubDateString.display}>{pubDateString.distance}</span> : null}
      </div>
    </li>
  )
}
