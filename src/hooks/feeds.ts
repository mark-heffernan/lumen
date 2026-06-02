import React from "react"
import type { RssFeedResponse } from "../../api/rss"
import type { RssFeed } from "../global-state"

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

// ── useAllFeeds ──────────────────────────────────────────────────────────────

export type FeedLoadState = {
  feedId: string
  feedUrl: string
  feedTitle: string
  data: RssFeedResponse | null
  isLoading: boolean
  error: string | null
}

/**
 * Fetches all subscribed feeds in parallel, using the shared in-memory cache.
 * Returns per-feed load states and a `refresh()` function that clears the cache
 * and re-fetches everything.
 */
export function useAllFeeds(feeds: RssFeed[]): {
  feedLoadStates: FeedLoadState[]
  refresh: () => void
} {
  const [refreshKey, setRefreshKey] = React.useState(0)

  // Stable string key so the effect only re-runs when the feed list changes
  const feedUrlsKey = feeds.map((f) => f.url).join("\n")

  const [stateMap, setStateMap] = React.useState<
    Map<string, { data: RssFeedResponse | null; isLoading: boolean; error: string | null }>
  >(() =>
    new Map(
      feeds.map((f) => [
        f.url,
        { data: feedCache.get(f.url) ?? null, isLoading: !feedCache.has(f.url), error: null },
      ]),
    ),
  )

  React.useEffect(() => {
    const urls = feedUrlsKey.split("\n").filter(Boolean)
    if (urls.length === 0) {
      setStateMap(new Map())
      return
    }

    // Ensure state map has entries for all current URLs
    setStateMap((prev) => {
      const next = new Map(prev)
      for (const url of urls) {
        if (!next.has(url)) {
          next.set(url, {
            data: feedCache.get(url) ?? null,
            isLoading: !feedCache.has(url),
            error: null,
          })
        }
      }
      return next
    })

    const controllers: AbortController[] = []

    for (const url of urls) {
      if (feedCache.has(url)) continue // already cached — no fetch needed

      const controller = new AbortController()
      controllers.push(controller)

      fetch(`/api/rss?url=${encodeURIComponent(url)}`, { signal: controller.signal })
        .then(async (res) => {
          const json = (await res.json()) as { error?: string } & Partial<RssFeedResponse>
          if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
          return json as RssFeedResponse
        })
        .then((data) => {
          feedCache.set(url, data)
          setStateMap((prev) => new Map(prev).set(url, { data, isLoading: false, error: null }))
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") return
          setStateMap((prev) =>
            new Map(prev).set(url, {
              data: prev.get(url)?.data ?? null,
              isLoading: false,
              error: err instanceof Error ? err.message : "Failed to load feed",
            }),
          )
        })
    }

    return () => controllers.forEach((c) => c.abort())
  }, [feedUrlsKey, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function refresh() {
    const urls = feedUrlsKey.split("\n").filter(Boolean)
    urls.forEach((url) => clearFeedCache(url))
    setStateMap(new Map(urls.map((url) => [url, { data: null, isLoading: true, error: null }])))
    setRefreshKey((k) => k + 1)
  }

  const feedLoadStates: FeedLoadState[] = feeds.map((f) => ({
    feedId: f.id,
    feedUrl: f.url,
    feedTitle: stateMap.get(f.url)?.data?.title ?? f.title,
    data: stateMap.get(f.url)?.data ?? null,
    isLoading: stateMap.get(f.url)?.isLoading ?? true,
    error: stateMap.get(f.url)?.error ?? null,
  }))

  return { feedLoadStates, refresh }
}
