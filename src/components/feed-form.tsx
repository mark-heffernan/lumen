import React from "react"
import { useSetAtom } from "jotai"
import { feedsAtom, type RssFeed } from "../global-state"
import { Button } from "./button"
import { LoadingIcon16 } from "./icons"
import type { RssFeedResponse } from "../../api/rss"
import { generateNoteId } from "../utils/note-id"

type FeedFormProps = {
  onSuccess?: (feed: RssFeed) => void
  onCancel?: () => void
}

export function FeedForm({ onSuccess, onCancel }: FeedFormProps) {
  const setFeeds = useSetAtom(feedsAtom)
  const [url, setUrl] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/rss?url=${encodeURIComponent(trimmed)}`)
      const json = (await res.json()) as { error?: string } & Partial<RssFeedResponse>
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)

      const data = json as RssFeedResponse
      const feed: RssFeed = {
        id: generateNoteId(),
        url: trimmed,
        title: data.title,
        addedAt: new Date().toISOString(),
      }

      setFeeds((prev) => {
        // Prevent duplicates
        if (prev.some((f) => f.url === trimmed)) return prev
        return [...prev, feed]
      })

      onSuccess?.(feed)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch feed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="feed-url" className="text-sm font-medium">
          Feed URL
        </label>
        <input
          id="feed-url"
          type="url"
          //autoFocus
          required
          placeholder="https://example.com/feed.xml"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-2 focus:-outline-offset-2 focus:outline-border-focus"
        />
        {error ? <p className="text-sm text-(--color-error,red)">{error}</p> : null}
      </div>
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        ) : null}
        <Button variant="primary" type="submit" disabled={isLoading || !url.trim()}>
          {isLoading ? (
            <>
              <LoadingIcon16 />
              Fetching…
            </>
          ) : (
            "Add feed"
          )}
        </Button>
      </div>
    </form>
  )
}
