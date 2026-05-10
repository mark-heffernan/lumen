/** Calls /api/ai-enhance and streams text chunks into the onTextChange callback. */
export async function streamAiEnhance({
  prefix,
  suffix,
  selection,
  command,
  mode,
  onTextChange,
}: {
  prefix: string
  suffix: string
  selection: string
  command: string
  mode: "insert" | "rewrite" | "assist"
  onTextChange: (text: string) => void
}) {
  try {
    const response = await fetch("/api/ai-enhance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, suffix, selection, command, mode }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[ai-enhance] ${response.status} error:`, errorText)
      onTextChange(`⚠️ AI error (${response.status}): ${errorText}`)
      return
    }

    if (!response.body) {
      console.error("[ai-enhance] Response has no body")
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let accumulated = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      if (chunk) {
        accumulated += chunk
        onTextChange(accumulated)
      }
    }
  } catch (error) {
    console.error("[ai-enhance] Fetch failed:", error)
    onTextChange("⚠️ AI unavailable — is the dev server running with `npm run dev:vercel`?")
  }
}
