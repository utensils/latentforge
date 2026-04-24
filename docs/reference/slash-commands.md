# Slash Commands

Slash commands are handled **locally** by the CLI — they don't consume tokens
or hit the Claude API. Type them at the prompt in any session.

## Commands

| Command | Alias | Description |
| --- | --- | --- |
| `/help` | `/h` | Show the command list |
| `/config` | | Print the active dataset config with syntax highlighting |
| `/tools` | | List the 22 MCP tools grouped by category |
| `/cost` | | Show total session cost in USD |
| `/status` | | Auth method, model, session ID, turns, cost, uptime, context usage |
| `/model` | | Show current model and list available models |
| `/model <name>` | | Switch Claude model (forks the current session) |
| `/export` | | Export the active dataset to ai-toolkit format (auto-detected path) |
| `/export <path>` | | Export to an explicit output directory |
| `/compact` | | Summarize the conversation and restart with a fresh context |
| `/clear` | | Clear the terminal |
| `/quit` | `/q`, `/exit` | Exit the agent |

## Available models

```
claude-sonnet-4-5   (default — balanced speed/quality)
claude-opus-4-6     (highest quality)
claude-haiku-4-5    (fastest, cheapest)
```

Model switches **fork** the session so you keep the full conversation
history. See [Architecture → Client-side compaction](/guide/architecture#client-side-compaction)
for how forking and compaction interact.

## Tab completion

The REPL uses `readline` with tab completion against the slash-command list —
type `/` + Tab to see options, or start typing and press Tab to complete.

## Auto-compaction

Separate from the manual `/compact`, the CLI will **auto-compact** when
context usage reaches 75% of the model's window. You'll see:

```
Context at 78% — auto-compacting...
Auto-compacted: 156k → 14.2k tokens
```

The summarisation itself uses the current model and is driven by the
`COMPACTION_SUMMARY_PROMPT` in `agent.py`.
