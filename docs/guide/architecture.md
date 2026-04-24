---
title: Architecture
description: How LatentForge wires the Claude Agent SDK, MCP tools, session state, and slash commands together.
---

# Architecture

LatentForge is a thin interactive shell on top of the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-python). The agent is Claude; everything domain-specific — search, downloading, curation, export — lives in a local [MCP](https://modelcontextprotocol.io) server that the SDK connects to in-process.

```
┌───────────────────────────────────────────────────────────┐
│  latentforge CLI (src/latentforge/agent.py)               │
│                                                           │
│  ┌─────────────────┐      ┌──────────────────────────┐    │
│  │ REPL + Session  │─────▶│ ClaudeSDKClient           │    │
│  │ Stats / Status  │      │   model, system_prompt,   │    │
│  │ Slash commands  │      │   MCP server, allowlist   │    │
│  └─────────────────┘      └──────────────┬───────────┘    │
│         ▲                                │                │
│         │ TextBlock / ToolUseBlock       │                │
│         │                                ▼                │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ In-process MCP server "dataset"                     │  │
│  │   22 @tool functions (src/latentforge/tools.py)     │  │
│  │   search • download • curate • resize • export       │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

## The three modules

The whole app is three files under `src/latentforge/`:

| File | Responsibility |
| --- | --- |
| `agent.py` | CLI entry, REPL, session state, slash commands, compaction |
| `tools.py` | 22 `@tool` functions registered on the MCP server |
| `prompts.py` | Builds the system prompt, injecting dataset config when present |

## The agent loop

`latentforge` is a [`project.scripts`](https://github.com/utensils/latentforge/blob/main/pyproject.toml) entry pointing to `agent.cli`, which is a sync wrapper around `asyncio.run(main())`.

`main()`:

1. Parses `--config` and `--model` flags
2. Builds the system prompt via `build_system_prompt(config_path)`
3. Creates the MCP server with `create_sdk_mcp_server(name="dataset", tools=ALL_TOOLS)`
4. Constructs `ClaudeAgentOptions` with the allowed-tools allowlist
5. Connects the `ClaudeSDKClient` and enters the REPL
6. For each user turn: sends the input, streams the response via `_print_response()`, renders `TextBlock` as Markdown and `ToolUseBlock` as a `[tool: name]` indicator
7. Updates `SessionStats` from each `ResultMessage`

Rendering is handled by [rich](https://rich.readthedocs.io) so the REPL has live-updating status lines, colored tool tags, and Markdown formatting without a full TUI framework.

## Tool registration

All 22 tools live as `@tool`-decorated `async def` functions in `tools.py`, collected into an `ALL_TOOLS` list at the bottom of the file. Registration is one call:

```python
from claude_agent_sdk import create_sdk_mcp_server

server = create_sdk_mcp_server(
    name="dataset",
    version="1.0.0",
    tools=ALL_TOOLS,
)
```

And the SDK is told to allow them plus the built-in file/vision tools:

```python
ClaudeAgentOptions(
    system_prompt=system_prompt,
    model=model,
    mcp_servers={"ds": server},
    allowed_tools=["Read", "Write", "Bash", "mcp__ds__*"],
    permission_mode="acceptEdits",
    cwd=".",
)
```

::: tip Adding a tool
Decorate a new async function with `@tool(...)`, add it to `ALL_TOOLS`, and it's immediately available to the agent — no changes in `agent.py`. See the [Tools Reference](/api/tools) for existing conventions.
:::

## Session state and cost tracking

`SessionStats` holds per-session counters:

- `model`, `config_path`
- `total_cost` (USD)
- `turn_count`
- `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_create_tokens`

After each `ResultMessage`, stats are updated and the status bar (`context_bar()`) is re-rendered. It shows context usage as a percentage of the model's window, with warning colors at 50% / 75% / 90%.

`/status` and `/cost` both read from this same state — nothing extra is computed, so the numbers always match what the next API call will see.

## Context compaction

The Claude context window is finite. Long dataset-building sessions — especially those that view many images — fill it up. LatentForge handles this with **client-side compaction**:

- **Auto-compaction** fires when `context_pct >= 75%` and at least 3 turns have happened. The REPL interrupts on the next prompt tick with a notice.
- **Manual compaction** is triggered by typing `/compact`.

The compaction flow (`_compact_session()`):

1. Ask the agent: _"Summarize this session concisely — what dataset we're building, key decisions, the current state. Be specific."_
2. Consume the response silently and capture the summary text
3. `disconnect()` the current `ClaudeSDKClient`
4. Reset token counters in `SessionStats` (cost is cumulative across sessions)
5. `connect()` a fresh client with the same system prompt
6. Inject the summary as the first user message: _"Here is a summary of our previous conversation: ..."_
7. Ask the agent to acknowledge and continue

The net effect: token counters drop back near zero, but the agent keeps a high-fidelity recap of what it was doing.

## Slash command dispatch

Slash commands (`/help`, `/model`, `/export`, `/compact`, `/clear`, `/quit`, …) are handled **locally** — they never hit the API. They live in `SlashCommands` as methods that inspect state, print output, and either return control to the REPL or raise a sentinel exception:

- `_CompactRequest` — main loop runs compaction
- `_ModelChangeRequest` — main loop disconnects, rebuilds options with the new model, reconnects
- `_ExportRequest` — main loop invokes the `export_dataset` tool directly

This keeps the slash commands cheap and deterministic — you can run `/status` fifty times without burning tokens.

## The system prompt

`build_system_prompt(config_path=None)` returns a single string containing:

1. A description of LatentForge's purpose and workflow
2. A compact reference for all 22 tools (so the agent knows what's available before it calls any)
3. Guidance on when to deduplicate, resize, write captions, etc.
4. **If `config_path` is passed:** an "Active Dataset" section with the subject, trigger word, categories, and target counts extracted from the YAML

The rest of the config (search queries, paths) is left on disk — the agent is told to call `read_config` to see the full file when it needs to. This keeps the prompt small but gives the agent everything it needs to orient itself immediately.

## Nix integration

The project is packaged with [uv2nix](https://github.com/pyproject-nix/uv2nix): `uv.lock` is the source of truth, and Nix derives a reproducible build from `pyproject.toml` + the lockfile. `sourcePreference = "wheel"` avoids rebuilding native extensions (PIL, OpenCV) from source.

- `nix run` — build and launch the agent
- `nix develop` — drop into a shell with the venv, `ruff`, `pyright`, `gallery-dl`, plus `node`/`pnpm` for these docs
- `nix fmt` — format `.nix` with `nixfmt-rfc-style` and `.py` with `ruff` via [treefmt-nix](https://github.com/numtide/treefmt-nix)

## Further reading

- [**Tools Reference**](/api/tools) — every tool with parameters and notes
- [**Dataset Config**](/guide/dataset-config) — YAML schema for datasets
- [**Slash Commands**](/guide/slash-commands) — full in-session command list
- [Source on GitHub](https://github.com/utensils/latentforge/tree/main/src/latentforge)
