/**
 * Wrapper for `vercel dev` that pre-loads sensitive API keys from `.env.keys`
 * into the process environment before the dev server starts.
 *
 * Vercel marks some keys (e.g. TMDB_API_KEY, OPENAI_API_KEY) as Sensitive,
 * which means they can only be set for Production/Preview — not Development.
 * `vercel dev` therefore never receives them from the platform, and overwrites
 * `.env.local` without them. This script injects them from a local `.env.keys`
 * file so the API functions can read them via process.env as normal.
 *
 * Setup: add your sensitive keys to `.env.keys` (already gitignored):
 *   TMDB_API_KEY=your-key-here
 *   OPENAI_API_KEY=sk-proj-...
 */

import { readFileSync } from "fs"
import { spawn } from "child_process"

// Load .env.keys into process.env
try {
  const content = readFileSync(".env.keys", "utf8")
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    // Strip surrounding quotes from the value if present
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "")
    process.env[key] = value
  }
  console.log("[dev] Loaded sensitive keys from .env.keys")
} catch {
  console.warn("[dev] No .env.keys file found — sensitive API keys may be missing")
}

// Spawn vercel dev with the enriched environment
const child = spawn("vercel", ["dev", "--listen", "8888"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
})

child.on("exit", (code) => process.exit(code ?? 0))
