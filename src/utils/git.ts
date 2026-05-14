import git from "isomorphic-git"
import http from "isomorphic-git/http/web"
import { GitHubRepository, GitHubUser } from "../schema"
import { fs } from "./fs"
import { startTimer } from "./timer"

const DEFAULT_BRANCH = "main"

export async function gitClone(repo: GitHubRepository, user: GitHubUser, dir: string) {
  const options: Parameters<typeof git.clone>[0] = {
    fs,
    http,
    dir,
    // corsProxy: "https://cors.isomorphic-git.org",
    corsProxy: "/cors-proxy",
    url: `https://github.com/${repo.owner}/${repo.name}`,
    ref: DEFAULT_BRANCH,
    singleBranch: true,
    depth: 1,
    onMessage: (message) => console.debug("onMessage", message),
    onProgress: (progress) => console.debug("onProgress", progress),
    onAuth: () => ({ username: user.login, password: user.token }),
  }

  // Clone repo
  let stopTimer = startTimer(`git clone ${options.url} ${options.dir}`)
  await git.clone(options)
  stopTimer()

  // Set user in git config
  stopTimer = startTimer(`git config user.name "${user.name}"`)
  await git.setConfig({ fs, dir, path: "user.name", value: user.name })
  stopTimer()

  // Set email in git config
  stopTimer = startTimer(`git config user.email "${user.email}"`)
  await git.setConfig({ fs, dir, path: "user.email", value: user.email })
  stopTimer()
}

export async function gitPull(user: GitHubUser, dir: string) {
  const author = {
    name: user.name || user.login,
    email: user.email || `${user.login}@users.noreply.github.com`,
  }
  const onAuth = () => ({ username: user.login, password: user.token })

  const stopTimer = startTimer("git pull")
  try {
    await git.pull({
      fs,
      http,
      dir,
      singleBranch: true,
      // Pass author explicitly so pull works even if .git/config is missing
      // (e.g. after browser storage was cleared). Falls back to login if name is unset.
      author,
      onMessage: (message) => console.debug("onMessage", message),
      onProgress: (progress) => console.debug("onProgress", progress),
      onAuth,
    })
    stopTimer()
  } catch (err) {
    stopTimer()

    // isomorphic-git can't handle diverged histories (MergeNotSupportedError).
    // Fall back to: fetch → save local-only files → reset to remote → reapply → commit.
    // This preserves notes created on this device while accepting all remote changes.
    if (!(err instanceof Error && err.name === "MergeNotSupportedError")) {
      throw err
    }

    console.warn("[git pull] MergeNotSupportedError — falling back to fetch+reset+reapply")

    // 1. Fetch to update refs/remotes/origin/main
    let t = startTimer("git fetch (merge fallback)")
    await git.fetch({
      fs,
      http,
      dir,
      remote: "origin",
      ref: DEFAULT_BRANCH,
      singleBranch: true,
      onAuth,
      onMessage: (message) => console.debug("onMessage", message),
      onProgress: (progress) => console.debug("onProgress", progress),
    })
    t()

    // 2. Find files that exist in our local HEAD but not in remote HEAD (our local additions)
    const localFiles = await git.listFiles({ fs, dir, ref: `refs/heads/${DEFAULT_BRANCH}` })
    const remoteFiles = await git.listFiles({ fs, dir, ref: `refs/remotes/origin/${DEFAULT_BRANCH}` })
    const remoteFileSet = new Set(remoteFiles)
    const localOnlyPaths = localFiles.filter((p) => !remoteFileSet.has(p))

    // 3. Save the content of those local-only files from disk
    const localOnlyContent: Record<string, string> = {}
    for (const filepath of localOnlyPaths) {
      try {
        const content = await fs.promises.readFile(`${dir}/${filepath}`, "utf8")
        localOnlyContent[filepath] = content as string
      } catch {
        // File was deleted locally — don't reapply it
      }
    }

    // 4. Hard-reset local branch to remote HEAD (rewrites working tree)
    const remoteHead = await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${DEFAULT_BRANCH}` })
    await git.writeRef({ fs, dir, ref: `refs/heads/${DEFAULT_BRANCH}`, value: remoteHead, force: true })
    await git.checkout({ fs, dir, ref: DEFAULT_BRANCH, force: true })

    // 5. Reapply our local-only files on top of the remote state
    if (Object.keys(localOnlyContent).length > 0) {
      for (const [filepath, content] of Object.entries(localOnlyContent)) {
        // Ensure parent directories exist
        const segments = filepath.split("/").slice(0, -1)
        let current = dir
        for (const segment of segments) {
          current = `${current}/${segment}`
          await fs.promises.mkdir(current).catch(() => {})
        }
        await fs.promises.writeFile(`${dir}/${filepath}`, content, "utf8")
        await git.add({ fs, dir, filepath })
      }

      t = startTimer(`git commit (merge fallback: ${localOnlyPaths.length} local files)`)
      await git.commit({ fs, dir, message: "Sync local changes", author })
      t()
    }
  }
}

export async function gitPush(user: GitHubUser, dir: string) {
  const options: Parameters<typeof git.push>[0] = {
    fs,
    http,
    dir,
    onMessage: (message) => console.debug("onMessage", message),
    onProgress: (progress) => console.debug("onProgress", progress),
    onAuth: () => ({ username: user.login, password: user.token }),
  }

  const stopTimer = startTimer("git push")
  await git.push(options)
  stopTimer()
}

export async function gitAdd(filePaths: string[], dir: string) {
  const options: Parameters<typeof git.add>[0] = {
    fs,
    dir,
    filepath: filePaths,
  }

  const stopTimer = startTimer(`git add ${filePaths.join(" ")}`)
  await git.add(options)
  stopTimer()
}

export async function gitRemove(filePath: string, dir: string) {
  const options: Parameters<typeof git.remove>[0] = {
    fs,
    dir,
    filepath: filePath,
  }

  const stopTimer = startTimer(`git remove ${filePath}`)
  await git.remove(options)
  stopTimer()
}

export async function gitCommit(message: string, dir: string) {
  const options: Parameters<typeof git.commit>[0] = {
    fs,
    dir,
    message,
  }

  const stopTimer = startTimer(`git commit -m "${message}"`)
  await git.commit(options)
  stopTimer()
}

/** Check if the repo is synced with the remote origin */
export async function isRepoSynced(dir: string) {
  const latestLocalCommit = await git.resolveRef({
    fs,
    dir,
    ref: `refs/heads/${DEFAULT_BRANCH}`,
  })

  const latestRemoteCommit = await git.resolveRef({
    fs,
    dir,
    ref: `refs/remotes/origin/${DEFAULT_BRANCH}`,
  })

  const isSynced = latestLocalCommit === latestRemoteCommit

  return isSynced
}

export async function getRemoteOriginUrl(dir: string) {
  // Check git config for remote origin url
  const remoteOriginUrl = await git.getConfig({
    fs,
    dir,
    path: "remote.origin.url",
  })

  return remoteOriginUrl
}
