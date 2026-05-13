/**
 * useFeedsSync
 *
 * Keeps .lumen/feeds.json in the active git repo in sync with feedsAtom.
 *
 * - On mount (once the repo is cloned): reads .lumen/feeds.json and populates feedsAtom.
 *   Also migrates any feeds stored in localStorage from the previous atomWithStorage approach.
 * - On feedsAtom change (after initial load): debounce-writes the updated list back to
 *   .lumen/feeds.json via the WRITE_FILES state machine event so it's committed and pushed.
 */

import React from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { activeRepoDirAtom, feedsAtom, globalStateMachineAtom, isRepoClonedAtom } from "../global-state"
import type { RssFeed } from "../global-state"
import { fs } from "../utils/fs"

const FEEDS_FILE = ".lumen/feeds.json"
const LEGACY_LOCALSTORAGE_KEY = "rss_feeds"

type FeedsFile = {
  version: number
  feeds: RssFeed[]
}

/** Read .lumen/feeds.json from the filesystem. Returns null if the file doesn't exist. */
async function readFeedsFile(dir: string): Promise<RssFeed[] | null> {
  try {
    const raw = await fs.promises.readFile(`${dir}/${FEEDS_FILE}`, "utf8")
    const parsed = JSON.parse(raw as string) as FeedsFile
    if (!Array.isArray(parsed.feeds)) return null
    return parsed.feeds
  } catch {
    return null
  }
}

/** Serialize feeds to the JSON file format */
function serializeFeeds(feeds: RssFeed[]): string {
  const file: FeedsFile = { version: 1, feeds }
  return JSON.stringify(file, null, 2)
}

/** Read any feeds previously saved in localStorage (migration path) */
function readLegacyLocalStorageFeeds(): RssFeed[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as RssFeed[]) : null
  } catch {
    return null
  }
}

export function useFeedsSync() {
  const isCloned = useAtomValue(isRepoClonedAtom)
  const repoDir = useAtomValue(activeRepoDirAtom)
  const [feeds, setFeeds] = useAtom(feedsAtom)
  const send = useSetAtom(globalStateMachineAtom)

  // Track whether we've completed the initial load so we don't write-back immediately
  const initializedRef = React.useRef(false)
  // Debounce timer ref
  const writeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load feeds from the filesystem when the repo becomes available ──────────
  React.useEffect(() => {
    if (!isCloned || !repoDir) return

    let cancelled = false

    async function load() {
      let feeds = await readFeedsFile(repoDir)

      if (!cancelled) {
        if (feeds === null) {
          // File doesn't exist yet — check localStorage for a migration
          const legacy = readLegacyLocalStorageFeeds()
          if (legacy && legacy.length > 0) {
            feeds = legacy
            // Will be written to disk on the first feedsAtom change below
          } else {
            feeds = []
          }
        }
        // Clear the legacy localStorage key regardless
        localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY)

        setFeeds(feeds)
        initializedRef.current = true
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [isCloned, repoDir, setFeeds])

  // ── Write feeds back to the repo whenever feedsAtom changes (after initial load) ──
  React.useEffect(() => {
    if (!initializedRef.current || !isCloned || !repoDir) return

    // Debounce to avoid rapid consecutive writes (e.g. adding several feeds quickly)
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current)

    writeTimerRef.current = setTimeout(() => {
      send({
        type: "WRITE_FILES",
        markdownFiles: {},
        rawFiles: { [FEEDS_FILE]: serializeFeeds(feeds) },
        commitMessage: "Update feeds",
      })
    }, 500)

    return () => {
      if (writeTimerRef.current) clearTimeout(writeTimerRef.current)
    }
  }, [feeds, isCloned, repoDir, send])
}
