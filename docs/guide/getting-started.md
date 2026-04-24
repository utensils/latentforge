---
title: Getting Started
description: Install LatentForge and build your first LoRA dataset in a few minutes.
---

# Getting Started

LatentForge is an interactive CLI where you chat with a Claude agent to build image datasets for [Flux](https://github.com/black-forest-labs/flux) LoRA fine-tuning. The agent can search the web, download images, organize them into categories, deduplicate, resize, caption, and export directly to [ai-toolkit](https://github.com/ostris/ai-toolkit) training format — all through natural language.

## Prerequisites

You need **one** of:

- [**Nix**](https://nixos.org/download) with flakes enabled (recommended — zero local setup)
- [**uv**](https://docs.astral.sh/uv/) (Python 3.12+ package manager)

And one authentication credential for Claude:

- `ANTHROPIC_API_KEY` — [Anthropic API key](https://console.anthropic.com/settings/keys), **or**
- `CLAUDE_CODE_OAUTH_TOKEN` — OAuth token from a signed-in Claude Code session

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Install & Run

### With Nix (no install)

```bash
nix run github:utensils/latentforge
```

The flake builds the full environment — Python, PIL, gallery-dl, CUDA on Linux — and launches the agent.

### With uv

```bash
# One-shot, no install
uvx latentforge

# Or install globally
uv tool install latentforge
latentforge
```

### Development checkout

```bash
git clone https://github.com/utensils/latentforge
cd latentforge
nix develop       # drops you into a shell with every dep
latentforge       # launch the agent
```

::: tip direnv
If you use [direnv](https://direnv.net/), an `.envrc` is included — the devshell activates automatically when you `cd` into the repo.
:::

## Your First Session

Launch the agent without a config to explore:

```bash
latentforge
```

You'll see a prompt — type naturally. The agent has [22 tools](/api/tools) plus vision-enabled file reading, so it can download, look at, and reason about images end-to-end.

### Example: building a Studio Ghibli dataset

```
> I want a dataset for Studio Ghibli art styles

  [tool: create_config]
  Created config: configs/ghibli.yaml with 5 categories

> Search for movie poster art and download them

  [tool: search_bing]
  Found 18 image URLs for 'Studio Ghibli movie poster art'
  [tool: download_images]
  Download complete: 15 saved, 2 skipped (dup), 1 failed

> Find duplicates and show me quality stats

  [tool: find_duplicates]
  Found 2 duplicate pairs (threshold=8)
  [tool: analyze_quality]
  Total: 15 images, avg 1340x1020, 12 at 1024+
```

## Launching with a config

If you already have a YAML config in `configs/`, pass it with `--config`:

```bash
latentforge --config configs/ghibli.yaml
```

The agent loads the config into its system prompt so it knows the subject, trigger word, target counts, and category layout — you can skip straight to searching and curating.

See [Dataset Config](/guide/dataset-config) for the full schema.

## The Typical Workflow

1. **Configure** — ask the agent to create a YAML config, or write one by hand
2. **Collect** — `search_bing` / `search_wikimedia` → `download_images`
3. **Organize** — `organize_images` auto-sorts by filename prefix into category dirs
4. **Curate** — agent views images and helps you reject low-quality ones
5. **Deduplicate** — `find_duplicates` uses perceptual hashing to catch near-dupes
6. **Resize** — `resize_images` or one of the `crop_*` tools to training resolution
7. **Caption** — `write_caption` creates `.txt` sidecars with your trigger word
8. **Export** — `export_dataset` produces an [ai-toolkit](https://github.com/ostris/ai-toolkit)-compatible folder + training YAML
9. **Train** — hand the exported folder to ai-toolkit, kohya-ss, or your trainer of choice

## Slash commands

A few useful ones while you're in a session:

| Command | What it does |
| --- | --- |
| `/help` | List all available commands |
| `/status` | Show token usage, cost, context pct |
| `/compact` | Summarize + restart to free context |
| `/export` | Export the active dataset |
| `/quit` | Exit the agent |

See the [full list](/guide/slash-commands) for model switching, cost tracking, and more.

## Next steps

- [**Architecture**](/guide/architecture) — how the agent, tools, and session work under the hood
- [**Tools Reference**](/api/tools) — every tool, its parameters, and what it does
- [**Dataset Config**](/guide/dataset-config) — full YAML schema with annotated examples
