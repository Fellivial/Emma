# AI Agent Tools Research: Complete Catalog

> **Status: RESEARCH ONLY — do not implement until instructed.**
> Sources: Anthropic docs, OpenAI Agents SDK, MCP official servers, community MCP catalog — live-browsed 2026-05-31.

---

## Overview

AI agent tools fall into three execution models:

| Execution       | Who runs it                   | Examples                                          |
| --------------- | ----------------------------- | ------------------------------------------------- |
| **Server-side** | Provider's infrastructure     | Anthropic web_search, code_execution, advisor     |
| **Client-side** | Your application              | Anthropic bash, memory, text_editor, computer_use |
| **MCP server**  | Separate process (stdio/HTTP) | filesystem, git, fetch, memory (knowledge graph)  |

---

## Anthropic Official Tools

Anthropic provides 8 tools. The `type` field is the version string.

### Server-Executed Tools (Anthropic runs them, no client code needed)

#### 1. Web Search — `web_search_20250305` / `web_search_20260209`

Real-time web search with automatic citations.

```python
tools=[{
  "type": "web_search_20260209",   # v2: dynamic filtering; v1: basic
  "name": "web_search",
  "max_uses": 5,                   # limit searches per request
  "allowed_domains": ["example.com"],
  "blocked_domains": ["spam.com"],
  "user_location": {
    "type": "approximate",
    "city": "San Francisco", "region": "California",
    "country": "US", "timezone": "America/Los_Angeles"
  }
}]
```

**Response**: `server_tool_use` → `web_search_tool_result` → text with `citations` (url, title, cited_text).

**v2 dynamic filtering**: Claude writes Python to filter search results before they enter context. Requires `code_execution` also enabled. Reduces tokens, improves relevance. Not ZDR-eligible by default.

**Stop reason**: May return `pause_turn` for multi-search turns. Continue by passing `response.content` back as an assistant message.

---

#### 2. Web Fetch — `web_fetch_20250910` / `web_fetch_20260209`

Retrieves full page content from specific URLs. Handles HTML and PDFs.

```python
tools=[{
  "type": "web_fetch_20250910",
  "name": "web_fetch",
  "max_uses": 10,
  "allowed_domains": ["docs.example.com"],
  "citations": {"enabled": True},
  "max_content_tokens": 100000  # truncate large docs
}]
```

**Key behavior**: Claude can only fetch URLs explicitly provided in the conversation or from prior search/fetch results. It CANNOT construct URLs dynamically (security boundary).

**v2 dynamic filtering**: Claude filters fetched content before loading into context.

**Supports PDFs**: Automatic text extraction. Does NOT support JavaScript-rendered pages.

---

#### 3. Code Execution — `code_execution_20250825`

Runs Python in a sandboxed server-side container.

```python
tools=[{"type": "code_execution_20250825", "name": "code_execution"}]
```

Required when using `web_search_20260209` or `web_fetch_20260209` for dynamic filtering.

---

#### 4. Advisor — `advisor_20260301` (beta)

Pairs a fast executor model with a high-intelligence advisor mid-generation.

```python
response = client.beta.messages.create(
  model="claude-sonnet-4-6",        # executor: fast, cheap
  betas=["advisor-tool-2026-03-01"],
  tools=[{
    "type": "advisor_20260301",
    "name": "advisor",
    "model": "claude-opus-4-8",     # advisor: high intelligence
    "max_uses": 3,                  # per-request cap
  }],
  messages=[...]
)
```

**How it works**: Executor decides when to call advisor. Anthropic runs a separate inference pass — the advisor sees the full conversation transcript and returns planning advice. No extra round trips on the client side. All inside a single `/v1/messages` request.

**Valid pairings**:

- Haiku 4.5 → Opus 4.8 or 4.7
- Sonnet 4.6 → Opus 4.8 or 4.7
- Opus 4.6 / 4.7 → Opus 4.8 or 4.7

