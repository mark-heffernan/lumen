import { createFileRoute, Link } from "@tanstack/react-router"
import { useAtomValue } from "jotai"
import React from "react"
import type { RssFeedItem } from "../../api/rss"
import { IconButton } from "../components/icon-button"
import {
  CheckIcon16,
  ChevronDownIcon16,
  ChevronUpIcon16,
  ExternalLinkIcon16,
  LoadingIcon16,
  NoteIcon16,
  RefreshIcon16,
  RssFeedIcon16,
} from "../components/icons"
import { PageLayout } from "../components/page-layout"
import { feedsAtom } from "../global-state"
import { type FeedLoadState, useAllFeeds } from "../hooks/feeds"
import { useSaveNote } from "../hooks/note"
import { formatDate, formatDateDistance } from "../utils/date"
import { generateNoteId } from "../utils/note-id"
import {
  getReadArticleIds,
  markAllRead,
  markArticleRead,
} from "../utils/read-articles"

export const Route = createFileRoute("/_appRoot/feeds/dashboard")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Feed Reader · Lumen" }],
  }),
})

type ArticleWithMeta = {
  item: RssFeedItem
  feedId: string
  feedTitle: string
  feedUrl: string
  pubDateMs: number
}

function RouteComponent() {
  const feeds = useAtomValue(feedsAtom)
  const { feedLoadStates, refresh } = useAllFeeds(feeds)
  const [activeFilter, setActiveFilter] = React.useState<string | null>(null)
  const [readIds, setReadIds] = React.useState<Set<string>>(() => getReadArticleIds())
  const [isRefreshing, setIsRefreshing] = React.useState(false)

  // Build flat sorted article list
  const allArticles = React.useMemo<ArticleWithMeta[]>(() => {
    const articles: ArticleWithMeta[] = []

    for (const feedState of feedLoadStates) {
      if (!feedState.data) continue
      if (activeFilter && feedState.feedId !== activeFilter) continue

      for (const item of feedState.data.items) {
        articles.push({
          item,
          feedId: feedState.feedId,
          feedTitle: feedState.feedTitle,
          feedUrl: feedState.feedUrl,
          pubDateMs: item.pubDate ? new Date(item.pubDate).getTime() : 0,
        })
      }
    }

    return articles.sort((a, b) => b.pubDateMs - a.pubDateMs).slice(0, 100)
  }, [feedLoadStates, activeFilter])

  const unreadCount = allArticles.filter((a) => !readIds.has(a.item.id)).length
  const isAnyLoading = feedLoadStates.some((s) => s.isLoading)

  function handleRefresh() {
    setIsRefreshing(true)
    refresh()
  }

  // Clear the refreshing spinner once all feeds have loaded
  React.useEffect(() => {
    if (isRefreshing && !isAnyLoading) {
      setIsRefreshing(false)
    }
  }, [isAnyLoading, isRefreshing])

  function handleMarkAllRead() {
    const ids = allArticles.map((a) => a.item.id)
    markAllRead(ids)
    setReadIds((prev) => new Set([...prev, ...ids]))
  }

  function handleMarkRead(id: string) {
    markArticleRead(id)
    setReadIds((prev) => new Set([...prev, id]))
  }

  return (
    <PageLayout
      title="Feed Reader"
      icon={<RssFeedIcon16 />}
      actions={
        <div className="flex items-center gap-1">
          {unreadCount > 0 ? (
            <button
              onClick={handleMarkAllRead}
              className="rounded px-2 py-1 text-xs text-text-secondary hover:bg-bg-secondary hover:text-text transition-colors"
            >
              Mark all read
            </button>
          ) : null}
          <IconButton
            aria-label="Refresh feeds"
            size="small"
            tooltipSide="bottom"
            onClick={handleRefresh}
            disabled={isRefreshing || isAnyLoading}
          >
            {isRefreshing || isAnyLoading ? <LoadingIcon16 /> : <RefreshIcon16 />}
          </IconButton>
        </div>
      }
    >
      {/* No feeds empty state */}
      {feeds.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-24 text-center text-text-secondary">
          <RssFeedIcon16 className="size-8 opacity-40" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-text">No feeds subscribed yet</p>
            <p className="text-sm">Add feeds from the Feeds page to start reading.</p>
          </div>
          <Link to="/feeds" className="text-sm text-border-focus hover:underline">
            Go to Feeds →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4 pb-8">
          {/* Filter pills */}
          <FilterBar
            feedLoadStates={feedLoadStates}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            totalUnread={unreadCount}
            readIds={readIds}
          />

          {/* Article grid */}
          {allArticles.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {allArticles.map((article) => (
                <ArticleCard
                  key={`${article.feedId}-${article.item.id}`}
                  article={article}
                  isRead={readIds.has(article.item.id)}
                  onRead={handleMarkRead}
                />
              ))}
            </div>
          ) : null}

          {/* Loading skeletons (only when no articles yet) */}
          {isAnyLoading && allArticles.length === 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : null}

          {/* All feeds errored / empty */}
          {!isAnyLoading && allArticles.length === 0 ? (
            <div className="py-16 text-center text-sm text-text-secondary">
              No articles to display.{" "}
              <button onClick={handleRefresh} className="text-border-focus hover:underline">
                Try refreshing.
              </button>
            </div>
          ) : null}

          {/* Per-feed error notices */}
          {feedLoadStates
            .filter((s) => s.error && (!activeFilter || s.feedId === activeFilter))
            .map((s) => (
              <p key={s.feedId} className="text-sm text-text-danger">
                Failed to load <strong>{s.feedTitle}</strong>: {s.error}
              </p>
            ))}
        </div>
      )}
    </PageLayout>
  )
}

