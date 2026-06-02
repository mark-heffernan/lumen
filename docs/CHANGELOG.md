# Changelog

## 2026-W23

### New

- **Feed Reader dashboard** (`/feeds/dashboard`) — a new unified reading view that fetches all subscribed feeds in parallel and displays articles as a card grid (3 columns on desktop, 2 on tablet, 1 on mobile), sorted newest-first across all sources. Access via the new **Reader** entry in the sidebar.
  - **Filter pills** — a scrollable pill row at the top lets you view all feeds at once or filter to a single source. Each pill shows an unread count badge.
  - **Article cards** — each card shows the source name, time ago, article title (links out to the original), a 3-line excerpt, and author. Hovering reveals a **Save as note** button (📝) that creates a pre-filled note and marks the article as read.
  - **Article images** — when a feed item includes a `media:thumbnail`, `media:content`, RSS enclosure, or an `<img>` tag in its content HTML, the image is shown at the top of the card. Images that are too small to display well (below 300×150 px) are automatically suppressed — detected first via URL query parameters (e.g. The Guardian's `?width=140`) and then via a `naturalWidth`/`naturalHeight` check after load.
  - **Unread tracking** — unread articles have a blue left border and bold title. Clicking a title or saving as a note marks it read. A **Mark all read** button appears in the header when there are unread items. Read state is stored in `localStorage` (per-device — no git commits per article click).
  - **Refresh** — a refresh button clears the in-memory feed cache and re-fetches all feeds in parallel, with a spinner while loading. Skeleton placeholder cards are shown on first visit before feeds have loaded.
  - **`useAllFeeds()` hook** (`src/hooks/feeds.ts`) — new parallel-fetch hook that manages per-feed loading/error states, the shared in-memory cache, and the refresh trigger.
  - **`src/utils/read-articles.ts`** — new utility for persisting read article IDs in `localStorage`, capped at 2 000 entries to avoid storage bloat.

## 2026-W20

### New

- **RSS Feed Reader** — Lumen can now subscribe to and read RSS/Atom feeds. Access via the new **Feeds** entry in the sidebar (between Tags and the bottom section).
  - **Feed list** (`/feeds`) — subscribe by pasting any RSS/Atom URL; the feed title is auto-fetched on add.
  - **Article view** (`/feeds/{id}`) — lists up to 50 articles per feed with title, excerpt, author, and publication date. Each article links out to the original source.
  - **Save as note** — hover over any article and click the note icon to save it as a Lumen note pre-filled with the title, source link, date, and excerpt. The note opens with the tag `rss` and is ready for editing.
  - **`api/rss.ts`** — new Vercel Function that fetches and parses feeds server-side using `rss-parser`, avoiding browser CORS restrictions entirely. Responses are cached for 5 minutes.
  - Feed subscriptions are also manageable from **Settings → Feeds**.
  - **Feed persistence via `.lumen/feeds.json`** — subscribed feeds are stored in `.lumen/feeds.json` inside the connected git repository, not in browser localStorage. This means feed subscriptions sync across all your devices automatically via the existing git sync mechanism (add a feed on desktop → it appears on iPhone after the next sync). On first load, any feeds previously saved in localStorage are automatically migrated to the JSON file and the localStorage key is cleared. The `WRITE_FILES` state machine event was extended with a `rawFiles` field to support writing repo-root-relative files (like `.lumen/feeds.json`) independently of the workspace `notesPath`.
- **Vercel Web Analytics** — added `@vercel/analytics` and the `<Analytics />` component to the app root (`src/routes/__root.tsx`). Page view and navigation events are now tracked automatically in the Vercel dashboard with no client-side configuration required.

### Fixed

- **Sync errors now show actionable messages in the sidebar** — previously all sync failures showed a generic "Sync error" label with no explanation or next step. The sync error is now stored in the state machine context and classified by type. A `401` HTTP error (expired or revoked GitHub token) shows "Auth error" with the message "GitHub authentication failed — your token may have expired." and an inline "Re-authenticate in Settings" link. All other errors show the raw error message with a "Retry" button. The error clears automatically once sync recovers. Changes across `src/global-state.ts` (new `syncError` context field + `setSyncError`/`clearSyncError` actions), `src/components/sync-status.tsx` (new `useSyncError` hook with error classification), and `src/components/nav-items.tsx` (error detail rendered below the sync status row).
- **`MergeNotSupportedError` on sync (diverged histories)** — when the app had local commits (e.g. a note written on desktop) and the remote also had new commits (e.g. a note pushed from iPhone), isomorphic-git threw `MergeNotSupportedError` because it only supports fast-forward pulls. The sync state machine logged a "Sync error" and stalled until the browser cache was cleared. Fixed in `src/utils/git.ts` by catching `MergeNotSupportedError` in `gitPull` and falling back to a fetch → reset → reapply strategy: fetch the remote state, identify files that exist locally but not on remote (local-only additions), hard-reset the local branch to the remote HEAD (so all remote notes are now on disk), reapply the saved local-only files as a new commit on top, then push. All remote notes and all locally-created notes are preserved; in the rare case the same note was edited on two devices simultaneously, the remote version wins.
- **`MissingNameError` on git pull** — isomorphic-git's `pull` requires an author name/email to create merge commits, but was relying solely on reading these from the `.git/config` file inside the cloned repo. If the browser's IndexedDB storage was ever cleared (losing the cloned repo) the config file would be absent and every subsequent sync attempt would fail with `MissingNameError`. Fixed by passing `author` explicitly to `git.pull()` in `src/utils/git.ts`, with `user.login` as a fallback for accounts that have no display name set and `{login}@users.noreply.github.com` as a fallback email.
- **HTML entities in feed titles and excerpts** — some feeds (e.g. kottke.org) include raw HTML character references such as `&#8220;` (left double quote) and `&#8217;` (right single quote) in their title and content fields. These now render as the correct Unicode characters. The `decodeEntities()` function in `api/rss.ts` handles numeric decimal, numeric hex, and the six common named entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, `&nbsp;`).