**Result**: `advisor_tool_result` block with `advisor_result.text` (readable) or `advisor_redacted_result.encrypted_content` (opaque, pass verbatim on next turn).

**Best for**: Long-horizon agentic tasks (coding agents, computer use, research pipelines) where most turns are mechanical but the initial plan matters.

---

### Client-Executed Tools (your application runs them)

#### 5. Memory — `memory_20250818`

Persistent file-based memory across conversations. Files in `/memories` directory. You control the storage backend.

```python
tools=[{"type": "memory_20250818", "name": "memory"}]
```

**Commands Claude uses** (your app implements):

| Command       | What it does                                         |
| ------------- | ---------------------------------------------------- |
| `view`        | Read file contents or list directory (2 levels deep) |
| `create`      | Create a new file                                    |
| `str_replace` | Replace exact text in a file (must be unique match)  |
| `insert`      | Insert text after specific line number               |

**SDK helpers**: Subclass `BetaAbstractMemoryTool` (Python) or use `betaMemoryTool` (TypeScript) to implement file system, database, cloud storage, or encrypted backend.

**Behavior**: Claude automatically checks `/memories` at task start. Writes learned facts, preferences, and project state as it works.

**ZDR-eligible**: Yes.

---

#### 6. Bash — `bash_20250124`

Persistent bash session in your environment. Shell state persists between tool calls.

```python
tools=[{"type": "bash_20250124", "name": "bash"}]
```

**Parameters**: `command` (required), `restart` (boolean — resets session state).

**Safety**: Use an allowlist (not a blocklist). Reject shell operators (`&&`, `||`, `|`, `;`, `>`, `<`) to prevent command chaining bypassing the allowlist.

**Use cases**: Run tests, build commands, install packages, process files, execute scripts.

---

#### 7. Text Editor — `text_editor_20250728`

View and modify text files. Named `str_replace_based_edit_tool`.

```python
tools=[{
  "type": "text_editor_20250728",
  "name": "str_replace_based_edit_tool",
  "max_characters": 10000  # truncate large file views
}]
```

**Commands**:

| Command       | Parameters                           | What it does                                |
| ------------- | ------------------------------------ | ------------------------------------------- |
| `view`        | `path`, `view_range?`                | Read file or list directory                 |
| `str_replace` | `path`, `old_str`, `new_str`         | Replace exact text (must be unique in file) |
| `create`      | `path`, `file_text`                  | Create new file                             |
| `insert`      | `path`, `insert_line`, `insert_text` | Insert text after line N                    |

**ZDR-eligible**: Yes.

---

#### 8. Computer Use — `computer_20250124` / `computer_20251124`

Desktop automation. Claude sees screenshots and controls mouse/keyboard.

```python
tools=[{
  "type": "computer_20251124",
  "name": "computer",
  "display_width_px": 1024,
  "display_height_px": 768,
  "display_number": 1
}]
# Beta header: "computer-use-2025-11-24"
```

**Actions** (v20250124+):

- `screenshot`, `left_click`, `right_click`, `middle_click`, `double_click`, `triple_click`
- `type`, `key` (e.g. `"ctrl+s"`), `hold_key`
- `mouse_move`, `left_click_drag`, `scroll`
- `left_mouse_down`, `left_mouse_up`, `wait`

**Agent loop**: Claude requests action → your app executes in VM → returns screenshot → repeat.

**Security**: Always run in isolated VM or Docker container with minimal privileges. Prompt injection classifiers are active.

---

## Tool Combinations — Anthropic Official Patterns

### Research Agent: `web_search + code_execution`

```python
tools=[
  {"type": "web_search_20260209", "name": "web_search"},
  {"type": "code_execution_20250825", "name": "code_execution"}
]
```

**Flow**: Search → get data → Python analysis → optionally search again for gaps.

**Best for**: Questions requiring up-to-date info AND computation. "Compare Q1 earnings across top 5 cloud providers."

---

### Coding Agent: `text_editor + bash`

