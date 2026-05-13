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
  const options: Parameters<typeof git.pull>[0] = {
    fs,
    http,
    dir,
    singleBranch: true,
    // Pass author explicitly so pull works even if .git/config is missing
    // (e.g. after browser storage was cleared). Falls back to login if name is unset.
    author: {
      name: user.name || user.login,
      email: user.email || `${user.login}@users.noreply.github.com`,
    },
    onMessage: (message) => console.debug("onMessage", message),
    onProgress: (progress) => console.debug("onProgress", progress),
    onAuth: () => ({ username: user.login, password: user.token }),
  }

  const stopTimer = startTimer("git pull")
  await git.pull(options)
  stopTimer()
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
