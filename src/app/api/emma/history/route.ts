import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getOrCreateConversation,
  saveMessage,
  getLatestConversationSummary,
  getConversationMessages,
  updateConversationSummary,
  updateConversationTitle,
} from "@/core/memory-db";
import { UTILITY_MODELS } from "@/core/models";
import { OPENROUTER_URL, openRouterHeaders, extractText } from "@/lib/openrouter";

const SUMMARIZE_PROMPT = `Summarize this conversation history into a compact paragraph (max 200 words).
Preserve: user preferences, key decisions, personal details, emotional tone.
Discard: filler, repeated commands. Write in third person past tense.
Output only the summary — no preamble.`;

const TITLE_PROMPT = `Give this conversation a title in 5 words or fewer. Output only the title.`;

export async function GET() {
  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ messages: [] });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Try reading from the encrypted messages/conversations path first
  const convo = await getLatestConversationSummary(user.id);
  if (convo) {
    const msgs = await getConversationMessages(convo.id, 50);
    if (msgs.length > 0) {
      return NextResponse.json({
        messages: msgs.map((m, i) => ({
          id: `msg-${convo.id}-${i}`,
          role: m.role,
          content: m.content,
          display: m.display,
          created_at: m.createdAt,
        })),
        conversationId: convo.id,
        summary: convo.summary,
        title: convo.title,
      });
    }
  }

  // Fallback to legacy chat_messages for users without encrypted history yet
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content, display, expression, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) console.error("[/api/emma/history GET]", error.message);
  return NextResponse.json({ messages: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ ok: true });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const msgs: Array<{
    id: string;
    role: string;
    content: string;
    display: string;
    expression?: string;
    timestamp?: number;
  }> = Array.isArray(body) ? body : [body];

  // ── Dual-write: legacy chat_messages (for UI compat during transition) ───
  const legacyRows = msgs.map((m) => ({
    id: m.id,
    user_id: user.id,
    role: m.role,
    content: m.content,
    display: m.display,
    expression: m.expression ?? null,
    created_at: m.timestamp ? new Date(m.timestamp).toISOString() : undefined,
  }));
  const { error: legacyErr } = await supabase
    .from("chat_messages")
    .upsert(legacyRows, { onConflict: "id" });
  if (legacyErr) console.error("[/api/emma/history POST legacy]", legacyErr.message);

  // ── Primary: encrypted messages/conversations path ────────────────────────
  const conversationId = await getOrCreateConversation(user.id);
  if (conversationId) {
    for (const m of msgs) {
      await saveMessage(conversationId, user.id, {
        id: m.id,
        role: m.role,
        content: m.content,
        display: m.display,
        expression: m.expression,
      });
    }

    // Async: generate title at first exchange (count=2) + summarize every 30 messages
    after(async () => {
      try {
        const convo = await getLatestConversationSummary(user.id);
        if (!convo) return;

        if (convo.messageCount === 2 && !convo.title) {
          const recentMsgs = await getConversationMessages(convo.id, 4);
          const excerpt = recentMsgs.map((m) => `${m.role}: ${m.content}`).join("\n");
          const res = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: openRouterHeaders(),
            body: JSON.stringify({
              models: UTILITY_MODELS,
              max_tokens: 20,
              messages: [
                { role: "system", content: TITLE_PROMPT },
                { role: "user", content: excerpt },
              ],
            }),
          });
          if (res.ok) {
            const title = extractText(await res.json())
              .trim()
              .replace(/^["']|["']$/g, "");
            if (title) await updateConversationTitle(convo.id, title);
          }
        }

        // First summary after 6 messages (captures short sessions); refresh every 20 thereafter.
        if (convo.messageCount === 6 || (convo.messageCount > 0 && convo.messageCount % 20 === 0)) {
          const allMsgs = await getConversationMessages(convo.id, 35);
          const text = allMsgs.map((m) => `${m.role}: ${m.content}`).join("\n");
          const prevSummary = convo.summary ? `Previous summary:\n${convo.summary}\n\n` : "";
          const res = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: openRouterHeaders(),
            body: JSON.stringify({
              models: UTILITY_MODELS,
              max_tokens: 600,
              messages: [
                { role: "system", content: SUMMARIZE_PROMPT },
                { role: "user", content: `${prevSummary}New messages:\n${text}` },
              ],
            }),
          });
          if (res.ok) {
            const summary = extractText(await res.json()).trim();
            if (summary) await updateConversationSummary(convo.id, summary);
          }
        }
      } catch (err) {
        console.error("[history] summarize/title error:", err);
      }
    });
  }

  return NextResponse.json({ ok: true });
}