```python
tools=[
  {"type": "text_editor_20250728", "name": "str_replace_based_edit_tool"},
  {"type": "bash_20250124", "name": "bash"}
]
```

**Flow**: Inspect code → make edit → run tests → repeat. Your application controls which files and commands are accessible.

---

### Cite-then-Fetch: `web_search + web_fetch`

```python
tools=[
  {"type": "web_search_20260209", "name": "web_search"},
  {"type": "web_fetch_20260209", "name": "web_fetch"}
]
```

**Flow**: Search → inspect snippets → pick 2–3 relevant URLs → fetch full content → cite passages.

**Why not fetch-first**: Search narrows it down; avoids fetching irrelevant pages.

**Best for**: Answers in long-form content (documentation, articles, specs).

---

### Long-Running Agent: `memory + any toolset`

```python
tools=[
  {"type": "memory_20250818", "name": "memory"},
  # ... any other tools
]
```

**Flow**: Check memories → do work → write new facts → next session picks up.

**Best for**: Support agents, project assistants, any multi-session workflow.

---

### All-In-One: `computer_use` alone

```python
tools=[{
  "type": "computer_20250124", "name": "computer",
  "display_width_px": 1280, "display_height_px": 800
}]
```

**Best for**: When narrower tools don't cover the task — legacy GUI software, visual verification, cross-app workflows.

**Tradeoff**: Slowest — every action requires a screenshot round trip. Use narrower tools first.

---

## OpenAI Agents SDK Tools

### Hosted Tools (run on OpenAI servers)

```python
from agents import Agent, WebSearchTool, FileSearchTool, CodeInterpreterTool
from agents import HostedMCPTool, ImageGenerationTool, ToolSearchTool

agent = Agent(
  tools=[
    WebSearchTool(
      filters={"topic": "news"},
      user_location={"country": "US"},
      search_context_size="medium"
    ),
    FileSearchTool(vector_store_ids=["vs_xxx"], max_num_results=3),
    CodeInterpreterTool(),
    HostedMCPTool(server_url="https://my-mcp.example.com"),
    ImageGenerationTool(),
    ToolSearchTool(),  # for deferred tool loading
  ]
)
```

| Tool                  | What it does                            |
| --------------------- | --------------------------------------- |
| `WebSearchTool`       | Real-time web search                    |
| `FileSearchTool`      | Semantic search in OpenAI Vector Stores |
| `CodeInterpreterTool` | Python in sandboxed OpenAI container    |
| `HostedMCPTool`       | Expose remote MCP server's tools        |
| `ImageGenerationTool` | Generate images from prompt             |
| `ToolSearchTool`      | Load deferred tools on demand           |

### Deferred Tool Loading (Tool Search)

```python
@function_tool(defer_loading=True)  # hidden until model searches for it
def get_customer_profile(customer_id: str) -> str:
  """Fetch a CRM customer profile."""
  ...

crm = tool_namespace(
  name="crm",
  description="CRM tools for customer lookups.",
  tools=[get_customer_profile, list_open_orders],
)

agent = Agent(
  tools=[*crm, ToolSearchTool()],
  # model loads 'crm' namespace only when needed
)
```

**Rule of thumb**: Keep each namespace under ~10 functions. Prefer namespaces over many individually deferred functions.

### Local Runtime Tools

```python
from agents import ComputerTool, ShellTool, ApplyPatchTool
from agents.computer import AsyncComputer

class MyComputer(AsyncComputer):
  environment = "browser"
  dimensions = (1024, 768)
  async def screenshot(self): ...
  async def click(self, x, y, button): ...
  async def type(self, text): ...

agent = Agent(
  tools=[
    ComputerTool(computer=MyComputer()),
    ShellTool(executor=run_shell),
    ApplyPatchTool(editor=MyEditor()),
  ]
)
```

---

## MCP Reference Servers (Official)

Install all via `npx -y @modelcontextprotocol/server-<name>`.

