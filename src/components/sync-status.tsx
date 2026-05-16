import { useAtomValue } from "jotai"
import { selectAtom } from "jotai/utils"
import { useNetworkState } from "react-use"
import { globalStateMachineAtom, isRepoClonedAtom } from "../global-state"
import { cx } from "../utils/cx"
import { CheckFillIcon16, ErrorFillIcon16, LoadingFillIcon16 } from "./icons"

const isSyncingAtom = selectAtom(
  globalStateMachineAtom,
  (state) =>
    state.matches("signedIn.cloned.sync.pulling") ||
    state.matches("signedIn.cloned.sync.pushing") ||
    state.matches("signedIn.cloned.sync.checkingStatus"),
)

const isSyncErrorAtom = selectAtom(globalStateMachineAtom, (state) =>
  state.matches("signedIn.cloned.sync.error"),
)

const syncErrorAtom = selectAtom(
  globalStateMachineAtom,
  (state) => state.context.syncError,
)

export type SyncErrorInfo = {
  /** Short label shown in the sidebar */
  label: string
  /** Longer description of what went wrong */
  detail: string
  /** What the user should do to resolve it */
  action: "reauthenticate" | "retry"
}

/** Classify a raw sync error into a user-friendly description. */
function classifySyncError(err: Error): SyncErrorInfo {
  const msg = err.message ?? ""
  // HTTP 401 = GitHub token expired or revoked
  if (msg.includes("401") || err.name === "HttpError") {
    return {
      label: "Auth error",
      detail: "GitHub authentication failed — your token may have expired.",
      action: "reauthenticate",
    }
  }
  // Merge conflicts are now handled automatically, but surface them just in case
  if (err.name === "MergeNotSupportedError") {
    return {
      label: "Sync error",
      detail: "Could not merge remote changes automatically. Try syncing again.",
      action: "retry",
    }
  }
  return {
    label: "Sync error",
    detail: msg || "An unexpected error occurred during sync.",
    action: "retry",
  }
}

/** Returns classified error info when in the sync error state, otherwise null. */
export function useSyncError(): SyncErrorInfo | null {
  const isSyncError = useAtomValue(isSyncErrorAtom)
  const syncError = useAtomValue(syncErrorAtom)
  if (!isSyncError || !syncError) return null
  return classifySyncError(syncError)
}

export function useSyncStatusText() {
  const isSyncing = useAtomValue(isSyncingAtom)
  const syncErrorInfo = useSyncError()
  const isRepoCloned = useAtomValue(isRepoClonedAtom)
  const { online } = useNetworkState()

  if (!isRepoCloned || !online) return null
  if (isSyncing) return "Syncing…"
  if (syncErrorInfo) return <span className="text-text-danger">{syncErrorInfo.label}</span>
  return "Synced"
}

export function SyncStatusIcon({ className }: { className?: string }) {
  const isSyncing = useAtomValue(isSyncingAtom)
  const syncErrorInfo = useSyncError()
  const isRepoCloned = useAtomValue(isRepoClonedAtom)
  const { online } = useNetworkState()

  if (!isRepoCloned || !online) return null
  if (isSyncing) return <LoadingFillIcon16 className={cx("text-text-pending", className)} />
  if (syncErrorInfo) return <ErrorFillIcon16 className={cx("text-text-danger", className)} />
  return <CheckFillIcon16 className={cx("text-text-success", className)} />
}
