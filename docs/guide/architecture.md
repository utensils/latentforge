# Architecture

LatentForge is a thin, deliberate wrapper around the
[Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-python). The
codebase is small — three files — and each file owns one concern.

## Module map

```
src/latentforge/
├── agent.py     ← CLI entry point, REPL, session state, compaction
├── tools.py     ← 22 MCP tools registered via @tool decorator
└── prompts.py   ← System prompt builder (injects dataset config)
```

### `agent.py`

The core of the CLI. It:

- Parses args (`--config`, `--model`).
- Creates a `ClaudeSDKClient` wired to:
  - The MCP server built from `ALL_TOOLS` in `tools.py`.
  - The system prompt from `prompts.py`.
  - `permission_mode="acceptEdits"` (the agent can `Read`, `Write`, `Bash`, and
    call any `mcp__ds__*` tool without prompting).
- Runs an interactive REPL with readline tab-completion over slash commands.
- Streams `AssistantMessage` chunks, rendering `TextBlock`s as Markdown and
  `ToolUseBlock`s as `▸ tool_name` indicators.
- Tracks `SessionStats` (tokens, cost, turns, uptime) and paints a status line
  below the prompt, like Claude Code.
- Runs **client-side context compaction** — when usage hits 75% of the context
  window, the agent is asked for a structured summary, the old session is
  closed, and a fresh session is opened with the summary injected as a primer.

### `tools.py`

Every dataset operation is an async function decorated with `@tool(name,
description, params_schema)`. The decorator is from `claude_agent_sdk`; all
tools return `{"content": [{"type": "text", ...}], "is_error": bool}`. A pair
of helpers (`_text` and `_error`) keeps the return shape consistent.

All tools are collected in the `ALL_TOOLS` list at the bottom of the file. Add
a function, decorate it, and append it to the list — nothing else in the app
needs to change.

See the full [MCP Tools reference](/reference/tools).

### `prompts.py`

`build_system_prompt(config_path)` builds a single string: a catalogue of the
agent's capabilities, curation guidelines, a short captioning style guide, and
— if a YAML config is loaded — a "Active Dataset" section with the subject,
trigger word, categories, and target count. The agent uses this as a stable
reference throughout the session.

## Runtime flow

```
user input
   │
   ▼
SlashCommands.handle ──► yes? handle locally (no API call)
   │
   │ no (it's a message)
   ▼
ClaudeSDKClient.query(text)
   │
   ▼
receive_messages() async stream
   │ ┌─► TextBlock      → render as Markdown to stdout
   │ ├─► ToolUseBlock   → agent decided to call a tool
   │ │     │
   │ │     ▼
   │ │   MCP server invokes the Python @tool
   │ │   function → returns text → fed back to agent
   │ │
   │ └─► ResultMessage  → update SessionStats (cost, tokens)
   ▼
auto-compact? (>=75% context) → yes: summarize + fork session
   │
   ▼
back to REPL
```

## Permissions

The agent is given access to these tool categories — no runtime prompts:

- `Read`, `Write`, `Bash` — built into the SDK (Read has vision, so the agent
  can open images directly)
- `mcp__ds__*` — wildcard for every tool registered by the `dataset` MCP
  server, i.e. everything in `ALL_TOOLS`

See `_build_options` in `agent.py` for the full
[`ClaudeAgentOptions`](https://github.com/anthropics/claude-agent-sdk-python)
construction.

## Client-side compaction

The SDK doesn't auto-compact when using OAuth auth, so LatentForge does it
itself:

1. At **75%** context usage (`AUTO_COMPACT_PCT` in `agent.py`) the agent is
   asked to summarise the session: dataset state, actions taken, counts, open
   tasks, user preferences.
2. The SDK client **disconnects** — dropping the entire message history.
3. A **new** `ClaudeSDKClient` is opened with the same system prompt and
   model.
4. The summary text is injected as the first query, so the agent continues
   with context but only pays the cost of the summary.

The manual `/compact` slash command runs the same flow on demand.

## Extending

To add a new dataset tool:

1. Write an `async def foo(args: dict[str, Any]) -> dict[str, Any]` in
   `tools.py` and decorate it with `@tool(...)`.
2. Return `_text("...")` on success or `_error("...")` on failure.
3. Append the function to `ALL_TOOLS` at the bottom.

That's it — the MCP server picks it up on next launch, and this docs site
will auto-generate an entry for it in the [tools reference](/reference/tools)
on the next `pnpm build`.