### Fetch

```
fetch(url, max_length=5000, start_index=0, raw=false)
```

HTML → markdown. Supports chunked reading via `start_index` for large pages.

---

### Filesystem

| Tool                        | Key params                                            |
| --------------------------- | ----------------------------------------------------- |
| `read_text_file`            | `path`, `head?`, `tail?`                              |
| `read_media_file`           | `path` → base64                                       |
| `read_multiple_files`       | `paths[]`                                             |
| `write_file`                | `path`, `content`                                     |
| `edit_file`                 | `path`, `edits[]` with `oldText`/`newText`, `dryRun?` |
| `create_directory`          | `path`                                                |
| `list_directory`            | `path`                                                |
| `list_directory_with_sizes` | `path`, `sortBy?`                                     |
| `move_file`                 | `source`, `destination`                               |
| `search_files`              | `path`, `pattern`, `excludePatterns?`                 |
| `directory_tree`            | `path`, `excludePatterns?`                            |
| `get_file_info`             | `path` → size, dates, type                            |
| `list_allowed_directories`  | → what's in scope                                     |

---

### Git

`git_status`, `git_diff_unstaged`, `git_diff_staged`, `git_diff` (target comparison), `git_commit`, `git_add`, `git_reset`, `git_log` (with ISO 8601 date filters), `git_create_branch`, `git_checkout`, `git_show`, `git_branch` (local/remote/all)

---

### Memory (Knowledge Graph)

| Tool                  | What it does                                              |
| --------------------- | --------------------------------------------------------- |
| `create_entities`     | Add nodes with type + observations                        |
| `create_relations`    | Add directed edges (from/to/relationType in active voice) |
| `add_observations`    | Append facts to existing entity                           |
| `delete_entities`     | Remove nodes + cascade-delete their relations             |
| `delete_observations` | Remove specific facts                                     |
| `delete_relations`    | Remove specific edges                                     |
| `read_graph`          | Return entire graph                                       |
| `search_nodes`        | Search entity names, types, observations                  |
| `open_nodes`          | Retrieve specific nodes by name                           |

**Example entity**:

```json
{
  "name": "John_Smith",
  "entityType": "person",
  "observations": ["Prefers morning meetings", "Speaks Spanish"]
}
```

---

### Sequential Thinking

```
sequential_thinking(
  thought,          # current reasoning step text
  thoughtNumber,    # index (1, 2, 3...)
  totalThoughts,    # estimated total (adjustable)
  nextThoughtNeeded, # true = continue; false = done
  isRevision?,      # this step revises a prior step
  revisesThought?,  # which step number is being revised
  branchFromThought?, # fork from this step
  branchId?         # branch label for tracking
)
```

**Use cases**: Complex planning, architecture decisions, problems where full scope isn't clear initially.

---

### Time

Time queries and timezone conversions.

---

## Community MCP — Key Tools by Category

### Web Search

| Tool                        | What it adds                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| **Tavily MCP**              | `tavily_search`, `tavily_extract`, `tavily_map`, `tavily_crawl` — AI-first, structured results |
| **Exa Search**              | Semantic search API, real-time retrieval                                                       |
| **Brave Search** (official) | Brave Search API — web + local search                                                          |
| **Playwright**              | Full browser automation + scraping (JS-rendered pages)                                         |
| **Skyvern**                 | LLM-controlled browser for complex web tasks                                                   |

**Tavily remote MCP**: `https://mcp.tavily.com/mcp/?tavilyApiKey=<key>` (no local install needed)

### Code Execution / Sandboxes

| Tool             | Type                                                  |
| ---------------- | ----------------------------------------------------- |
| **E2B**          | Cloud — isolated execution environments for AI agents |
| **Microsandbox** | Self-hosted — secure code execution platform          |
| **Docker MCP**   | Container management + execution                      |

### Extended File Systems

