import { createFileRoute, Link } from "@tanstack/react-router"
import { useAtom } from "jotai"
import React from "react"
import { FeedForm } from "../components/feed-form"
import { IconButton } from "../components/icon-button"
import { PlusIcon16, RssFeedIcon16, TrashIcon16 } from "../components/icons"
import { PageLayout } from "../components/page-layout"
import { feedsAtom } from "../global-state"
import { clearFeedCache } from "../hooks/feeds"
import { formatDateDistance } from "../utils/date"

export const Route = createFileRoute("/_appRoot/feeds/")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Feeds · Lumen" }],
  }),
})

function RouteComponent() {
  const [feeds, setFeeds] = useAtom(feedsAtom)
  const [isAdding, setIsAdding] = React.useState(false)

  function removeFeed(id: string) {
    const feed = feeds.find((f) => f.id === id)
    if (feed) clearFeedCache(feed.url)
    setFeeds((prev) => prev.filter((f) => f.id !== id))
  }

  return (
    <PageLayout
      title="Feeds"
      icon={<RssFeedIcon16 />}
      actions={
        <IconButton
          aria-label="Add feed"
          size="small"
          onClick={() => setIsAdding(true)}
          tooltipSide="bottom"
        >
          <PlusIcon16 />
        </IconButton>
      }
    >
      <div className="mx-auto w-full max-w-2xl p-4 pb-8 flex flex-col gap-6">
        {/* Add feed form */}
        {isAdding ? (
          <div className="card-1 p-4">
            <h2 className="text-sm font-medium mb-3">Add RSS feed</h2>
            <FeedForm onSuccess={() => setIsAdding(false)} onCancel={() => setIsAdding(false)} />
          </div>
        ) : null}

        {feeds.length === 0 && !isAdding ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center text-text-secondary">
            <RssFeedIcon16 className="size-8 opacity-40" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-text">No feeds yet</p>
              <p className="text-sm">Subscribe to RSS feeds to follow blogs and news from here.</p>
            </div>
            <button
              className="text-sm text-border-focus hover:underline"
              onClick={() => setIsAdding(true)}
            >
              Add your first feed
            </button>
          </div>
        ) : null}

        {feeds.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {feeds.map((feed) => (
              <li key={feed.id}>
                <div className="card-1 flex items-center gap-3 p-3 hover:bg-bg-secondary transition-colors group">
                  <RssFeedIcon16 className="shrink-0 text-text-secondary" />
                  <Link
                    to="/feeds/$"
                    params={{ _splat: feed.id }}
                    className="flex-1 min-w-0"
                    activeOptions={{ exact: true }}
                  >
                    <p className="font-medium truncate">{feed.title}</p>
                    <p className="text-xs text-text-secondary truncate">{feed.url}</p>
                  </Link>
                  <span className="text-xs text-text-secondary shrink-0 hidden group-hover:inline">
                    Added {formatDateDistance(feed.addedAt.slice(0, 10))}
                  </span>
                  <IconButton
                    aria-label={`Remove ${feed.title}`}
                    size="small"
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeFeed(feed.id)}
                    tooltipSide="left"
                  >
                    <TrashIcon16 />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </PageLayout>
  )
}
