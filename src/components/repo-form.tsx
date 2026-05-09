import { useAtomValue, useSetAtom } from "jotai"
import React from "react"
import {
  activeWorkspaceAtom,
  githubUserAtom,
  globalStateMachineAtom,
  uuidv4,
} from "../global-state"
import { Workspace } from "../schema"
import { cx } from "../utils/cx"
import { Button } from "./button"
import { ErrorIcon16, LoadingIcon16 } from "./icons"
import { RadioGroup } from "./radio-group"
import { TextInput } from "./text-input"
import { FormControl } from "./form-control"

type GitHubRepo = {
  full_name: string
  private: boolean
}

type WorkspaceFormProps = {
  className?: string
  onSubmit?: (workspace: Workspace) => void
  onCancel?: () => void
}

export function WorkspaceForm({ className, onSubmit, onCancel }: WorkspaceFormProps) {
  const send = useSetAtom(globalStateMachineAtom)
  const githubUser = useAtomValue(githubUserAtom)
  const activeWorkspace = useAtomValue(activeWorkspaceAtom)
  const [repoType, setRepoType] = React.useState<"new" | "existing">("existing")
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<Error | null>(null)
  const [repos, setRepos] = React.useState<GitHubRepo[]>([])
  const [reposLoading, setReposLoading] = React.useState(false)
  const [reposError, setReposError] = React.useState<string | null>(null)

  // Fetch user's repos when in "existing" mode
  React.useEffect(() => {
    if (repoType !== "existing" || !githubUser?.token) return

    let cancelled = false
    setReposLoading(true)
    setReposError(null)

    fetch("https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member", {
      headers: { Authorization: `token ${githubUser.token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setRepos(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (data as any[]).map((r) => ({ full_name: String(r.full_name), private: Boolean(r.private) })),
        )
        }
      })
      .catch(() => {
        if (!cancelled) setReposError("Failed to load repositories.")
      })
      .finally(() => {
        if (!cancelled) setReposLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [repoType, githubUser?.token])

  async function createRepo(workspace: Workspace) {
    if (!githubUser) return

    try {
      setIsLoading(true)

      // Create repo from template
      const response = await fetch(
        `https://api.github.com/repos/lumen-notes/notes-template/generate`,
        {
          method: "POST",
          headers: {
            Authorization: `token ${githubUser.token}`,
          },
          body: JSON.stringify({
            owner: workspace.githubRepo.owner,
            name: workspace.githubRepo.name,
            private: true,
          }),
        },
      )

      if (!response.ok) {
        if (response.status === 422) {
          throw new Error("Repository already exists.")
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { message } = (await response.json()) as any

        throw new Error(message || "Failed to create repository. Please try again.")
      }

      // 1 second delay to allow GitHub API to catch up
      await new Promise((resolve) => setTimeout(resolve, 1000))

      send({ type: "ADD_WORKSPACE", workspace })
      onSubmit?.(workspace)
      setError(null)
    } catch (error) {
      setError(error as Error)
    } finally {
      setIsLoading(false)
    }
  }

  async function selectExistingRepo(workspace: Workspace) {
    if (!githubUser) return

    try {
      setIsLoading(true)

      // Ensure repo exists
      const response = await fetch(
        `https://api.github.com/repos/${workspace.githubRepo.owner}/${workspace.githubRepo.name}`,
        {
          headers: { Authorization: `token ${githubUser.token}` },
        },
      )

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Repository does not exist or you do not have access.")
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { message } = (await response.json()) as any

        throw new Error(message || "Something went wrong.")
      }

      send({ type: "ADD_WORKSPACE", workspace })
      onSubmit?.(workspace)
      setError(null)
    } catch (error) {
      setError(error as Error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form
      id="workspace-form"
      className={cx("flex flex-col gap-5 @container", className)}
      onSubmit={async (event) => {
        event.preventDefault()

        const formData = new FormData(event.currentTarget)
        const repoType = String(formData.get("repo-type"))

        // Owner + name come from the select (existing mode) or text inputs (new mode / fallback)
        let owner: string
        let name: string
        const fullName = formData.get("repo-fullname")
        if (fullName) {
          const [repoOwner, ...repoParts] = String(fullName).split("/")
          owner = repoOwner
          name = repoParts.join("/")
        } else {
          owner = String(formData.get("repo-owner")).trim()
          name = String(formData.get("repo-name")).trim()
        }

        const workspaceName = String(formData.get("workspace-name")).trim()
        const rawNotesPath = String(formData.get("notes-path")).trim()
        const rawUploadsPath = String(formData.get("uploads-path")).trim()
        // Normalize: strip leading/trailing slashes
        const notesPath = rawNotesPath.replace(/^\/+|\/+$/g, "")
        const uploadsPath = rawUploadsPath.replace(/^\/+|\/+$/g, "")

        const workspace: Workspace = {
          id: uuidv4(),
          name: workspaceName || `${owner}/${name}`,
          githubRepo: { owner, name },
          notesPath,
          uploadsPath,
        }

        if (repoType === "new") {
          await createRepo(workspace)
        } else {
          await selectExistingRepo(workspace)
        }
      }}
    >
      <FormControl htmlFor="workspace-name" label="Workspace name">
        <TextInput
          id="workspace-name"
          name="workspace-name"
          placeholder="My Notes"
          spellCheck={false}
          autoCapitalize="off"
          onChange={() => setError(null)}
        />
      </FormControl>
      <RadioGroup
        value={repoType}
        onValueChange={(value) => {
          setRepoType(value as "new" | "existing")
          setError(null)
        }}
        className="flex flex-col gap-3 coarse:gap-4"
        name="repo-type"
      >
        <div className="flex items-center gap-2.5">
          <RadioGroup.Item id="repo-existing" value="existing" />
          <label htmlFor="repo-existing" className="select-none leading-4">
            Select an existing repository
          </label>
        </div>
        <div className="flex items-center gap-2.5">
          <RadioGroup.Item id="repo-new" value="new" />
          <label htmlFor="repo-new" className="select-none leading-4">
            Create a new repository
          </label>
        </div>
      </RadioGroup>
      <div className="flex flex-col gap-4 @lg:gap-3">
        {repoType === "existing" ? (
          <FormControl htmlFor="repo-fullname" label="Repository">
            {reposLoading ? (
              <div className="flex h-8 items-center gap-2 text-sm text-text-secondary coarse:h-10">
                <LoadingIcon16 />
                Loading repositories…
              </div>
            ) : reposError || repos.length === 0 ? (
              // Fallback to text inputs if fetch failed or returned nothing
              <div className="flex flex-col gap-4 @lg:flex-row @lg:gap-2.5">
                <TextInput
                  id="repo-owner"
                  name="repo-owner"
                  placeholder="owner"
                  spellCheck={false}
                  autoCapitalize="off"
                  defaultValue={activeWorkspace?.githubRepo.owner ?? githubUser?.login}
                  required
                  invalid={Boolean(error)}
                  onChange={() => setError(null)}
                />
                <TextInput
                  id="repo-name"
                  name="repo-name"
                  placeholder="repository-name"
                  spellCheck={false}
                  autoCapitalize="off"
                  required
                  invalid={Boolean(error)}
                  onChange={() => setError(null)}
                />
              </div>
            ) : (
              <select
                id="repo-fullname"
                name="repo-fullname"
                required
                defaultValue=""
                onChange={() => setError(null)}
                className={cx(
                  "h-8 w-full rounded border border-border bg-bg-overlay px-2.5 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-border-focus coarse:h-10 coarse:px-3",
                  error && "border-text-danger focus:outline-text-danger",
                )}
              >
                <option value="" disabled>
                  Select a repository…
                </option>
                {repos.map((repo) => (
                  <option key={repo.full_name} value={repo.full_name}>
                    {repo.private ? "🔒 " : ""}{repo.full_name}
                  </option>
                ))}
              </select>
            )}
          </FormControl>
        ) : (
          <div className="flex flex-col gap-4 @lg:flex-row @lg:gap-2.5">
            <FormControl htmlFor="repo-owner" label="Repository owner">
              <TextInput
                id="repo-owner"
                name="repo-owner"
                spellCheck={false}
                autoCapitalize="off"
                defaultValue={activeWorkspace?.githubRepo.owner ?? githubUser?.login}
                required
                invalid={Boolean(error)}
                onChange={() => setError(null)}
              />
            </FormControl>
            <FormControl htmlFor="repo-name" label="Repository name">
              <TextInput
                id="repo-name"
                name="repo-name"
                spellCheck={false}
                autoCapitalize="off"
                required
                invalid={Boolean(error)}
                onChange={() => setError(null)}
              />
            </FormControl>
          </div>
        )}
        <FormControl
          htmlFor="notes-path"
          label="Notes folder"
          description="Optional subfolder within the repository where notes are stored"
        >
          <TextInput
            id="notes-path"
            name="notes-path"
            spellCheck={false}
            autoCapitalize="off"
            placeholder="e.g. src/posts"
            onChange={() => setError(null)}
          />
        </FormControl>
        <FormControl
          htmlFor="uploads-path"
          label="Image uploads folder"
          description={`Optional subfolder for uploaded images and files (defaults to "uploads")`}
        >
          <TextInput
            id="uploads-path"
            name="uploads-path"
            spellCheck={false}
            autoCapitalize="off"
            placeholder="e.g. src/assets/images"
            onChange={() => setError(null)}
          />
        </FormControl>
        {error ? (
          <div className="flex items-start gap-2 text-text-danger [&_a::after]:bg-text-danger! [&_a]:[text-decoration-color:var(--color-text-danger)]!">
            <div className="grid h-5 shrink-0 place-items-center">
              <ErrorIcon16 />
            </div>
            <pre className="whitespace-pre-wrap font-mono text-sm leading-5">{error.message}</pre>
          </div>
        ) : null}
      </div>
      <div className="flex gap-2.5 @lg:ml-auto">
        {onCancel ? (
          <Button className="w-full" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button
          type="submit"
          className="relative w-full grow"
          variant="primary"
          disabled={isLoading}
        >
          <span className={cx({ invisible: isLoading })}>
            {repoType === "new" ? "Create" : "Connect"}
          </span>
          {isLoading ? (
            <span className="absolute inset-0 grid place-items-center">
              <LoadingIcon16 />
            </span>
          ) : null}
        </Button>
      </div>
    </form>
  )
}

/** @deprecated Use WorkspaceForm instead */
export const RepoForm = WorkspaceForm
