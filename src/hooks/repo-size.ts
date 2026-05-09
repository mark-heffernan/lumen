import { useAtomValue } from "jotai"
import React from "react"
import { githubUserAtom } from "../global-state"

/** Fetches the size of a GitHub repository. Returns size in KB. */
export function useRepoSize(owner: string | undefined, name: string | undefined) {
  const githubUser = useAtomValue(githubUserAtom)
  const [sizeKb, setSizeKb] = React.useState<number | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)

  React.useEffect(() => {
    if (!owner || !name || !githubUser?.token) return

    let cancelled = false
    setIsLoading(true)
    setSizeKb(null)

    fetch(`https://api.github.com/repos/${owner}/${name}`, {
      headers: { Authorization: `token ${githubUser.token}` },
    })
      .then((res) => res.json())
      .then((data: unknown) => {
        if (
          !cancelled &&
          data !== null &&
          typeof data === "object" &&
          "size" in data &&
          typeof (data as { size: unknown }).size === "number"
        ) {
          setSizeKb((data as { size: number }).size)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [owner, name, githubUser?.token])

  return { sizeKb, isLoading }
}

/** Formats a size in KB into a human-readable string. https://en.wikipedia.org/wiki/Kilobyte */
export function formatRepoSize(kb: number): string {
  if (kb < 1024) return `${kb} kB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(1)} GB`
}
