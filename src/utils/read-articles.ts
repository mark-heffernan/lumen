/**
 * Tracks which RSS article IDs the user has already read.
 * Stored in localStorage (per-device — reading state doesn't need to sync via git).
 */

const KEY = "lumen_read_articles"
const MAX_STORED = 2000

export function getReadArticleIds(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

export function markArticleRead(id: string): void {
  const ids = getReadArticleIds()
  ids.add(id)
  const arr = [...ids].slice(-MAX_STORED)
  localStorage.setItem(KEY, JSON.stringify(arr))
}

export function markAllRead(ids: string[]): void {
  const existing = getReadArticleIds()
  for (const id of ids) existing.add(id)
  const arr = [...existing].slice(-MAX_STORED)
  localStorage.setItem(KEY, JSON.stringify(arr))
}
