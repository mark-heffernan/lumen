import { Searcher } from "fast-fuzzy"
import git, { WORKDIR } from "isomorphic-git"
import { atom } from "jotai"
import { atomWithMachine } from "jotai-xstate"
import { atomWithStorage, selectAtom } from "jotai/utils"
import { assign, createMachine, raise } from "xstate"
import { v4 as uuidv4 } from "uuid"
import { z } from "zod"
import {
  Font,
  GitHubRepository,
  GitHubUser,
  Note,
  NoteId,
  Template,
  Workspace,
  githubUserSchema,
  templateSchema,
  workspaceSchema,
} from "./schema"
import { fs, fsDeleteDir, fsWipe } from "./utils/fs"
import {
  getRemoteOriginUrl,
  gitAdd,
  gitClone,
  gitCommit,
  gitPull,
  gitPush,
  gitRemove,
  isRepoSynced,
} from "./utils/git"
import { parseNote } from "./utils/parse-note"
import { removeTemplateFrontmatter } from "./utils/remove-template-frontmatter"
import { getSampleMarkdownFiles } from "./utils/sample-markdown-files"
import { startTimer } from "./utils/timer"

// -----------------------------------------------------------------------------
// State machine
// -----------------------------------------------------------------------------

const GITHUB_USER_STORAGE_KEY = "github_user" as const
const MARKDOWN_FILES_STORAGE_KEY = "markdown_files" as const
const WORKSPACES_STORAGE_KEY = "workspaces" as const
const ACTIVE_WORKSPACE_ID_KEY = "active_workspace_id" as const

// The legacy single-repo clone lives at "/repo" for backward compatibility
const LEGACY_WORKSPACE_ID = "legacy"
const LEGACY_REPO_DIR = "/repo"

export function getWorkspaceDir(workspaceId: string): string {
  if (workspaceId === LEGACY_WORKSPACE_ID) return LEGACY_REPO_DIR
  return `/repos/${workspaceId}`
}

type Context = {
  githubUser: GitHubUser | null
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  markdownFiles: Record<string, string>
  error: Error | null
}

type Event =
  | { type: "SIGN_IN"; githubUser: GitHubUser }
  | { type: "SIGN_OUT" }
  | { type: "ADD_WORKSPACE"; workspace: Workspace }
  | { type: "SELECT_WORKSPACE"; workspaceId: string }
  | { type: "REMOVE_WORKSPACE"; workspaceId: string }
  | { type: "SYNC" }
  | { type: "SYNC_DEBOUNCED" }
  | {
      type: "WRITE_FILES"
      markdownFiles: Record<string, string | null>
      commitMessage?: string
    }
  | { type: "DELETE_FILE"; filepath: string }

function parseWorkspacesFromStorage(): Workspace[] {
  try {
    const raw = localStorage.getItem(WORKSPACES_STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return z.array(workspaceSchema).parse(data)
  } catch {
    return []
  }
}

function saveWorkspacesToStorage(workspaces: Workspace[]) {
  localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(workspaces))
}

function getActiveWorkspace(context: Context): Workspace | null {
  return context.workspaces.find((w) => w.id === context.activeWorkspaceId) ?? null
}

