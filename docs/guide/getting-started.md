# Getting Started

This guide takes you from zero to an exported ai-toolkit-ready dataset, using Studio Ghibli as the worked example.

## Prerequisites

- **Python 3.12+** (provided automatically by the Nix devshell)
- One of:
  - [Nix](https://nixos.org/download) with flakes enabled (recommended)
  - [uv](https://docs.astral.sh/uv/) for a pip-less Python install
- An Anthropic API key **or** a Claude Code OAuth token

## 1. Install

Pick whichever fits your setup — LatentForge ships as both a Nix flake and a PyPI-style Python package.

::: code-group

```bash [nix run]
# Run once, no install
nix run github:utensils/latentforge
```

```bash [uvx]
# Run once, no install
uvx latentforge
```

```bash [uv tool install]
# Persistent install
uv tool install latentforge
latentforge
```

```bash [nix develop]
# Clone + enter a dev environment with every dependency
git clone https://github.com/utensils/latentforge
cd latentforge
nix develop
latentforge
```

:::

## 2. Authenticate

Set **one** of these environment variables before launching:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."        # API key, or…
export CLAUDE_CODE_OAUTH_TOKEN="..."         # Claude Code OAuth token
```

If both are set, `ANTHROPIC_API_KEY` takes precedence.

## 3. First session

Launch with no config — the agent will help you create one.

```bash
latentforge
```

You'll see a prompt. Try:

```text
> I want a dataset for Studio Ghibli art styles — poster art, background
  paintings, and character design. Target around 100 training images.
```

The agent will call `create_config` and write a YAML file to `configs/ghibli.yaml`. From here you can either continue in the same session or restart with the new config loaded:

```bash
latentforge --config configs/ghibli.yaml
```

## 4. Collect and curate

With a config loaded, drive the agent through the dataset lifecycle:

```text
> Search Bing for movie poster art and download them into the posters category
```

The agent calls `search_bing` and `download_images`. Downloads are MD5-deduplicated automatically, and obvious screenshots / text-only posts are filtered out.

```text
> Analyze the quality of what we have so far, then find perceptual duplicates
```

`analyze_quality` reports resolution distribution and file-size stats; `find_duplicates` uses a perceptual hash (phash) to surface near-duplicates for you to review.

```text
> Show me the contents of posters/ and help me reject anything that looks
  off-topic, watermarked, or low quality
```

The agent uses its built-in vision capability to read each image, then calls `move_images` to push rejects into `rejected/`.

## 5. Prepare for training

Once curation looks good:

```text
> Resize everything to 1024x1024 training resolution into a /resized directory,
  then write default captions using our trigger word
```

The agent calls `resize_images` and `write_caption` — captions are `.txt` sidecar files that start with `ghibli_style` (the trigger word from the config).

## 6. Export

```text
> Export the dataset to ai-toolkit format
```

`export_dataset` auto-detects your ai-toolkit install, writes a flat directory of image + caption pairs, and generates a platform-specific training YAML (MPS on macOS, CUDA on Linux).

You're done — point ai-toolkit at the generated config and start training.

## Slash Commands

At any prompt you can type:

| Command         | Description                               |
| --------------- | ----------------------------------------- |
| `/help`         | List all slash commands                   |
| `/config`       | Show the active dataset config            |
| `/tools`        | List every tool the agent can invoke      |
| `/cost`         | Session spend so far                      |
| `/status`       | Context usage and session info            |
| `/model <name>` | Switch Claude model (forks the session)   |
| `/export [path]`| Export to ai-toolkit format               |
| `/compact`      | Summarize history and start a fresh session |
| `/quit`         | Exit                                      |

## Where to next

- [Dataset Configuration](./configuration) — every field of the YAML config explained.
- [End-to-end Workflow](./workflow) — a conceptual tour of the nine-step pipeline.
- [MCP Tools Reference](/tools/reference) — every tool with its parameters.