// ── Filter bar ───────────────────────────────────────────────────────────────

function FilterBar({
  feedLoadStates,
  activeFilter,
  onFilterChange,
  totalUnread,
  readIds,
}: {
  feedLoadStates: FeedLoadState[]
  activeFilter: string | null
  onFilterChange: (id: string | null) => void
  totalUnread: number
  readIds: Set<string>
}) {
  // Collapsed by default on mobile; desktop always shows pills via sm:flex
  const [mobileOpen, setMobileOpen] = React.useState(false)

  const activeLabel =
    activeFilter === null
      ? "All feeds"
      : (feedLoadStates.find((s) => s.feedId === activeFilter)?.feedTitle ?? "All feeds")

  const pills = (
    <>
      <FilterPill active={activeFilter === null} onClick={() => onFilterChange(null)}>
        All
        {totalUnread > 0 ? (
          <span className="ml-1 rounded-full bg-text px-1.5 py-px text-[10px] font-medium leading-none text-bg tabular-nums">
            {totalUnread}
          </span>
        ) : null}
      </FilterPill>

      {feedLoadStates.map((s) => {
        const feedUnread = s.data
          ? s.data.items.filter((item) => !readIds.has(item.id)).length
          : 0
        return (
          <FilterPill
            key={s.feedId}
            active={activeFilter === s.feedId}
            onClick={() => onFilterChange(s.feedId)}
            loading={s.isLoading}
            error={!!s.error}
          >
            {s.feedTitle}
            {feedUnread > 0 ? (
              <span className="ml-1 rounded-full bg-text px-1.5 py-px text-[10px] font-medium leading-none text-bg tabular-nums">
                {feedUnread}
              </span>
            ) : null}
          </FilterPill>
        )
      })}
    </>
  )

  return (
    <div className="flex flex-col gap-2">
      {/* Mobile toggle — hidden on sm+ screens */}
      <button
        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium sm:hidden"
        onClick={() => setMobileOpen((o) => !o)}
      >
        <span className="truncate text-text">{activeLabel}</span>
        <span className="flex shrink-0 items-center gap-1 text-text-secondary">
          {totalUnread > 0 ? (
            <span className="rounded-full bg-text px-1.5 py-px text-[10px] font-medium leading-none text-bg tabular-nums">
              {totalUnread}
            </span>
          ) : null}
          {mobileOpen ? <ChevronUpIcon16 /> : <ChevronDownIcon16 />}
        </span>
      </button>

      {/* Pills — always visible on sm+, toggled on mobile */}
      <div className={`flex-wrap gap-1.5 ${mobileOpen ? "flex" : "hidden sm:flex"}`}>
        {pills}
      </div>
    </div>
  )
}

function FilterPill({
  active,
  loading,
  error,
  onClick,
  children,
}: {
  active: boolean
  loading?: boolean
  error?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-text bg-text text-bg"
          : "border-border bg-bg text-text-secondary hover:border-border-secondary hover:text-text",
        error && !active ? "border-text-danger text-text-danger" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {loading ? <LoadingIcon16 className="size-3" /> : null}
      {children}
    </button>
  )
}

// ── Image size guard ─────────────────────────────────────────────────────────
// Minimum dimensions for a card image to be worth displaying.
const MIN_IMAGE_W = 300
const MIN_IMAGE_H = 150

/**
 * Quick check using URL query params before even loading the image.
 * Many CDNs (e.g. The Guardian: ?width=140) encode dimensions in the URL.
 */