function createGlobalStateMachine() {
  const initialWorkspaces = parseWorkspacesFromStorage()
  const initialActiveWorkspaceId = localStorage.getItem(ACTIVE_WORKSPACE_ID_KEY)

  return createMachine(
    {
      id: "global",
      schema: {} as {
        context: Context
        events: Event
        services: {
          resolveUser: {
            data: { githubUser: GitHubUser }
          }
          resolveRepo: {
            data: {
              markdownFiles: Record<string, string>
              migratedWorkspace?: Workspace
            }
          }
          cloneRepo: {
            data: { markdownFiles: Record<string, string> }
          }
          pull: {
            data: { markdownFiles: Record<string, string> }
          }
          push: {
            data: void
          }
          checkStatus: {
            data: { isSynced: boolean }
          }
          writeFiles: {
            data: void
          }
          deleteFile: {
            data: void
          }
        }
      },
      predictableActionArguments: true,
      initial: "resolvingUser",
      context: {
        githubUser: null,
        workspaces: initialWorkspaces,
        activeWorkspaceId: initialActiveWorkspaceId,
        markdownFiles: {},
        error: null,
      },
      states: {
        resolvingUser: {
          invoke: {
            src: "resolveUser",
            onDone: {
              target: "signedIn",
              actions: ["setGitHubUser", "setGitHubUserLocalStorage"],
            },
            onError: "signedOut",
          },
        },
        signedOut: {
          entry: [
            "clearGitHubUser",
            "clearGitHubUserLocalStorage",
            "clearMarkdownFilesLocalStorage",
            "clearFileSystem",
            "setSampleMarkdownFiles",
          ],
          exit: ["clearMarkdownFiles"],
          on: {
            SIGN_IN: {
              target: "signedIn",
              actions: ["setGitHubUser", "setGitHubUserLocalStorage"],
            },
          },
        },
        signedIn: {
          on: {
            SIGN_OUT: "signedOut",
          },
          initial: "resolvingRepo",
          states: {
            resolvingRepo: {
              invoke: {
                src: "resolveRepo",
                onDone: {
                  target: "cloned",
                  actions: [
                    "applyMigratedWorkspace",
                    "setMarkdownFiles",
                    "setMarkdownFilesLocalStorage",
                  ],
                },
                onError: "notCloned",
              },
            },
            notCloned: {
              on: {
                ADD_WORKSPACE: "cloningRepo",
              },
            },
            cloningRepo: {
              entry: ["setActiveWorkspace", "clearMarkdownFiles", "clearMarkdownFilesLocalStorage"],
              invoke: {
                src: "cloneRepo",
                onDone: {
                  target: "cloned.sync.success",
                  actions: ["setMarkdownFiles", "setMarkdownFilesLocalStorage"],
                },
                onError: {
                  target: "notCloned",
                  actions: ["revertActiveWorkspaceOnError", "setError"],
                },
              },
            },
            cloned: {
              on: {
                ADD_WORKSPACE: "cloningRepo",
                SELECT_WORKSPACE: {
                  target: "cloningRepo",
                  actions: "setActiveWorkspaceId",
                },
                REMOVE_WORKSPACE: [
                  {
                    cond: "isRemovingActiveWorkspace",
                    target: "resolvingRepo",
                    actions: "removeWorkspace",
                  },
                  {
                    actions: "removeWorkspace",
                  },
                ],
              },
              type: "parallel",
              states: {
                change: {
                  initial: "idle",
                  states: {
                    idle: {
                      on: {
                        WRITE_FILES: "writingFiles",
                        DELETE_FILE: "deletingFile",
                      },
                    },
                    writingFiles: {
                      entry: ["mergeMarkdownFiles", "mergeMarkdownFilesLocalStorage"],
                      invoke: {
                        src: "writeFiles",
                        onDone: {
                          target: "idle",
                          actions: raise("SYNC_DEBOUNCED"),
                        },
                        onError: {
                          target: "idle",
                          actions: "setError",
                        },
                      },
                    },
                    deletingFile: {
                      entry: ["deleteMarkdownFile", "deleteMarkdownFileLocalStorage"],
                      invoke: {
                        src: "deleteFile",
                        onDone: {
                          target: "idle",
                          actions: raise("SYNC_DEBOUNCED"),
                        },
                        onError: {
                          target: "idle",
                          actions: "setError",
                        },
                      },
                    },
                  },
                },
                sync: {
                  initial: "pulling",
                  states: {
                    success: {
                      on: {
                        SYNC: "pulling",
                        SYNC_DEBOUNCED: "debouncing",
                      },
                    },
                    error: {
                      entry: "logError",
                      on: {
                        SYNC: "pulling",
                        SYNC_DEBOUNCED: "debouncing",
                      },
                    },
                    debouncing: {
                      after: {
                        1000: "pulling",
                      },
                      on: {
                        SYNC: "pulling",
                        SYNC_DEBOUNCED: "debouncing",
                      },
                    },
                    pulling: {
                      always: [
                        // Don't pull if offline
                        { target: "success", cond: "isOffline" },
                      ],
                      invoke: {
                        src: "pull",
                        onDone: {
                          target: "pushing",
                          actions: ["setMarkdownFiles", "setMarkdownFilesLocalStorage"],
                        },
                        onError: "error",
                      },
                    },
                    pushing: {
                      always: [
                        // Don't push if offline
                        { target: "success", cond: "isOffline" },
                      ],
                      invoke: {
                        src: "push",
                        onDone: "checkingStatus",
                        onError: "error",
                      },
                    },
                    checkingStatus: {
                      on: {
                        SYNC: "pulling",
                        SYNC_DEBOUNCED: "debouncing",
                      },
                      invoke: {
                        src: "checkStatus",
                        onDone: [
                          {
                            target: "success",
                            cond: "isSynced",
                          },
                          // If not synced, pull again
                          {
                            target: "pulling",
                          },
                        ],
                        onError: "error",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    {
      guards: {
        isOffline: () => !navigator.onLine,
        isSynced: (_, event) => (event as unknown as { data: { isSynced: boolean } }).data.isSynced,
        isRemovingActiveWorkspace: (context, event) => {
          const e = event as { type: "REMOVE_WORKSPACE"; workspaceId: string }
          return e.workspaceId === context.activeWorkspaceId
        },
      },
      services: {
        resolveUser: async () => {
          // First, check URL params for user metadata
          const searchParams = new URLSearchParams(window.location.search)
          const token = searchParams.get("user_token")
          const id = searchParams.get("user_id")
          const login = searchParams.get("user_login")
          const name = searchParams.get("user_name")
          const email = searchParams.get("user_email")

          if (token && login && name && email) {
            const idNumberRaw = id ? Number(id) : undefined
            const idNumber = Number.isFinite(idNumberRaw) ? idNumberRaw : undefined

            // Remove user metadata from URL
            searchParams.delete("user_token")
            searchParams.delete("user_id")
            searchParams.delete("user_login")
            searchParams.delete("user_name")
            searchParams.delete("user_email")

            window.location.replace(
              `${window.location.pathname}${
                searchParams.toString() ? `?${searchParams.toString()}` : ""
              }`,
            )

            return { githubUser: { token, id: idNumber, login, name, email } }
          }

          // Next, check localStorage for user metadata
          const githubUser = JSON.parse(localStorage.getItem(GITHUB_USER_STORAGE_KEY) ?? "null")
          return { githubUser: githubUserSchema.parse(githubUser) }
        },
        resolveRepo: async (context) => {
          const stopTimer = startTimer("resolveRepo()")

          const workspace = getActiveWorkspace(context)

          // Migration: no workspaces yet, but legacy repo may exist at /repo
          if (!workspace) {
            const remoteOriginUrl = await getRemoteOriginUrl(LEGACY_REPO_DIR)
            const repo = String(remoteOriginUrl).replace(/^https:\/\/github.com\//, "")
            const [owner, name] = repo.split("/")

            if (!owner || !name) throw new Error("No workspace configured")

            const migratedWorkspace: Workspace = {
              id: LEGACY_WORKSPACE_ID,
              name: "My Notes",
              githubRepo: { owner, name },
              notesPath: "",
              uploadsPath: "",
            }

            const markdownFiles =
              getMarkdownFilesFromLocalStorage() ??
              (await getMarkdownFilesFromFs(LEGACY_REPO_DIR, ""))

            stopTimer()
            return { markdownFiles, migratedWorkspace }
          }

          const dir = getWorkspaceDir(workspace.id)
          const markdownFiles =
            getMarkdownFilesFromLocalStorage() ??
            (await getMarkdownFilesFromFs(dir, workspace.notesPath))

          stopTimer()
          return { markdownFiles }
        },
        cloneRepo: async (context) => {
          if (!context.githubUser) throw new Error("Not signed in")

          const workspace = getActiveWorkspace(context)
          if (!workspace) throw new Error("No workspace selected")

          const dir = getWorkspaceDir(workspace.id)

          // Prepare directory: delete existing contents, then ensure dir exists
          await fsDeleteDir(dir)
          if (dir !== LEGACY_REPO_DIR) {
            await fs.promises.mkdir("/repos").catch(() => {})
            await fs.promises.mkdir(dir).catch(() => {})
          }

          await gitClone(workspace.githubRepo, context.githubUser, dir)

          return {
            markdownFiles: await getMarkdownFilesFromFs(dir, workspace.notesPath),
          }
        },
        pull: async (context) => {
          if (!context.githubUser) throw new Error("Not signed in")

          const workspace = getActiveWorkspace(context)
          if (!workspace) throw new Error("No workspace selected")

          const dir = getWorkspaceDir(workspace.id)
          await gitPull(context.githubUser, dir)

          return {
            markdownFiles: await getMarkdownFilesFromFs(dir, workspace.notesPath),
          }
        },
        push: async (context) => {
          if (!context.githubUser) throw new Error("Not signed in")

          const workspace = getActiveWorkspace(context)
          if (!workspace) throw new Error("No workspace selected")

          await gitPush(context.githubUser, getWorkspaceDir(workspace.id))
        },
        checkStatus: async (context) => {
          const workspace = getActiveWorkspace(context)
          if (!workspace) return { isSynced: true }
          return { isSynced: await isRepoSynced(getWorkspaceDir(workspace.id)) }
        },
        writeFiles: async (context, event) => {
          if (!context.githubUser) throw new Error("Not signed in")
          if (event.type !== "WRITE_FILES") throw new Error("Invalid event")

          const workspace = getActiveWorkspace(context)
          if (!workspace) throw new Error("No workspace selected")

          const dir = getWorkspaceDir(workspace.id)
          const notesPath = workspace.notesPath

          const entries = Object.entries(event.markdownFiles)
          const filesToWrite = entries.filter(([, content]) => content !== null)
          const filesToDelete = entries.filter(([, content]) => content === null)
          const fileList = entries.map(([filepath]) => filepath)
          const commitMessage = event.commitMessage ?? `Update ${fileList.join(" ") || "notes"}`

          // Write files to file system (paths are relative to notesPath)
          for (const [filepath, content] of filesToWrite) {
            if (content === null) continue

            // Full path within repo: notesPath/filepath
            const repoFilepath = notesPath ? `${notesPath}/${filepath}` : filepath
            const dirPath = repoFilepath.split("/").slice(0, -1).join("/")

            if (dirPath) {
              let currentPath = dir
              for (const segment of dirPath.split("/")) {
                currentPath = `${currentPath}/${segment}`
                const stats = await fs.promises.stat(currentPath).catch(() => null)
                if (!stats) await fs.promises.mkdir(currentPath)
              }
            }

            await fs.promises.writeFile(`${dir}/${repoFilepath}`, content, "utf8")
          }

          // Delete files from file system
          for (const [filepath] of filesToDelete) {
            const repoFilepath = notesPath ? `${notesPath}/${filepath}` : filepath
            await fs.promises.unlink(`${dir}/${repoFilepath}`).catch(() => null)
          }

          // Stage files (git paths are relative to repo root)
          const gitPathsToAdd = filesToWrite.map(([filepath]) =>
            notesPath ? `${notesPath}/${filepath}` : filepath,
          )
          if (gitPathsToAdd.length > 0) {
            await gitAdd(gitPathsToAdd, dir)
          }

          for (const [filepath] of filesToDelete) {
            const repoFilepath = notesPath ? `${notesPath}/${filepath}` : filepath
            try {
              await gitRemove(repoFilepath, dir)
            } catch {
              // Ignore if the file isn't tracked
            }
          }

          await gitCommit(commitMessage, dir)
        },
        deleteFile: async (context, event) => {
          if (!context.githubUser) throw new Error("Not signed in")
          if (event.type !== "DELETE_FILE") throw new Error("Invalid event")

          const workspace = getActiveWorkspace(context)
          if (!workspace) throw new Error("No workspace selected")

          const dir = getWorkspaceDir(workspace.id)
          const notesPath = workspace.notesPath
          const repoFilepath = notesPath ? `${notesPath}/${event.filepath}` : event.filepath

          await fs.promises.unlink(`${dir}/${repoFilepath}`)
          await gitRemove(repoFilepath, dir)
          await gitCommit(`Delete ${event.filepath}`, dir)
        },
      },
      actions: {
        setGitHubUser: assign({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          githubUser: (_, event: any) => {
            switch (event.type) {
              case "SIGN_IN":
                return event.githubUser as GitHubUser
              case "done.invoke.global.resolvingUser:invocation[0]":
                return (event.data as { githubUser: GitHubUser }).githubUser
              default:
                return null
            }
          },
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setGitHubUserLocalStorage: (_: Context, event: any) => {
          switch (event.type) {
            case "SIGN_IN":
              localStorage.setItem(GITHUB_USER_STORAGE_KEY, JSON.stringify(event.githubUser))
              break
            case "done.invoke.global.resolvingUser:invocation[0]":
              localStorage.setItem(
                GITHUB_USER_STORAGE_KEY,
                JSON.stringify((event.data as { githubUser: GitHubUser }).githubUser),
              )
              break
          }
        },
        clearGitHubUser: assign({
          githubUser: null,
        }),
        clearGitHubUserLocalStorage: () => {
          localStorage.removeItem(GITHUB_USER_STORAGE_KEY)
        },
        // Applies the workspace migrated from the legacy single-repo format
        applyMigratedWorkspace: assign({
          workspaces: (context, event) => {
            const data = (event as unknown as { data: { migratedWorkspace?: Workspace } }).data
            if (!data.migratedWorkspace) return context.workspaces
            const already = context.workspaces.find((w) => w.id === data.migratedWorkspace!.id)
            if (already) return context.workspaces
            const updated = [...context.workspaces, data.migratedWorkspace]
            saveWorkspacesToStorage(updated)
            return updated
          },
          activeWorkspaceId: (context, event) => {
            const data = (event as unknown as { data: { migratedWorkspace?: Workspace } }).data
            if (!data.migratedWorkspace) return context.activeWorkspaceId
            localStorage.setItem(ACTIVE_WORKSPACE_ID_KEY, data.migratedWorkspace.id)
            return data.migratedWorkspace.id
          },
        }),
        // Sets the active workspace when ADD_WORKSPACE is dispatched (adds to list + sets active)
        setActiveWorkspace: assign({
          workspaces: (context, event) => {
            if (event.type !== "ADD_WORKSPACE") return context.workspaces
            const updated = [...context.workspaces, event.workspace]
            saveWorkspacesToStorage(updated)
            return updated
          },
          activeWorkspaceId: (context, event) => {
            if (event.type !== "ADD_WORKSPACE") return context.activeWorkspaceId
            localStorage.setItem(ACTIVE_WORKSPACE_ID_KEY, event.workspace.id)
            return event.workspace.id
          },
        }),
        // Sets just the active workspace ID when SELECT_WORKSPACE is dispatched
        setActiveWorkspaceId: assign({
          activeWorkspaceId: (context, event) => {
            if (event.type !== "SELECT_WORKSPACE") return context.activeWorkspaceId
            localStorage.setItem(ACTIVE_WORKSPACE_ID_KEY, event.workspaceId)
            return event.workspaceId
          },
        }),
        // If a clone fails for a new workspace, remove it from the list
        revertActiveWorkspaceOnError: assign({
          workspaces: (context) => {
            // Only revert if the active workspace was just added (not pre-existing)
            const workspace = getActiveWorkspace(context)
            if (!workspace) return context.workspaces
            const isLegacy = workspace.id === LEGACY_WORKSPACE_ID
            if (isLegacy) return context.workspaces
            // If there was more than one workspace before, revert to the previous list
            if (context.workspaces.length <= 1) return context.workspaces
            // Remove the workspace that failed to clone
            const updated = context.workspaces.filter((w) => w.id !== context.activeWorkspaceId)
            saveWorkspacesToStorage(updated)
            return updated
          },
          activeWorkspaceId: (context) => {
            const workspace = getActiveWorkspace(context)
            if (!workspace || workspace.id === LEGACY_WORKSPACE_ID) return context.activeWorkspaceId
            if (context.workspaces.length <= 1) return context.activeWorkspaceId
            const remaining = context.workspaces.filter((w) => w.id !== context.activeWorkspaceId)
            const newActiveId = remaining[0]?.id ?? null
            if (newActiveId) localStorage.setItem(ACTIVE_WORKSPACE_ID_KEY, newActiveId)
            return newActiveId
          },
        }),
        removeWorkspace: assign({
          workspaces: (context, event) => {
            if (event.type !== "REMOVE_WORKSPACE") return context.workspaces
            const updated = context.workspaces.filter((w) => w.id !== event.workspaceId)
            saveWorkspacesToStorage(updated)
            return updated
          },
          activeWorkspaceId: (context, event) => {
            if (event.type !== "REMOVE_WORKSPACE") return context.activeWorkspaceId
            if (context.activeWorkspaceId !== event.workspaceId) return context.activeWorkspaceId
            const remaining = context.workspaces.filter((w) => w.id !== event.workspaceId)
            const newActiveId = remaining[0]?.id ?? null
            if (newActiveId) localStorage.setItem(ACTIVE_WORKSPACE_ID_KEY, newActiveId)
            else localStorage.removeItem(ACTIVE_WORKSPACE_ID_KEY)
            return newActiveId
          },
        }),
        clearFileSystem: () => {
          fsWipe()
        },
        setMarkdownFiles: assign({
          markdownFiles: (_, event) =>
            (event as unknown as { data: { markdownFiles: Record<string, string> } }).data
              .markdownFiles,
        }),
        setSampleMarkdownFiles: assign({
          markdownFiles: getSampleMarkdownFiles(),
        }),
        setMarkdownFilesLocalStorage: (_, event) => {
          localStorage.setItem(
            MARKDOWN_FILES_STORAGE_KEY,
            JSON.stringify(
              (event as unknown as { data: { markdownFiles: Record<string, string> } }).data
                .markdownFiles,
            ),
          )
        },
        mergeMarkdownFiles: assign({
          markdownFiles: (context, event) => {
            if (event.type !== "WRITE_FILES") return context.markdownFiles
            const merged = { ...context.markdownFiles }
            for (const [filepath, content] of Object.entries(event.markdownFiles)) {
              if (content === null) {
                delete merged[filepath]
              } else {
                merged[filepath] = content
              }
            }
            return merged
          },
        }),
        mergeMarkdownFilesLocalStorage: (context, event) => {
          if (event.type !== "WRITE_FILES") return
          const merged = { ...context.markdownFiles }
          for (const [filepath, content] of Object.entries(event.markdownFiles)) {
            if (content === null) {
              delete merged[filepath]
            } else {
              merged[filepath] = content
            }
          }
          localStorage.setItem(MARKDOWN_FILES_STORAGE_KEY, JSON.stringify(merged))
        },
        deleteMarkdownFile: assign({
          markdownFiles: (context, event) => {
            if (event.type !== "DELETE_FILE") return context.markdownFiles
            const { [event.filepath]: _, ...markdownFiles } = context.markdownFiles
            return markdownFiles
          },
        }),
        deleteMarkdownFileLocalStorage: (context, event) => {
          if (event.type !== "DELETE_FILE") return
          const { [event.filepath]: _, ...markdownFiles } = context.markdownFiles
          localStorage.setItem(MARKDOWN_FILES_STORAGE_KEY, JSON.stringify(markdownFiles))
        },
        clearMarkdownFiles: assign({
          markdownFiles: {},
        }),
        clearMarkdownFilesLocalStorage: () => {
          localStorage.removeItem(MARKDOWN_FILES_STORAGE_KEY)
        },
        setError: assign({
          // TODO: Remove `as Error`
          error: (_, event) => (event as unknown as { data: Error }).data as Error,
        }),
        logError: (_, event) => {
          console.error((event as unknown as { data: unknown }).data)
        },
      },
    },
  )
}

/** Get cached markdown files from local storage */
function getMarkdownFilesFromLocalStorage() {
  const markdownFiles = JSON.parse(localStorage.getItem(MARKDOWN_FILES_STORAGE_KEY) ?? "null")
  if (!markdownFiles) return null
  const parsedMarkdownFiles = z.record(z.string(), z.string()).safeParse(markdownFiles)
  return parsedMarkdownFiles.success ? parsedMarkdownFiles.data : null
}

/**
 * Walk the file system and return the contents of all markdown files.
 * When notesPath is set, only files within that subdirectory are returned,
 * with paths relative to notesPath (not the repo root).
 */
async function getMarkdownFilesFromFs(dir: string, notesPath: string) {
  const stopTimer = startTimer("getMarkdownFilesFromFs()")

  const prefix = notesPath ? `${notesPath}/` : ""

  const entries = await git.walk({
    fs,
    dir,
    trees: [WORKDIR()],
    map: async (filepath, [entry]) => {
      if (!entry) return null

      // Ignore .git directory
      if (filepath.startsWith(".git")) return

      // If notesPath is set, ignore files outside of it
      if (prefix && !filepath.startsWith(prefix)) return

      // Strip the notesPath prefix so note IDs are relative to notesPath
      const noteFilepath = prefix ? filepath.slice(prefix.length) : filepath

      // Ignore non-markdown files
      if (!noteFilepath.endsWith(".md")) return

      // Get file content
      const content = await entry.content()

      if (!content) return null

      console.debug(noteFilepath, (await entry.stat()).size)

      return [noteFilepath, new TextDecoder().decode(content)]
    },
  })

  const markdownFiles = Object.fromEntries(entries)

  stopTimer()

  return markdownFiles
}

export const globalStateMachineAtom = atomWithMachine(createGlobalStateMachine)

export const markdownFilesAtom = selectAtom(
  globalStateMachineAtom,
  (state) => state.context.markdownFiles,
)

export const isRepoNotClonedAtom = selectAtom(globalStateMachineAtom, (state) =>
  state.matches("signedIn.notCloned"),
)

export const isCloningRepoAtom = selectAtom(globalStateMachineAtom, (state) =>
  state.matches("signedIn.cloningRepo"),
)

export const isRepoClonedAtom = selectAtom(globalStateMachineAtom, (state) =>
  state.matches("signedIn.cloned"),
)

export const isSignedOutAtom = selectAtom(globalStateMachineAtom, (state) =>
  state.matches("signedOut"),
)

// -----------------------------------------------------------------------------
// GitHub / Workspaces
// -----------------------------------------------------------------------------

export const githubUserAtom = selectAtom(
  globalStateMachineAtom,
  (state) => state.context.githubUser,
)

export const workspacesAtom = selectAtom(
  globalStateMachineAtom,
  (state) => state.context.workspaces,
)

export const activeWorkspaceAtom = atom((get) => {
  const state = get(globalStateMachineAtom)
  const { workspaces, activeWorkspaceId } = state.context
  return workspaces.find((w) => w.id === activeWorkspaceId) ?? null
})

/** The GitHub repo of the currently active workspace (for backward compatibility) */
export const githubRepoAtom = atom((get) => {
  const workspace = get(activeWorkspaceAtom)
  return workspace?.githubRepo ?? null
})

/** The filesystem directory of the currently active workspace's git clone */
export const activeRepoDirAtom = atom((get) => {
  const state = get(globalStateMachineAtom)
  const { workspaces, activeWorkspaceId } = state.context
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
  if (!workspace) return LEGACY_REPO_DIR
  return getWorkspaceDir(workspace.id)
})

// -----------------------------------------------------------------------------
// Notes
// -----------------------------------------------------------------------------

export const notesAtom = atom((get) => {
  const markdownFiles = get(markdownFilesAtom)
  const notes: Map<NoteId, Note> = new Map()

  // Parse notes
  for (const filepath in markdownFiles) {
    const id = filepath.replace(/\.md$/, "")
    const content = markdownFiles[filepath]
    notes.set(id, parseNote(id, content))
  }

  // Derive backlinks
  for (const { id: sourceId, links } of notes.values()) {
    for (const targetId of links) {
      const backlinks = notes.get(targetId)?.backlinks
      // Skip if the source note is already a backlink
      if (backlinks?.includes(sourceId)) continue

      // Skip if the source note is linking to itself
      if (targetId === sourceId) continue

      backlinks?.push(sourceId)
    }
  }

  return notes
})

export const backlinksIndexAtom = atom((get) => {
  const notes = get(notesAtom)
  const index: Map<NoteId, NoteId[]> = new Map()

  for (const note of notes.values()) {
    if (note.links.length === 0) continue
    const uniqueTargets = new Set(note.links)
    for (const targetId of uniqueTargets) {
      if (targetId === note.id) continue
      const backlinks = index.get(targetId)
      if (backlinks) {
        backlinks.push(note.id)
      } else {
        index.set(targetId, [note.id])
      }
    }
  }

  return index
})

export const sortedNotesAtom = atom((get) => {
  const notes = get(notesAtom)

  // Sort notes by updatedAt in descending order (most recent first)
  return [...notes.values()].sort((a, b) => {
    // Pinned notes first
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1

    // Then by updatedAt descending (most recent first)
    // Notes without updatedAt (null) sort to bottom
    if (a.updatedAt !== null && b.updatedAt !== null) {
      if (a.updatedAt !== b.updatedAt) {
        return b.updatedAt - a.updatedAt
      }
    } else if (a.updatedAt !== null) {
      return -1 // a has timestamp, b doesn't -> a first
    } else if (b.updatedAt !== null) {
      return 1 // b has timestamp, a doesn't -> b first
    }

    // Fallback: favor numeric IDs (like timestamps) over non-numeric
    const aNumeric = /^\d+$/.test(a.id)
    const bNumeric = /^\d+$/.test(b.id)
    if (aNumeric && !bNumeric) return -1
    if (!aNumeric && bNumeric) return 1

    return b.id.localeCompare(a.id)
  })
})

export const pinnedNotesAtom = atom((get) => {
  const sortedNotes = get(sortedNotesAtom)
  return sortedNotes.filter((note) => note.pinned)
})

export const noteSearcherAtom = atom((get) => {
  const sortedNotes = get(sortedNotesAtom)
  return new Searcher(sortedNotes, {
    keySelector: (note) => [note.title, note.displayName, note.content, note.id, note.alias || ""],
    threshold: 0.8,
  })
})

// -----------------------------------------------------------------------------
// Tags
// -----------------------------------------------------------------------------

export const tagsAtom = atom((get) => {
  const notes = get(notesAtom)
  const tags: Record<string, NoteId[]> = {}

  for (const note of notes.values()) {
    for (const tag of note.tags) {
      // If the tag doesn't exist, create it
      if (!tags[tag]) tags[tag] = []
      // If the note isn't already linked to the tag, link it
      if (!tags[tag].includes(note.id)) tags[tag].push(note.id)
    }
  }

  return tags
})

export const sortedTagEntriesAtom = atom((get) => {
  const tags = get(tagsAtom)
  // Sort tags alphabetically in ascending order
  return Object.entries(tags).sort((a, b) => {
    return a[0].localeCompare(b[0])
  })
})

export const tagSearcherAtom = atom((get) => {
  const sortedTagEntries = get(sortedTagEntriesAtom)
  return new Searcher(sortedTagEntries, {
    keySelector: ([tag]) => tag,
    threshold: 0.8,
  })
})

// -----------------------------------------------------------------------------
// Dates
// -----------------------------------------------------------------------------

export const datesAtom = atom((get) => {
  const notes = get(notesAtom)
  const dates: Record<string, NoteId[]> = {}

  for (const note of notes.values()) {
    for (const date of note.dates) {
      // If the date doesn't exist, create it
      if (!dates[date]) dates[date] = []
      // If the note isn't already linked to the date, link it
      if (!dates[date].includes(note.id)) dates[date].push(note.id)
    }
  }

  return dates
})

// -----------------------------------------------------------------------------
// Templates
// -----------------------------------------------------------------------------

export const templatesAtom = atom((get) => {
  const notes = get(notesAtom)
  const templates: Record<string, Template> = {}

  for (const { id, content, frontmatter } of notes.values()) {
    const template = frontmatter["template"]

    // Skip if note isn't a template
    if (!template) continue

    try {
      const parsedTemplate = templateSchema.omit({ body: true }).parse(template)

      const body = removeTemplateFrontmatter(content)

      templates[id] = { ...parsedTemplate, body }
    } catch (error) {
      // Template frontmatter didn't match the schema
      console.error(error)
    }
  }

  return templates
})

export const dailyTemplateAtom = selectAtom(templatesAtom, (templates) =>
  Object.values(templates).find((t) => t.name.match(/^daily$/i)),
)

export const weeklyTemplateAtom = selectAtom(templatesAtom, (templates) =>
  Object.values(templates).find((t) => t.name.match(/^weekly$/i)),
)

// -----------------------------------------------------------------------------
// Tasks
// -----------------------------------------------------------------------------

export const tasksAtom = atom((get) => {
  const notes = get(notesAtom)
  return [...notes.values()].flatMap((note) => note.tasks.map((task) => ({ ...task, note })))
})

export const taskSearcherAtom = atom((get) => {
  const tasks = get(tasksAtom)
  return new Searcher(tasks, {
    keySelector: (task) => [task.text, task.note.title, task.note.displayName],
    threshold: 0.8,
  })
})

// -----------------------------------------------------------------------------
// UI state
// -----------------------------------------------------------------------------

export const epaperAtom = atomWithStorage<boolean>("epaper", false)

export const colorSchemeAtom = atomWithStorage<"system" | "light" | "dark">("color_scheme", "system")

export const vimModeAtom = atomWithStorage<boolean>("vim-mode", false)

export const defaultFontAtom = atomWithStorage<Font>("font", "sans")

export const sidebarAtom = atomWithStorage<"expanded" | "collapsed">("sidebar", "expanded")

export const isHelpPanelOpenAtom = atomWithStorage<boolean>("help-panel", false)

export const calendarLayoutAtom = atomWithStorage<"week" | "month">("calendar-layout", "week")

// -----------------------------------------------------------------------------
// AI
// -----------------------------------------------------------------------------

export const OPENAI_KEY_STORAGE_KEY = "openai_key"

export const ENV_OPENAI_KEY = (import.meta.env.VITE_OPENAI_KEY as string) || ""

export const openaiKeyAtom = atomWithStorage<string>(OPENAI_KEY_STORAGE_KEY, "")

export const hasOpenAIKeyAtom = selectAtom(openaiKeyAtom, (key) => key !== "" || ENV_OPENAI_KEY !== "")

export const voiceAssistantEnabledAtom = atomWithStorage<boolean>("voice_assistant_enabled", false)

// Export uuidv4 for use in WorkspaceForm
export { uuidv4 }