| Tool                            | Adds                                          |
| ------------------------------- | --------------------------------------------- |
| **Everything Search** (Windows) | Lightning-fast file search via Everything SDK |
| **FileStash**                   | Remote: SFTP, S3, FTP, SMB, NFS, WebDAV, GIT  |
| **fast-filesystem-mcp**         | Large file handling, streaming writes, backup |

### Databases

PostgreSQL, SQLite, DuckDB, MongoDB, MySQL, BigQuery, Qdrant (vector), Redis, Snowflake, Airtable, Excel — most read-only with schema inspection.

### Version Control

GitHub (80+ tools: repos, PRs, issues, code search), GitLab (project management, CI/CD), Git (local operations).

---

## Tool Combination Patterns

### Deep Research Pipeline

```
web_search → [n results] → web_fetch (top 3) → code_execution (analyze) → memory (write findings)
```

Used by: GPT-Researcher architecture (planner + execution agents, 27k stars).

### Generative Agent Loop

```
memory (read) → plan → web_search / bash / text_editor → memory (write) → reflect
```

Mirrors Park et al. 2023: memory stream + reflection + planning.

### Coding + Verification

```
text_editor (read) → text_editor (str_replace) → bash (run tests) → loop until green
```

The canonical `text_editor + bash` pairing.

### Autonomous Monitor

```
bash (check metrics every N sec) → if anomaly: web_search (context) → memory (log incident)
```

### RAG with Fresh Data

```
memory (check cache) → miss: web_search + web_fetch → code_execution (extract) → memory (cache result)
```

---

## Relevance to Emma

Emma's agent loop (`src/core/agent-loop.ts`) supports tools via `triggerType` but has no tool implementations beyond integration OAuth adapters.

| Tool                        | Emma use case                                             | Phase                          |
| --------------------------- | --------------------------------------------------------- | ------------------------------ |
| `web_search`                | Proactive research — "I looked up your meeting agenda"    | Phase 2                        |
| `web_fetch`                 | Fetch a specific URL the user shares                      | Phase 2, pair with web_search  |
| `code_execution`            | Analyze data user shares, run calculations                | Phase 2–3                      |
| `memory` (Anthropic)        | Cross-session context persistence                         | Alternative to Supabase memory |
| `advisor`                   | Haiku executor + Opus advisor for complex tasks           | Cost optimization              |
| `sequential_thinking` (MCP) | Structured reasoning for complex multi-step plans         | Phase 2                        |
| `text_editor`               | Manage user's documents                                   | Phase 3–4                      |
| `bash`                      | System automation (dangerous — requires tight sandboxing) | Phase 4 only                   |
| `computer_use`              | Full desktop automation                                   | Phase 4                        |
| Tavily MCP                  | Better search quality than raw web_search                 | Alternative to web_search      |
| MCP Memory                  | Knowledge graph for user facts/relations                  | Alternative to flat memory     |
| E2B / Microsandbox          | Safe code execution in agent tasks                        | Phase 3                        |

---

## Non-Anthropic, Free-First Tools (Emma uses OpenRouter, not Anthropic)

> **Added 2026-05-31.** Emma routes 100% through OpenRouter (`OPENROUTER_API_KEY`) on free-tier models
> (`openai/gpt-oss-120b:free`, `google/gemma-4-31b-it:free`). Anthropic's server tools
> (`web_search`, `code_execution`, `advisor`, etc.) run on **Anthropic's** infrastructure and are
> only reachable through the Anthropic API. They are NOT available via OpenRouter. Everything below
> is provider-agnostic and free-first.

### The architectural shift: server tools → client-side function tools

Anthropic's server tools are special block types Anthropic executes for you. Emma can't use them.
The provider-agnostic equivalent is **OpenAI-style function calling** (which OpenRouter supports for
tool-capable models). The pattern:

1. Emma defines tools in the OpenAI `tools` schema and passes them in the chat request.
2. The model emits a `tool_calls` array.
3. **Emma's own server executes the call** — by calling a free API (Jina, Tavily, self-hosted Piston).
4. Emma appends the result as a `role: "tool"` message and loops.

