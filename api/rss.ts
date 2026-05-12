import RSSParser from "rss-parser"

const parser = new RSSParser({
  timeout: 10000,
  headers: {
    "User-Agent": "Lumen RSS Reader/1.0",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  },
})

export type RssFeedItem = {
  id: string
  title: string
  link: string
  pubDate: string | null
  contentSnippet: string | null
  author: string | null
}

export type RssFeedResponse = {
  title: string
  description: string | null
  link: string | null
  items: RssFeedItem[]
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const feedUrl = url.searchParams.get("url")

  if (!feedUrl) {
    return new Response(JSON.stringify({ error: "Missing ?url= parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Basic URL validation
  let parsedUrl: URL
  try {
    parsedUrl = new URL(feedUrl)
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Invalid protocol")
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid feed URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const feed = await parser.parseURL(parsedUrl.toString())

    const response: RssFeedResponse = {
      title: feed.title ?? parsedUrl.hostname,
      description: feed.description ?? null,
      link: feed.link ?? null,
      items: feed.items.slice(0, 50).map((item) => ({
        id: item.guid ?? item.link ?? item.title ?? Math.random().toString(36),
        title: item.title ?? "(no title)",
        link: item.link ?? "",
        pubDate: item.pubDate ?? item.isoDate ?? null,
        contentSnippet: item.contentSnippet ?? item.summary ?? null,
        author: item.creator ?? item.author ?? null,
      })),
    }

    return new Response(JSON.stringify(response), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300", // cache for 5 minutes
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch feed"
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    })
  }
}