function isImageUrlTooSmall(url: string): boolean {
  try {
    const p = new URL(url).searchParams
    const w = Number(p.get("width") ?? p.get("w") ?? 0)
    const h = Number(p.get("height") ?? p.get("h") ?? 0)
    if (w > 0 && w < MIN_IMAGE_W) return true
    if (h > 0 && h < MIN_IMAGE_H) return true
  } catch {
    /* ignore unparseable URLs */
  }
  return false
}

// ── Article card ─────────────────────────────────────────────────────────────

function ArticleCard({
  article,
  isRead,
  onRead,
}: {
  article: ArticleWithMeta
  isRead: boolean
  onRead: (id: string) => void
}) {
  const saveNote = useSaveNote()
  const [saved, setSaved] = React.useState(false)
  // Tracks whether the image should be hidden (broken or too small once loaded)
  const [imageHidden, setImageHidden] = React.useState(false)

  const imageUrl = article.item.imageUrl
  // Skip images that are obviously too small based on URL params alone
  const showImageAttempt = !!imageUrl && !imageHidden && !isImageUrlTooSmall(imageUrl)

  const pubDateString = article.item.pubDate
    ? (() => {
        try {
          const d = new Date(article.item.pubDate)
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
      `url: ${article.item.link}`,
      `tags: [rss]`,
      `---`,
      `# ${article.item.title}`,
      ``,
      `Source: [${article.feedTitle}](${article.item.link})${pubDateString ? `  ` : ""}`,
      pubDateString ? `Published: ${pubDateString.display}` : "",
      ``,
      article.item.contentSnippet ? `> ${article.item.contentSnippet.split("\n")[0]}` : "",
    ]
      .filter((l) => l !== "")
      .join("\n")

    await saveNote({ id, content: lines })
    setSaved(true)
    onRead(article.item.id)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <article
      className={[
        "card-1 group flex flex-col overflow-hidden transition-colors",
        !isRead ? "border-l-2 border-l-border-focus" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Article image */}
      {showImageAttempt ? (
        <a
          href={article.item.link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onRead(article.item.id)}
          className="block shrink-0 overflow-hidden"
        >
          <img
            src={imageUrl!}
            alt=""
            className="h-40 w-full object-cover transition-opacity group-hover:opacity-90"
            loading="lazy"
            onLoad={(e) => {
              const img = e.currentTarget
              // Secondary check: hide if the actual decoded image is too small
              if (img.naturalWidth < MIN_IMAGE_W || img.naturalHeight < MIN_IMAGE_H) {
                setImageHidden(true)
              }
            }}
            onError={() => setImageHidden(true)}
          />
        </a>
      ) : null}

      <div className="flex flex-col gap-3 p-4">
      {/* Source + time */}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-text-secondary">
          {article.feedTitle}
        </span>
        {pubDateString ? (
          <time
            dateTime={pubDateString.iso}
            title={pubDateString.display}
            className="shrink-0 text-xs text-text-secondary"
          >
            {pubDateString.distance}
          </time>
        ) : null}
      </div>

      {/* Title */}
      <a
        href={article.item.link}
        target="_blank"
        rel="noopener noreferrer"
        className={[
          "text-sm leading-snug hover:underline",
          !isRead ? "font-semibold" : "font-medium text-text-secondary",
        ].join(" ")}
        onClick={() => onRead(article.item.id)}
      >
        {article.item.title}
        <ExternalLinkIcon16 className="ml-1 inline opacity-40" />
      </a>

      {/* Excerpt */}
      {article.item.contentSnippet ? (
        <p className="line-clamp-3 text-xs leading-relaxed text-text-secondary">
          {article.item.contentSnippet}
        </p>
      ) : null}

      {/* Footer: author + actions */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="truncate text-xs text-text-secondary">
          {article.item.author ?? ""}
        </span>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
      </div>{/* end padded content */}
    </article>
  )
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card-1 flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="h-3 w-24 animate-pulse rounded bg-bg-secondary" />
        <div className="h-3 w-16 animate-pulse rounded bg-bg-secondary" />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="h-3.5 w-full animate-pulse rounded bg-bg-secondary" />
        <div className="h-3.5 w-4/5 animate-pulse rounded bg-bg-secondary" />
      </div>
      <div className="flex flex-col gap-1">
        <div className="h-3 w-full animate-pulse rounded bg-bg-secondary" />
        <div className="h-3 w-full animate-pulse rounded bg-bg-secondary" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-bg-secondary" />
      </div>
    </div>
  )
}