```typescript
// OpenRouter chat request with OpenAI-format tools (works on tool-capable free models)
const body = {
  model: "openai/gpt-oss-120b:free", // MUST be a tool-calling-capable model
  messages,
  tools: [
    {
      type: "function",
      function: {
        name: "web_search",
        description: "Search the web for current information.",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    },
  ],
  tool_choice: "auto",
};
// When response has message.tool_calls, Emma's server runs the search and
// appends { role: "tool", tool_call_id, content: <results> }, then re-calls.
```

**Model caveat**: not every free model supports tool calling. Emma's `MODEL_UTILITY` already uses
`gpt-oss-120b:free` precisely because `gpt-oss-20b` does NOT support `tool_calls` (noted in CLAUDE.md).
Tool-calling-capable free models on OpenRouter include `openai/gpt-oss-120b:free`,
`google/gemini-2.0-flash-exp:free`, `meta-llama/llama-3.3-70b-instruct` (paid but cheap),
and several Qwen free variants. Verify a model's `supported_parameters` includes `tools` before relying on it.

---

### Web Search — free options

| Option                     | Free tier                         | Key needed                        | Self-host | Notes                                                                                                   |
| -------------------------- | --------------------------------- | --------------------------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| **Jina `s.jina.ai`**       | 10M tokens free (~1000 searches)  | Free key (or keyless lower limit) | No        | Returns top-5 results as clean LLM-ready text. `GET https://s.jina.ai/?q=<query>`                       |
| **Tavily**                 | **1,000 credits/month, no CC**    | Yes (free)                        | No        | AI-first. Basic search = 1 credit, advanced = 2. Best quality-per-free-credit                           |
| **Brave Search API**       | **$5 free credits every month**   | Yes (free)                        | No        | Real search index. ~free for low volume. `api.search.brave.com/res/v1/web/search`                       |
| **SearXNG**                | **Unlimited (self-hosted)**       | No                                | **Yes**   | Open-source metasearch. Aggregates Google/Bing/etc. Zero per-query cost. JSON output via `?format=json` |
| **DuckDuckGo**             | Free, unofficial                  | No                                | No        | No official API; via `duckduckgo-search` lib or HTML endpoint. Rate-limited, fragile                    |
| **OpenRouter web plugin**  | NOT free                          | (OpenRouter key)                  | No        | `:online` suffix or `plugins:[{id:"web"}]`. Works on free models but **Exa charges $0.005/search**      |
| **OpenRouter + Firecrawl** | 10,000 credits free (3-mo expiry) | BYOK Firecrawl                    | No        | `plugins:[{id:"web", engine:"firecrawl"}]`. Uses your Firecrawl credits, no OpenRouter surcharge        |

**OpenRouter web plugin** (easiest but not free): append `:online` to any model slug, even free ones:

```json
{ "model": "openai/gpt-oss-120b:free:online" }
```

Results come back standardized as `annotations[].url_citation` (url, title, content, start/end index).
Exa is the default engine ($0.005/req + $0.001/result over 10). Firecrawl engine is BYOK with 10K free credits.

**Recommended free pick**: **Tavily** (1000/mo, best quality, trivial API) for production, or **SearXNG**
self-hosted for unlimited zero-cost. Jina `s.jina.ai` as a keyless fallback.

---

### Web Fetch — free options

| Option               | Free tier                                  | Key        | Self-host | Notes                                                                                                         |
| -------------------- | ------------------------------------------ | ---------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| **Jina `r.jina.ai`** | **20 RPM keyless / 500 RPM with free key** | Optional   | No        | Prepend `https://r.jina.ai/` to any URL → clean markdown. Handles PDFs, JS pages, image captions. Open source |
| **MCP fetch server** | Free                                       | No         | **Yes**   | `npx -y @modelcontextprotocol/server-fetch`. HTML→markdown, chunked reads. No JS rendering                    |
| **Firecrawl**        | 500 credits/month free                     | Yes (free) | Optional  | `/scrape` endpoint, JS rendering, structured extraction. Self-hostable (open source)                          |
| **gstack `/browse`** | Free (already installed)                   | No         | Local     | Emma's devs already use it. Full Chromium, JS pages, `text`/`html`/`screenshot`                               |

