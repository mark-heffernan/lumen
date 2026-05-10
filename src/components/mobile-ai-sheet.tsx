import { EditorView } from "@codemirror/view"
import copy from "copy-to-clipboard"
import React from "react"
import { streamAiEnhance } from "../utils/ai-enhance"
import { cx } from "../utils/cx"
import { Button } from "./button"
import { LoadingIcon16, SparkleIcon16 } from "./icons"

type AiMode = "continue" | "compose" | "ask"
type SheetState = "picking" | "inputting" | "generating" | "done"

type MobileAiSheetProps = {
  isOpen: boolean
  onClose: () => void
  editorView: EditorView | null
}

export function MobileAiSheet({ isOpen, onClose, editorView }: MobileAiSheetProps) {
  const [mode, setMode] = React.useState<AiMode>("continue")
  const [sheetState, setSheetState] = React.useState<SheetState>("picking")
  const [command, setCommand] = React.useState("")
  const [result, setResult] = React.useState("")
  const [copied, setCopied] = React.useState(false)

  // Capture cursor position when sheet opens so it stays stable
  const capturedCursorPos = React.useRef<number>(0)
  const capturedPrefix = React.useRef<string>("")
  const capturedSuffix = React.useRef<string>("")

  React.useEffect(() => {
    if (isOpen && editorView) {
      const pos = editorView.state.selection.main.head
      const doc = editorView.state.doc.toString()
      capturedCursorPos.current = pos
      capturedPrefix.current = doc.slice(0, pos)
      capturedSuffix.current = doc.slice(pos)
    }
    if (!isOpen) {
      // Reset state when closed
      setMode("continue")
      setSheetState("picking")
      setCommand("")
      setResult("")
      setCopied(false)
    }
  }, [isOpen, editorView])

  function handleModeSelect(selected: AiMode) {
    setMode(selected)
    if (selected === "continue") {
      // No command needed — generate immediately
      generate(selected, "")
    } else {
      setSheetState("inputting")
    }
  }

  function generate(selectedMode: AiMode, cmd: string) {
    setResult("")
    setSheetState("generating")

    const apiMode = selectedMode === "ask" ? "assist" : "insert"

    streamAiEnhance({
      prefix: capturedPrefix.current,
      suffix: capturedSuffix.current,
      selection: "",
      command: cmd,
      mode: apiMode,
      onTextChange: (text) => {
        setResult(text)
      },
    }).then(() => {
      setSheetState("done")
    })
  }

  function handleInsert() {
    if (!editorView || !result) return
    const pos = capturedCursorPos.current
    editorView.dispatch({
      changes: { from: pos, insert: result },
      selection: { anchor: pos + result.length },
    })
    editorView.focus()
    onClose()
  }

  function handleCopy() {
    copy(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-bg-overlay shadow-xl max-h-[75vh]">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <SparkleIcon16 className="text-text-secondary" />
            AI Assistant
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text text-lg leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-6">
          {/* Mode picker — always visible */}
          {sheetState === "picking" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-text-secondary">What would you like to do?</p>
              <div className="flex flex-col gap-2">
                <ModeButton
                  emoji="✨"
                  label="Continue writing"
                  description="AI continues from the cursor"
                  onClick={() => handleModeSelect("continue")}
                />
                <ModeButton
                  emoji="✏️"
                  label="Compose"
                  description="Give an instruction, get content"
                  onClick={() => handleModeSelect("compose")}
                />
                <ModeButton
                  emoji="❓"
                  label="Ask"
                  description="Ask a question about your topic"
                  onClick={() => handleModeSelect("ask")}
                />
              </div>
            </div>
          )}

          {/* Command input */}
          {sheetState === "inputting" && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-text-secondary">
                {mode === "compose"
                  ? "Describe what to write…"
                  : "Ask a question…"}
              </p>
              <textarea
                autoFocus
                className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm resize-none focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-border-focus"
                rows={3}
                placeholder={
                  mode === "compose"
                    ? "e.g. Write a paragraph about the coastal scenery"
                    : "e.g. What is Rogoznica known for?"
                }
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && command.trim()) {
                    e.preventDefault()
                    generate(mode, command.trim())
                  }
                }}
              />
              <Button
                variant="primary"
                disabled={!command.trim()}
                onClick={() => generate(mode, command.trim())}
                className="self-end"
              >
                Generate
              </Button>
            </div>
          )}

          {/* Generating / result */}
          {(sheetState === "generating" || sheetState === "done") && (
            <div className="flex flex-col gap-3">
              {sheetState === "generating" && !result && (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <LoadingIcon16 />
                  Generating…
                </div>
              )}

              {result && (
                <div
                  className={cx(
                    "rounded-lg border border-border bg-bg px-3 py-2.5 text-sm whitespace-pre-wrap",
                    sheetState === "generating" && "text-text-secondary",
                  )}
                >
                  {result}
                </div>
              )}

              {sheetState === "done" && result && (
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    className="grow"
                    onClick={handleInsert}
                  >
                    Insert at cursor
                  </Button>
                  <Button onClick={handleCopy} className="shrink-0">
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function ModeButton({
  emoji,
  label,
  description,
  onClick,
}: {
  emoji: string
  label: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-border bg-bg px-4 py-3 text-left hover:bg-bg-secondary active:bg-bg-secondary-active transition-colors"
    >
      <span className="text-xl shrink-0">{emoji}</span>
      <div className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-text-secondary">{description}</span>
      </div>
    </button>
  )
}
