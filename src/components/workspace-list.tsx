import { useAtomValue, useSetAtom } from "jotai"
import React from "react"
import {
  activeWorkspaceAtom,
  globalStateMachineAtom,
  isCloningRepoAtom,
  workspacesAtom,
} from "../global-state"
import { formatRepoSize, useRepoSize } from "../hooks/repo-size"
import { Workspace } from "../schema"
import { Button } from "./button"
import { Dialog } from "./dialog"
import { LoadingIcon16 } from "./icons"
import { WorkspaceForm } from "./repo-form"

export function WorkspaceList() {
  const workspaces = useAtomValue(workspacesAtom)
  const activeWorkspace = useAtomValue(activeWorkspaceAtom)
  const isCloningRepo = useAtomValue(isCloningRepoAtom)
  const [isAddingWorkspace, setIsAddingWorkspace] = React.useState(false)

  return (
    <div className="flex flex-col gap-3">
      {workspaces.map((workspace) => (
        <WorkspaceRow
          key={workspace.id}
          workspace={workspace}
          isActive={workspace.id === activeWorkspace?.id}
          isCloningActive={isCloningRepo && workspace.id === activeWorkspace?.id}
        />
      ))}

      {workspaces.length === 0 && !isAddingWorkspace && (
        <p className="text-sm text-text-secondary">No workspaces connected.</p>
      )}

      {isAddingWorkspace ? (
        <div className="mt-1">
          <WorkspaceForm
            onSubmit={() => setIsAddingWorkspace(false)}
            onCancel={() => setIsAddingWorkspace(false)}
          />
        </div>
      ) : (
        <Button className="self-start" onClick={() => setIsAddingWorkspace(true)}>
          Add workspace
        </Button>
      )}
    </div>
  )
}

function WorkspaceRow({
  workspace,
  isActive,
  isCloningActive,
}: {
  workspace: Workspace
  isActive: boolean
  isCloningActive: boolean
}) {
  const send = useSetAtom(globalStateMachineAtom)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false)
  const { sizeKb, isLoading: sizeLoading } = useRepoSize(
    workspace.githubRepo.owner,
    workspace.githubRepo.name,
  )

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border-secondary px-4 py-3">
      <div className="flex w-0 grow flex-col gap-1">
        <div className="flex items-center gap-2 leading-4">
          <span className="font-medium truncate">{workspace.name}</span>
          {isActive && (
            <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--color-text-success)_15%,transparent)] px-2 py-0.5 text-xs text-text-success">
              Active
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-text-secondary">
          <a
            href={`https://github.com/${workspace.githubRepo.owner}/${workspace.githubRepo.name}`}
            className="link truncate"
            target="_blank"
            rel="noopener noreferrer"
          >
            {workspace.githubRepo.owner}/{workspace.githubRepo.name}
          </a>
          {sizeKb !== null ? (
            <span className="text-text-tertiary">{formatRepoSize(sizeKb)}</span>
          ) : sizeLoading ? (
            <span className="text-text-tertiary">
              <LoadingIcon16 className="inline" />
            </span>
          ) : null}
          {workspace.notesPath && <span className="text-text-tertiary">{workspace.notesPath}</span>}
          {workspace.uploadsPath && (
            <span className="text-text-tertiary">uploads: {workspace.uploadsPath}</span>
          )}
        </div>
        {isCloningActive && (
          <div className="flex items-center gap-1.5 text-sm text-text-secondary mt-0.5">
            <LoadingIcon16 />
            Cloning…
          </div>
        )}
      </div>

      <div className="flex shrink-0 gap-2">
        {!isActive && !isCloningActive && (
          <Button onClick={() => send({ type: "SELECT_WORKSPACE", workspaceId: workspace.id })}>
            Switch
          </Button>
        )}

        <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <Dialog.Trigger asChild>
            <Button>Delete</Button>
          </Dialog.Trigger>
          <Dialog.Content title="Delete workspace">
            <div className="flex flex-col gap-4">
              <p className="text-sm">
                Remove <strong>{workspace.name}</strong> from your workspaces? The GitHub repository
                will not be affected.
              </p>
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button>Cancel</Button>
                </Dialog.Close>
                <Button
                  variant="primary"
                  onClick={() => {
                    send({ type: "REMOVE_WORKSPACE", workspaceId: workspace.id })
                    setConfirmDeleteOpen(false)
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog>
      </div>
    </div>
  )
}