### Improved

- **OpenAI model upgraded to `gpt-5.4-nano`** — updated `api/ai-enhance.ts` to use the latest model. Also switched the token limit parameter from the legacy `max_tokens` to `max_completion_tokens`, which is required by the new model.

### Package updates

- **Migrated to `jotai-babel`** — replaced the deprecated `jotai/babel/plugin-debug-label` and `jotai/babel/plugin-react-refresh` imports in `vite.config.ts` with the new `jotai-babel` package (`jotai-babel/plugin-debug-label` and `jotai-babel/plugin-react-refresh`). The API is identical — this is a drop-in path change. Eliminates the deprecation warnings on dev server start and future-proofs the setup for jotai v3. Also reduced vulnerability count from 50 → 42.
- **Updated** `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` to latest, and `patch-package` to latest — reduced vulnerability count from 57 to 50. The remaining vulnerabilities are all within the `vercel` CLI dev tool or packages with no fix currently available (`@tanstack/history`, `elliptic`, `vite/esbuild`) — zero production impact.

## 2026-W19

### New

- **Mobile AI assistant** — a sparkle (✨) button now appears in the floating action bar when editing a note on mobile or tablet. Tapping it opens a bottom sheet with three modes:
  - **Continue writing** — AI continues from the cursor position with no prompt needed.
  - **Compose** — give an instruction (e.g. "Write a paragraph about the coastal scenery") and the result is inserted at the cursor.
  - **Ask** — ask a question about your topic; the answer is shown with Copy and Insert options.
  - The sheet captures the cursor position at open time, so scrolling or tapping elsewhere doesn't shift where content lands.

- **AI writing assistant in the note editor** from https://codemirror-ai-enhancer.vercel.app
  - Three AI-powered commands are now available inside any note (powered by OpenAI via a server-side Vercel Function, key never exposed to the browser):
    - **Cmd+J** — continues writing from the cursor position, matching your tone and context. Ghost text streams in; press Tab to accept.
    - **Cmd+K** — compose panel. With text selected: rewrites it per your instruction. With nothing selected: generates new content from your prompt. Tab to accept.
    - **Cmd+L** — Q&A reference panel. Ask a question (e.g. "Where is Rogoznica?") and the answer appears inline. Click the answer to copy it to the clipboard, then paste wherever you need it. This command does not work in Safari. In Safari the command opens the browser's address bar. 
  - **`api/ai-enhance`** — new server-side Vercel Function that handles all three AI modes, builds context-aware prompts from the surrounding document, and streams the OpenAI response back to the editor.
  - **`scripts/dev-vercel.mjs`** — wrapper script for `npm run dev:vercel` that pre-loads sensitive API keys (e.g. `OPENAI_API_KEY`, `TMDB_API_KEY`) from a gitignored `.env.keys` file before starting the Vercel dev server. Fixes a Vercel limitation where Sensitive environment variables cannot be set for the Development environment and are therefore absent from `vercel env pull`.

