# Getting Started

LatentForge is an interactive CLI for building image datasets for
[Flux](https://github.com/black-forest-labs/flux) LoRA fine-tuning. You talk to
a Claude agent — it calls 22 custom [MCP tools](/reference/tools) to search,
download, curate, deduplicate, resize, and caption images end-to-end.

## Requirements

- A **Claude API key** (`ANTHROPIC_API_KEY`) _or_ a **Claude Code OAuth token**
  (`CLAUDE_CODE_OAUTH_TOKEN`)
- Python 3.12+ (provided by the Nix flake)
- Optional: [gallery-dl](https://github.com/mikf/gallery-dl) for non-Bing
  sources (DeviantArt, ArtStation, Pinterest, Tumblr, Reddit, Flickr, etc.) —
  also provided by the flake

## Install

### Run directly, no install

```bash
# With Nix (recommended)
nix run github:utensils/latentforge

# With uv
uvx latentforge
```

### Install the CLI

```bash
# With uv
uv tool install latentforge

# Now on PATH
latentforge
```

### From a clone (development)

```bash
git clone https://github.com/utensils/latentforge
cd latentforge
nix develop                              # devshell with all deps
latentforge                              # launch the agent
```

## Authenticate

Set one of the following env vars before launching:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
# or
export CLAUDE_CODE_OAUTH_TOKEN="..."
```

The banner shown on startup confirms which method was detected.

## First Session

Launch without a config — the agent will help you create one:

```bash
latentforge
```

```
> I want a dataset for Studio Ghibli art styles

  ▸ create_config
  Created config: configs/ghibli.yaml with 5 categories

> Search for movie poster art and download them

  ▸ search_bing
  Found 18 image URLs for 'Studio Ghibli movie poster art'
  ▸ download_images
  Download complete: 15 saved, 2 skipped (dup), 1 failed
```

Or load an existing config on startup:

```bash
latentforge --config configs/ghibli.yaml
```

## Choose a model

Default is `claude-sonnet-4-5`. Switch at launch:

```bash
latentforge --model claude-opus-4-6
```

Or inside a session:

```
> /model claude-haiku-4-5
```

## Slash commands

During a session, these hit locally without costing tokens:

| Command | Description |
| --- | --- |
| `/help` | Show the command list |
| `/config` | Print the active dataset config |
| `/tools` | List MCP tools grouped by category |
| `/status` | Session cost, turns, and context usage |
| `/model <name>` | Switch Claude model (forks the session) |
| `/export [path]` | Export to ai-toolkit format |
| `/compact` | Summarize + start a fresh session with the summary |
| `/quit` | Exit |

See [Slash Commands](/reference/slash-commands) for full details.

## Next steps

- [Architecture](/guide/architecture) — how agent.py, tools.py, and prompts.py
  fit together
- [Dataset Config](/guide/configs) — YAML reference
- [Workflow](/guide/workflow) — the nine-step pipeline from empty config to
  trained LoRA
- [MCP Tools](/reference/tools) — auto-generated reference for all 22 tools
