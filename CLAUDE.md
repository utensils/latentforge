# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

LatentForge — interactive CLI for building image datasets for Flux LoRA fine-tuning, powered by the Claude Agent SDK. Users chat with a Claude agent that has 22 custom MCP tools for searching, downloading, curating, and exporting images.

## Commands

```bash
# Run
nix develop                              # devshell with all deps
latentforge                              # launch agent (no config)
latentforge --config configs/foo.yaml    # launch with dataset config
uv run latentforge                       # without nix

# Development
nix fmt              # format nix + python (nixfmt + ruff via treefmt)
ruff check src/      # lint
ruff format src/     # format python only
pyright src/         # type check (basic mode)
nix build            # build package
nix run . -- --help  # run from nix build result
```

## Architecture

```
src/latentforge/
  agent.py    — CLI entry point, interactive REPL, session management
  tools.py    — 22 MCP tools registered via @tool decorator
  prompts.py  — System prompt builder, injects dataset config context
```

**agent.py** is the core: it creates a `ClaudeSDKClient`, connects with `ClaudeAgentOptions`, and runs an interactive loop. Key patterns:
- `cli()` is the sync entry point (`asyncio.run(main())`)
- `_build_options()` constructs `ClaudeAgentOptions` with MCP server, allowed tools, and permission mode
- `_print_response()` consumes the async message stream, rendering `TextBlock` as markdown and `ToolUseBlock` as tool indicators
- `SessionStats` tracks token usage and cost; `context_bar()` renders the status line
- Client-side compaction: `_compact_session()` asks the agent to summarize, disconnects, starts a fresh session with the summary injected. Auto-triggers at 75% context usage.
- Slash commands (`/help`, `/model`, `/export`, `/compact`, etc.) are handled locally via `SlashCommands` class — they raise sentinel exceptions (`_CompactRequest`, `_ModelChangeRequest`, `_ExportRequest`) to signal the main loop

**tools.py** uses the `@tool` decorator from `claude_agent_sdk`. Each tool is an async function that takes `args: dict[str, Any]` and returns a dict with `content` (list of text blocks) and optional `is_error`. Use `_text()` and `_error()` helpers for responses. All tools are collected in the `ALL_TOOLS` list at the bottom.

**prompts.py** builds the system prompt. When a config path is provided, it appends an "Active Dataset" section with subject, trigger word, categories, and target counts.

## Adding a New Tool

1. Add an async function in `tools.py` with the `@tool` decorator
2. Use `_text(msg)` for success, `_error(msg)` for errors
3. Add it to the `ALL_TOOLS` list at the bottom of the file
4. The tool is automatically available to the agent — no changes needed in `agent.py`

## Build System

- **Python packaging**: hatchling with `src/` layout (`[tool.hatch.build.targets.wheel] packages = ["src/latentforge"]`)
- **Nix flake**: uv2nix derives the build from `pyproject.toml` + `uv.lock`. Uses `self` as `workspaceRoot` for fast eval. `sourcePreference = "wheel"` avoids building C extensions from source.
- **Formatting**: treefmt-nix wraps nixfmt-rfc-style (`.nix`) and ruff-format (`.py`); exposed as `formatter` output for `nix fmt`
- After changing dependencies: run `uv lock` then `nix flake update` if needed

## Dataset Config Format

YAML files in `configs/` define datasets. The agent creates these via `create_config`, or users write them by hand:

```yaml
name: ghibli
subject: "Studio Ghibli"
trigger_word: "ghibli_style"
output_dir: ./datasets/ghibli
search_queries:
  posters:
    - "Studio Ghibli movie poster art"
categories:
  posters: "Movie poster art"
curation:
  target_count: "50-150"
  min_resolution: 512
  training_resolution: 1024
```

Images are stored as `datasets/<name>/<category>/{prefix}_{md5_hash_12chars}.{ext}` with optional `.txt` caption sidecar files. Both `datasets/` and `configs/` contents are gitignored (only `.gitkeep` is tracked).

## Lint Exceptions

- `src/latentforge/prompts.py` has E501 suppressed (long system prompt strings)
