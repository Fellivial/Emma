import type { EmmaCommand, AvatarExpression } from "@/types/emma";

export interface StreamEnforcement {
  status: string;
  message: string | null;
  warningWindow: string | null;
  upgradeUrl: string | null;
}

export interface StreamDoneEvent {
  text: string;
  raw: string;
  commands: EmmaCommand[];
  routineId: string | null;
  expression: AvatarExpression | null;
  enforcement: StreamEnforcement | null;
}

interface StreamCallbacks {
  onDelta: (text: string) => void;
  onDone: (event: StreamDoneEvent) => void;
  onError: (error: string) => void;
}

/**
 * Consume SSE stream from /api/emma.
 *
 * Events:
 *   {"type":"delta","text":"..."} — streamed text chunk
 *   {"type":"done","text":"...","commands":[...],...} — final parsed response
 *   {"type":"error","text":"..."} — error message
 */
export async function streamEmmaResponse(
  body: Record<string, unknown>,
  callbacks: StreamCallbacks
): Promise<void> {
  const res = await fetch("/api/emma", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Non-streaming error response (JSON)
  if (!res.ok || !res.headers.get("content-type")?.includes("text/event-stream")) {
    try {
      const data = await res.json();
      callbacks.onError(data.error || "Something went wrong");
    } catch {
      callbacks.onError("Connection failed");
    }
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data) continue;

        try {
          const event = JSON.parse(data);

          switch (event.type) {
            case "delta":
              callbacks.onDelta(event.text);
              break;

            case "done":
              callbacks.onDone({
                text: event.text,
                raw: event.raw,
                commands: event.commands || [],
                routineId: event.routineId || null,
                expression: event.expression || null,
                enforcement: event.enforcement || null,
              });
              break;

            case "error":
              callbacks.onError(event.text || "Unknown error");
              break;
          }
        } catch {
          // Skip malformed events
        }
      }
    }
  } catch (err) {
    callbacks.onError("Stream interrupted");
  } finally {
    reader.releaseLock();
  }
}