### Removed

- **`api/log-user`** — removed the upstream developer's analytics endpoint and its corresponding `logUser` state machine action. The function logged each app open to an external Supabase database; without `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` env vars it threw a 500 error on every page load, filling Vercel logs with noise. Not needed for a self-hosted deployment.

### Improved

- **Repo picker in workspace form** — when adding an existing workspace, the repository field is now a dropdown populated from `GET /user/repos`, listing all accessible repos (sorted by recently updated, 🔒 prefix for private). No more typing owner and name by hand.
- **Repo size in settings** — each workspace row in Settings now shows the current repository size (e.g. `305 kB`, `1.2 MB`) fetched from the GitHub API.
- **Repo size in sidebar** — the repository size is displayed in the bottom of the sidebar with a database icon, above the appearance toggle, so it's always visible at a glance.
- **Sidebar auth-gating** — on initial load (before signing in), the sidebar bottom section is simplified to just Settings and Help. The Update, Offline indicator, repo size, appearance toggle, docs and sync status items are hidden until the user is signed in, keeping the onboarding experience clean.

### Package updates

All dependencies updated to latest compatible versions across 7 phases.

| Phase | Change | Result |
|---|---|---|
| 1 — Security fix | Addressed known vulnerabilities | 67 → 47 vulnerabilities |
| 2 — Patch/minor updates | `npm update` across all packages | ~80 packages updated, 4 TypeScript fixes |
| 3 — Storybook 8.6.18 | Explicit install of all Storybook packages | Fixed deployment peer-dep conflict |
| 4 — CodeMirror 6.x | Updated all `@codemirror/*` and `@lezer/*` packages | All packages now consistent |
| 5 — Tailwind 4.2.4 | Updated Tailwind CSS and related plugins | ✅ |
| 6 — TanStack Router plugins | Updated `@tanstack/router-plugin` and `@tanstack/react-router` | ✅ |
| 7 — UI and AI libraries | Updated jotai, openai, AI SDK, and Radix UI packages | ✅ |

**Remaining vulnerabilities:** 47, all within the `vercel` CLI dev tool — zero production impact.

**Packages intentionally skipped** (major version jumps deferred for separate sessions):

- `xstate` 4 → 5
- `react` 18 → 19
- `vite` 5 → 8
- `eslint` 8 → 9
- `typescript` 5 → 6

### Fixed

### Bug fix: cmd-k palette crash on "Show all" / "Create new note"

Arrowing down to the "Show all N notes matching …" or "Create new note …" items in the cmd-k search palette caused the app to crash.

**Root cause:** `cmdk` tracks list items internally using a `querySelector` built from each item's `data-value` attribute. When no explicit `value` prop is supplied, cmdk falls back to the item's rendered text content. Both action items wrap the search query in decorative double-quotes (e.g. `matching "linux"`), which broke the generated CSS selector:

```
querySelector('[data-value="show all 1 note matching "linux""]')
//                                                   ^ terminates the string early
```

**Fix:** Added explicit `value` props (quote-free) to the three affected `CommandItem` elements in `src/components/command-menu.tsx`:

| Item | `value` prop |
|---|---|
| Show all tags | `` `show-all-tags-${query}` `` |
| Show all notes | `` `show-all-notes-${query}` `` |
| Create new note | `` `create-new-note-${query}` `` |

The displayed text (with its decorative quotes) is unchanged.

## 2026-W08

### Improved

- Move tasks to any note, not just Today/Tomorrow/Next week. The "Move to" menu now lets you search across your notes, use natural dates ("friday", "next month", "in 2 weeks"), or create a new note on the fly.

## 2026-W06

### New

- Notes with an IMDb `url` now display movie and TV poster art, similar to how notes with an `isbn` show book covers.

### Improved

- Cheatsheet dialog replaced with a help panel (⌘/) that stays open while you work, so you can reference shortcuts or markdown syntax without interrupting what you're doing.
- Hovering a footnote reference now shows a preview of the footnote content, so you can read it without jumping to the bottom of the page.
- "Read" and "Write" renamed to "View" and "Edit" in the note page mode switcher for clarity.

### Fixed

- Quotes in shared note titles now display correctly in link previews (e.g. when sharing a note on Discord or Twitter).