**Recommended free pick**: **Jina `r.jina.ai`** — free, no key, handles PDFs and JS-rendered pages,
one-line integration (`fetch("https://r.jina.ai/" + url)`).

---

### Code Execution — free options

| Option                 | Free tier                               | Self-host | Notes                                                                                                           |
| ---------------------- | --------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| **E2B**                | **Hobby: $100 one-time credits, no CC** | No        | Cloud sandboxes. 1-hr sessions, 20 concurrent. `$0.000028/s` after credits. Best DX                             |
| **Self-hosted Piston** | **Free, unlimited**                     | **Yes**   | Open-source, Docker Compose. ⚠️ Public API restricted to non-commercial as of Feb 2026 — **self-host for Emma** |
| **Self-hosted Judge0** | Free                                    | **Yes**   | Open-source, 60+ languages. Also a paid RapidAPI hosted tier                                                    |
| **Microsandbox**       | Free                                    | **Yes**   | Open-source secure sandbox, MCP-native                                                                          |
| **Local Docker**       | Free                                    | **Yes**   | Run code in a throwaway container Emma controls. Most control, most setup                                       |

**Important**: Piston's **public** API (`emkc.org/api/v2/piston`) became non-commercial-only on
Feb 15 2026. For Emma (a commercial product), the free path is **self-hosting Piston** via Docker, or
**E2B Hobby** ($100 free credits) for managed sandboxes with zero ops.

**Recommended free pick**: **E2B Hobby** to start (no ops, $100 credits), migrate to **self-hosted
Piston** if volume grows.

---

### Advisor equivalent — free, via OpenRouter multi-model

Anthropic's `advisor` tool (cheap executor consults a smart model mid-generation) is Anthropic-only.
The provider-agnostic version is **trivial on OpenRouter**: just call a second model.

```typescript
// "Advisor" = a second OpenRouter call to a stronger model for planning.
async function consultAdvisor(transcript: Message[]): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: openRouterHeaders(),
    body: JSON.stringify({
      model: "deepseek/deepseek-r1:free", // free reasoning model as the "advisor"
      messages: [
        {
          role: "system",
          content: "You are a strategic planner. Read the transcript and return a concise plan.",
        },
        ...transcript,
      ],
    }),
  });
  return extractText(await res.json());
}
```

Executor stays on `gpt-oss-120b:free`; escalate to a free reasoning model (`deepseek-r1:free`,
`qwen/qwq-32b:free`) only when a plan is needed. Zero extra infrastructure — it's just another
OpenRouter request. This is strictly more flexible than Anthropic's advisor (any model pairing, not
just Opus).

---

### Memory, Bash, Text Editor — free (Emma already controls these)

These are **client-side** tools in Anthropic's model too — meaning you implement the backend. Emma
already has the pieces:

| Tool               | Free approach for Emma                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Memory**         | Emma already has `memory-db.ts` + Supabase (free tier). OR add the free MCP knowledge-graph server (`npx -y @modelcontextprotocol/server-memory`) for entity/relation memory |
| **Bash**           | Implement as a client-side function tool with an **allowlist** + Docker sandbox. Same safety rules as the Anthropic version (reject `&&`/`                                   | `/`;`/`>`). High risk — Phase 4 only |
| **Text Editor**    | Free MCP filesystem server (`npx -y @modelcontextprotocol/server-filesystem`) OR implement `view`/`str_replace`/`create`/`insert` directly against Emma's storage            |
| **Filesystem/Git** | Free MCP servers (`server-filesystem`, `mcp-server-git`) — provider-agnostic, run as local processes                                                                         |

