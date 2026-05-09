# Changelog

## 2026-W19

### Removed

- **`api/log-user`** — removed the upstream developer's analytics endpoint and its corresponding `logUser` state machine action. The function logged each app open to an external Supabase database; without `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` env vars it threw a 500 error on every page load, filling Vercel logs with noise. Not needed for a self-hosted deployment.

### Improved

- **Repo picker in workspace form** — when adding an existing workspace, the repository field is now a dropdown populated from `GET /user/repos`, listing all accessible repos (sorted by recently updated, 🔒 prefix for private). No more typing owner and name by hand.
- **Repo size in settings** — each workspace row in Settings now shows the current repository size (e.g. `305 kB`, `1.2 MB`) fetched from the GitHub API.
- **Repo size in sidebar** — the repository size is displayed in the bottom of the sidebar with a database icon, above the appearance toggle, so it's always visible at a glance.

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
