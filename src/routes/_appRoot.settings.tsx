import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useAtom, useAtomValue } from "jotai"
import React from "react"
import { useNetworkState } from "react-use"
import { Button } from "../components/button"
import { FeedForm } from "../components/feed-form"
import { useSignOut } from "../components/github-auth"
import { GitHubAvatar } from "../components/github-avatar"
import { IconButton } from "../components/icon-button"
import { PlusIcon16, RssFeedIcon16, SettingsIcon16, TrashIcon16 } from "../components/icons"
import { OpenAIKeyInput } from "../components/openai-key-input"
import { PageLayout } from "../components/page-layout"
import { Signature } from "../components/signature"
import { Switch } from "../components/switch"
import { WorkspaceList } from "../components/workspace-list"
import {
  epaperAtom,
  feedsAtom,
  githubUserAtom,
  hasOpenAIKeyAtom,
  vimModeAtom,
  voiceAssistantEnabledAtom,
} from "../global-state"
import { clearFeedCache } from "../hooks/feeds"
import { cx } from "../utils/cx"

export const Route = createFileRoute("/_appRoot/settings")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Settings · Lumen" }],
  }),
})

function RouteComponent() {
  return (
    <PageLayout title="Settings" icon={<SettingsIcon16 />} disableGuard>
      <div className="p-4 pb-6">
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          <GitHubSection />
          <AppearanceSection />
          <EditorSection />
          <AISection />
          <FeedsSection />
          <div className="p-5 text-text-tertiary self-center flex flex-col gap-3 items-center">
            <span className="text-sm">
              Made by{" "}
              <a
                className="link decoration-text-tertiary"
                href="https://colebemis.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Cole Bemis
              </a>{" "}
              &{" "}
              <a
                className="link decoration-text-tertiary"
                href="https://github.com/lumen-notes/lumen/graphs/contributors"
                target="_blank"
                rel="noopener noreferrer"
              >
                friends
              </a>
            </span>
            <a href="https://colebemis.com" target="_blank" rel="noopener noreferrer">
              <Signature width={100} />
            </a>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-bold leading-4">{title}</h3>
      <div className="card-1 p-4">{children}</div>
    </div>
  )
}

function GitHubSection() {
  const navigate = useNavigate()
  const githubUser = useAtomValue(githubUserAtom)
  const signOut = useSignOut()
  const { online } = useNetworkState()

  if (!githubUser) {
    return (
      <SettingsSection title="GitHub">
        <div className="text-text-secondary">You're not signed in</div>
      </SettingsSection>
    )
  }

  return (
    <>
      <SettingsSection title="GitHub">
        <div className="flex items-center justify-between gap-4">
          <div className="flex w-0 grow flex-col gap-1">
            <span className="text-sm leading-4 text-text-secondary">Account</span>
            <span className="flex items-center gap-2 leading-4">
              {online ? <GitHubAvatar login={githubUser.login} size={16} /> : null}
              <span className="truncate">{githubUser.login}</span>
            </span>
          </div>
          <Button
            className="shrink-0"
            onClick={() => {
              signOut()
              navigate({ to: "/", search: { query: undefined, view: "grid" } })
            }}
          >
            Sign out
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Workspaces">
        <WorkspaceList />
      </SettingsSection>
    </>
  )
}

function AppearanceSection() {
  const [epaper, setEpaper] = useAtom(epaperAtom)

  return (
    <SettingsSection title="Appearance">
      <div className="flex items-center gap-2.5 leading-4">
        <Switch id="epaper" checked={epaper} onCheckedChange={setEpaper} />
        <label htmlFor="epaper" className="select-none">
          E-paper
        </label>
      </div>
    </SettingsSection>
  )
}

function EditorSection() {
  const [vimMode, setVimMode] = useAtom(vimModeAtom)

  return (
    <SettingsSection title="Editor">
      <div className="flex items-center gap-2.5 leading-4">
        <Switch id="vim-mode" checked={vimMode} onCheckedChange={setVimMode} />
        <label htmlFor="vim-mode" className="select-none">
          Vim mode
        </label>
      </div>
    </SettingsSection>
  )
}

function AISection() {
  const hasOpenAIKey = useAtomValue(hasOpenAIKeyAtom)
  const [voiceAssistantEnabled, setVoiceAssistantEnabled] = useAtom(voiceAssistantEnabledAtom)

  return (
    <SettingsSection title="AI">
      <div className="flex flex-col gap-4">
        <OpenAIKeyInput />
        <div role="separator" className="h-px bg-border-secondary" />
        <div className="flex flex-col gap-3 leading-4 coarse:gap-4">
          <div className="flex items-start gap-2.5">
            <Switch
              id="voice-assistant"
              disabled={!hasOpenAIKey}
              checked={hasOpenAIKey && voiceAssistantEnabled}
              onCheckedChange={(checked) => setVoiceAssistantEnabled(checked)}
            />
            <div className="flex flex-col gap-2 leading-4 coarse:leading-5">
              <label
                htmlFor="voice-assistant"
                className={cx(
                  "select-none",
                  !hasOpenAIKey && "cursor-not-allowed text-text-secondary",
                )}
              >
                Voice assistant <span className="italic text-text-secondary">(beta)</span>
              </label>
              <Link
                to="/notes/$"
                params={{ _splat: ".lumen/voice-instructions" }}
                search={{ mode: "write", query: undefined, view: "grid" }}
                className="link text-text-secondary"
              >
                Custom instructions
              </Link>
            </div>
          </div>
        </div>
      </div>
    </SettingsSection>
  )
}

function FeedsSection() {
  const [feeds, setFeeds] = useAtom(feedsAtom)
  const [isAdding, setIsAdding] = React.useState(false)
  const navigate = useNavigate()

  function removeFeed(id: string) {
    const feed = feeds.find((f) => f.id === id)
    if (feed) clearFeedCache(feed.url)
    setFeeds((prev) => prev.filter((f) => f.id !== id))
  }

  return (
    <SettingsSection title="Feeds">
      <div className="flex flex-col gap-4">
        {feeds.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {feeds.map((feed) => (
              <li key={feed.id} className="flex items-center gap-2 group">
                <RssFeedIcon16 className="shrink-0 text-text-secondary" />
                <button
                  className="flex-1 min-w-0 text-left truncate hover:underline"
                  onClick={() => navigate({ to: "/feeds/$", params: { _splat: feed.id } })}
                >
                  {feed.title}
                </button>
                <IconButton
                  aria-label={`Remove ${feed.title}`}
                  size="small"
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeFeed(feed.id)}
                  tooltipSide="left"
                >
                  <TrashIcon16 />
                </IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">No feeds subscribed yet.</p>
        )}

        {isAdding ? (
          <FeedForm onSuccess={() => setIsAdding(false)} onCancel={() => setIsAdding(false)} />
        ) : (
          <Button onClick={() => setIsAdding(true)} className="self-start">
            <PlusIcon16 />
            Add feed
          </Button>
        )}
      </div>
    </SettingsSection>
  )
}