The MCP servers are all free, open-source npm/uvx packages. They speak stdio/HTTP, so Emma reaches
them either by running her own MCP client loop or (since she's on OpenRouter, not Anthropic) by
calling their underlying logic directly as function tools.

---

### Computer Use — free options

| Option               | Free                  | Self-host | Notes                                                                     |
| -------------------- | --------------------- | --------- | ------------------------------------------------------------------------- |
| **Playwright**       | **Yes (open source)** | Yes       | Browser automation. Pair with a vision model for screenshot→action loops  |
| **gstack `/browse`** | Yes (installed)       | Local     | Emma's devs already use it — full Chromium control                        |
| **browser-use**      | Yes (open source)     | Yes       | LLM-driven browser agent, OpenAI-compatible, works with OpenRouter models |
| **Skyvern**          | Yes (open source)     | Yes       | LLM browser automation with its own planning                              |

Anthropic's `computer_use` needs the Anthropic API + a VM. The free, provider-agnostic path is
**Playwright or browser-use** driven by Emma's OpenRouter vision model (`gemini-2.5-flash`) — see
`vision-research.md` for the screenshot→action loop.

---

### Recommended Free Tool Stack for Emma (all provider-agnostic)

| Capability       | Free pick                                      | Fallback                        |
| ---------------- | ---------------------------------------------- | ------------------------------- |
| Web search       | Tavily (1000/mo free)                          | SearXNG self-hosted (unlimited) |
| Web fetch        | Jina `r.jina.ai` (keyless)                     | MCP fetch server                |
| Code execution   | E2B Hobby ($100 credits)                       | Self-hosted Piston (Docker)     |
| Advisor          | OpenRouter 2nd-model call (`deepseek-r1:free`) | —                               |
| Memory           | Existing Supabase + `memory-db.ts`             | MCP knowledge-graph server      |
| Text editor / FS | Direct impl or MCP filesystem                  | —                               |
| Bash             | Docker-sandboxed function tool (Phase 4)       | —                               |
| Computer use     | Playwright + `gemini-2.5-flash` vision         | gstack `/browse`                |

**Integration point**: all of these become **OpenAI-format function tools** in Emma's
`src/core/agent-loop.ts`. When `gpt-oss-120b:free` emits a `tool_call`, Emma's server runs the free
API and loops. No Anthropic API, no per-tool vendor lock-in.

---

## Sources

- Anthropic tool docs — server tools, web_search, web_fetch, code_execution, advisor, memory, bash, text_editor, computer_use, tool combinations — live-browsed 2026-05-31
- OpenRouter docs — web search plugin (`:online`, Exa/Firecrawl/Parallel engines, pricing), tool calling format — live-browsed 2026-05-31
- Jina AI Reader — `r.jina.ai` (fetch) + `s.jina.ai` (search), free rate limits, 10M free tokens, open source
- Tavily docs — 1,000 free credits/month (no CC), credit costs per search/extract/crawl
- Brave Search API — $5 free credits/month, Data-for-AI plan
- E2B pricing — Hobby tier free ($100 one-time credits, no CC), usage-based after
- Piston (`engineer-man/piston`) — open-source code exec; public API non-commercial-only as of Feb 2026; self-host free
- SearXNG docs — open-source self-hosted metasearch, JSON output
- OpenAI Agents SDK `docs/tools.md` — hosted tools, ComputerTool, ShellTool, ToolSearchTool, tool_namespace
- MCP official servers `modelcontextprotocol/servers` — fetch/filesystem/git/memory/sequential-thinking READMEs
- Awesome MCP Servers `appcypher/awesome-mcp-servers` — community categories (86.5k stars parent repo)
- Tavily MCP `tavily-ai/tavily-mcp` — search/extract/map/crawl tools, remote MCP endpoint
- MCP ADDITIONAL.md — frameworks, registries, management tools
