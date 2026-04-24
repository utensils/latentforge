---
title: Slash Commands
description: In-session commands for LatentForge — status, compaction, model switching, and more.
---

# Slash Commands

Slash commands are handled **locally** — they inspect session state, change the client, or trigger tools without sending anything to the Claude API. That makes them free to run and safe to call repeatedly.

Type a slash command at the prompt just like any other input:

```
> /status
```

## Reference

| Command | Description |
| --- | --- |
| `/help` | Print this list of commands. |
| `/config` | Show the active dataset config (subject, trigger word, categories, target counts). |
| `/tools` | List all tools available to the agent — MCP tools plus built-in `Read` / `Write` / `Bash`. |
| `/cost` | Show cumulative USD cost for the current session. |
| `/status` | Token counts, context usage percentage, turn count, uptime. |
| `/model <name>` | Switch to a different Claude model. Forks the session — history is preserved via an internal summary. |
| `/export [path]` | Export the active dataset to ai-toolkit format. Optional path overrides `output_dir`. |
| `/compact` | Summarize the conversation and restart with a fresh context window. |
| `/clear` | Clear the terminal screen. |
| `/quit`, `/exit`, `/q` | Exit the agent. |

## Supported models

`/model` accepts any of:

- `claude-sonnet-4-5` (default — good balance of speed and capability)
- `claude-opus-4-6` (most capable, slower, higher cost)
- `claude-haiku-4-5` (fastest, lowest cost)

Switching models **forks** the session: the current conversation is summarized, the old client is disconnected, and a new client is started with the same system prompt plus the summary injected. Token counters reset, but `/cost` keeps running across forks.

## When to compact

Context compaction is the single most useful command for long curation sessions. It's triggered two ways:

- **Automatically** when context usage hits 75% (and at least 3 turns have happened)
- **Manually** via `/compact` whenever you want to reclaim context

After compaction, the agent has a high-fidelity summary of what it was doing — dataset name, categories worked on, current state — but the raw message history is gone. This is almost always the right trade-off for long-running dataset builds, since older tool outputs (search results, listings) are rarely needed again.

See [Architecture → Context compaction](/guide/architecture#context-compaction) for the full flow.

## Cost tracking

Every API response includes usage info. `SessionStats` accumulates cost across every turn and every compaction — `/cost` and `/status` read from the same counters. The numbers are authoritative; there's no estimation involved.

Cached tokens (cache reads) are billed separately and are what make long sessions affordable — they dominate after the first few turns.
