import OpenAI from "openai"

type Mode = "insert" | "rewrite" | "assist"

type RequestBody = {
  prefix: string
  suffix: string
  selection: string
  command: string
  mode: Mode
}

function buildMessages(body: RequestBody): OpenAI.Chat.ChatCompletionMessageParam[] {
  const { prefix, suffix, selection, command, mode } = body

  const documentContext = [
    prefix && `<document_before_cursor>\n${prefix}\n</document_before_cursor>`,
    suffix && `<document_after_cursor>\n${suffix}\n</document_after_cursor>`,
  ]
    .filter(Boolean)
    .join("\n")

  if (mode === "insert") {
    return [
      {
        role: "system",
        content:
          "You are a writing assistant embedded in a markdown note editor. " +
          "Continue writing from the cursor position, maintaining the tone, voice, and context of the existing text. " +
          "Output only the continuation text — no preamble, no explanation, no markdown fencing. " +
          "Keep it concise (1–3 sentences unless instructed otherwise).",
      },
      {
        role: "user",
        content: `${documentContext}${command ? `\n\nInstruction: ${command}` : ""}`,
      },
    ]
  }

  if (mode === "rewrite") {
    return [
      {
        role: "system",
        content:
          "You are a writing assistant embedded in a markdown note editor. " +
          "Rewrite the selected text according to the user's instruction. " +
          "Preserve markdown formatting where appropriate. " +
          "Output only the rewritten text — no preamble, no explanation.",
      },
      {
        role: "user",
        content: `${documentContext}\n\n<selected_text>\n${selection}\n</selected_text>\n\nInstruction: ${command || "Improve this text."}`,
      },
    ]
  }

  // assist
  return [
    {
      role: "system",
      content:
        "You are a knowledgeable writing assistant embedded in a markdown note editor. " +
        "Answer the user's question helpfully and concisely, using the document as context where relevant. " +
        "Format your response in markdown where it aids clarity.",
    },
    {
      role: "user",
      content: `${documentContext}\n\nQuestion: ${command}`,
    },
  ]
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  const body = (await request.json()) as RequestBody
  const { mode } = body

  if (!["insert", "rewrite", "assist"].includes(mode)) {
    return new Response(JSON.stringify({ error: "Invalid mode" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const openai = new OpenAI({ apiKey })

  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: buildMessages(body),
    stream: true,
    temperature: mode === "assist" ? 0.5 : 0.7,
    max_tokens: mode === "insert" ? 150 : 1000,
  })

  // Stream raw text chunks so the client can pipe them directly into onTextChange
  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content
          if (text) {
            controller.enqueue(encoder.encode(text))
          }
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
