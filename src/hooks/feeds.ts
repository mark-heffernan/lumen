import React from "react"
import type { RssFeedResponse } from "../../api/rss"

type FeedState = {
  data: RssFeedResponse | null
  isLoading: boolean
  error: string | null
}

// In-memory cache so re-mounting the feed page doesn't re-fetch within the session
const feedCache = new Map<string, RssFeedResponse>()

export function useFeed(url: string | null): FeedState {
  const [state, setState] = React.useState<FeedState>({
    data: url ? (feedCache.get(url) ?? null) : null,
    isLoading: url ? !feedCache.has(url) : false,
    error: null,
  })

  React.useEffect(() => {
    if (!url) {
      setState({ data: null, isLoading: false, error: null })
      return
    }

    const cached = feedCache.get(url)
    if (cached) {
      setState({ data: cached, isLoading: false, error: null })
      return
    }

    let cancelled = false
    setState((s) => ({ ...s, isLoading: true, error: null }))

    fetch(`/api/rss?url=${encodeURIComponent(url)}`)
      .then(async (res) => {
        const json = (await res.json()) as { error?: string } & Partial<RssFeedResponse>
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
        return json as RssFeedResponse
      })
      .then((data) => {
        if (cancelled) return
        feedCache.set(url, data)
        setState({ data, isLoading: false, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          data: null,
          isLoading: false,
          error: err instanceof Error ? err.message : "Failed to load feed",
        })
      })

    return () => {
      cancelled = true
    }
  }, [url])

  return state
}

export function clearFeedCache(url?: string) {
  if (url) {
    feedCache.delete(url)
  } else {
    feedCache.clear()
  }
}
