# LatentForge

[![Nix Flake](https://img.shields.io/badge/nix-flake-blue?logo=nixos)](https://nixos.org)
[![Python 3.12+](https://img.shields.io/badge/python-3.12+-3776ab?logo=python&logoColor=white)](https://python.org)
[![License: MIT](https://img.shields.io/github/license/utensils/latentforge)](LICENSE)
[![Claude Agent SDK](https://img.shields.io/badge/powered%20by-Claude%20Agent%20SDK-cc785c?logo=anthropic&logoColor=white)](https://github.com/anthropics/claude-agent-sdk-python)

Interactive CLI for building high-quality image datasets for [Flux](https://github.com/black-forest-labs/flux) LoRA fine-tuning, powered by the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-python).

Tell the agent what you want a dataset for — it searches, downloads, organizes, curates, deduplicates, resizes, and captions images through natural language conversation.

**📖 Full documentation:** run `pnpm run docs:dev` or browse the `docs/` directory. See [Getting Started](docs/guide/getting-started.md), [Architecture](docs/guide/architecture.md), and the [Tools Reference](docs/api/tools.md).

## Quick Start

### Run directly (no install)

```bash
# With Nix
nix run github:utensils/latentforge

# With uv
uvx latentforge
```

### Install

```bash
# With uv
uv tool install latentforge

# Run
latentforge                              # interactive — no config
latentforge --config configs/ghibli.yaml  # with a dataset config
```

### Development

```bash
nix develop     # enters devshell with latentforge, ruff, pyright, gallery-dl, uv
latentforge     # run the agent
nix fmt         # format nix + python files
```

## How It Works

```
latentforge → launches an interactive Claude agent
  → 22 custom MCP tools for image operations
  → Built-in vision to examine images
  → You chat to guide: "build me a dataset for X", "curate the logos", etc.
```

### Example Session

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

## Tools

22 custom MCP tools across the full dataset workflow:

| Category | Tools |
|----------|-------|
| **Config** | `create_config`, `read_config`, `update_config`, `list_configs` |
| **Search** | `search_bing`, `search_wikimedia` |
| **Download** | `download_images` (MD5 dedup), `download_gallery` (gallery-dl, 80+ sites) |
| **Browse** | `list_images`, `get_image_info` |
| **Organize** | `move_images`, `organize_images` |
| **Quality** | `analyze_quality`, `find_duplicates`, `detect_screenshots` |
| **Cropping** | `crop_center`, `crop_smart`, `crop_faces` |
| **Faces** | `detect_faces` |
| **Training** | `resize_images`, `write_caption` |
| **Export** | `export_dataset` (ai-toolkit format) |

The agent also has built-in `Read` (with vision for viewing images), `Write`, and `Bash` tools.

## Slash Commands

Type these during a session:

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/config` | Show active dataset config |
| `/tools` | List all agent tools |
| `/cost` | Show session cost |
| `/status` | Session status and context usage |
| `/model <name>` | Switch Claude model (forks session) |
| `/export [path]` | Export dataset to ai-toolkit format |
| `/compact` | Compact context (summarize + fresh session) |
| `/quit` | Exit |

## Dataset Config

Each dataset is a YAML file in `configs/`. The agent can create these for you, or you can write them by hand:

```yaml
name: ghibli
subject: "Studio Ghibli"
trigger_word: "ghibli_style"
output_dir: ./datasets/ghibli
search_queries:
  posters:
    - "Studio Ghibli movie poster art"
    - "Spirited Away poster"
  backgrounds:
    - "Studio Ghibli background art landscape"
categories:
  posters: "Movie poster art"
  backgrounds: "Background paintings and landscapes"
curation:
  target_count: "50-150"
  min_resolution: 512
  training_resolution: 1024
```

## Dataset Structure

Datasets are stored under `datasets/<name>/` with category subdirectories:

```
datasets/
└── ghibli/
    ├── posters/
    │   ├── studio_ghibli_movie_poster_a1b2c3d4e5f6.jpg
    │   ├── studio_ghibli_movie_poster_a1b2c3d4e5f6.txt
    │   └── ...
    └── backgrounds/
        ├── ghibli_background_art_7g8h9i0j1k2l.png
        └── ...
```

Images follow the naming pattern `{query_prefix}_{md5_hash}.{ext}` — the MD5 hash ensures deduplication across runs.

## Workflow

1. **Configure** — Create a YAML config (or ask the agent to make one)
2. **Collect** — Search Bing/Wikimedia and download with MD5 dedup
3. **Organize** — Auto-sort by category using filename prefixes
4. **Curate** — Agent views images and helps reject low-quality ones
5. **Deduplicate** — Perceptual hash detection finds near-duplicates
6. **Resize** — Batch resize to training resolution (default 1024x1024)
7. **Caption** — Write `.txt` captions with trigger word alongside each image
8. **Export** — Export to ai-toolkit format with auto-generated training config
9. **Train** — Use [ai-toolkit](https://github.com/ostris/ai-toolkit), [kohya-ss/sd-scripts](https://github.com/kohya-ss/sd-scripts), or similar

## Authentication

Set one of:
- `ANTHROPIC_API_KEY` — Anthropic API key
- `CLAUDE_CODE_OAUTH_TOKEN` — OAuth token (used when no API key is present)

## License

MIT
