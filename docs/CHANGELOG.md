# Changelog

## 2026-W19

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
