# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

LatentForge — an interactive image dataset collection and curation tool for LoRA training, powered by the Claude Agent SDK. MCR (My Chemical Romance) is the first dataset, but the tool works for any subject.

## Architecture

```
User runs CLI → launches interactive Claude agent (Agent SDK)
  → Agent has custom MCP tools for image ops
  → Agent uses built-in Read tool for vision (viewing images)
  → Agent uses built-in Write tool for files
  → User chats to guide: "build me an MCR dataset", "curate the album covers", etc.
```

## Running the Agent

```bash
# Nix (recommended)
nix develop          # enters devshell with all deps
latentforge          # run the agent
latentforge --config configs/mcr.yaml  # with MCR config

# Or without Nix
uv run latentforge
uv run latentforge --config configs/mcr.yaml
```

## Development Commands

```bash
nix fmt              # format nix + python files (nixfmt + ruff)
ruff check src/      # lint python
ruff format src/     # format python only
pyright src/         # type check
nix build            # build the package
nix run . -- --help  # run from nix build
```

## Key Files

| File | Purpose |
|------|---------|
| `src/latentforge/agent.py` | CLI entry point — launches interactive Claude agent |
| `src/latentforge/tools.py` | Custom MCP tools (config, search, download, curation, quality) |
| `src/latentforge/prompts.py` | System prompt builder — injects dataset config context |
| `pyproject.toml` | Package metadata, dependencies, build config |
| `flake.nix` | Nix flake — uv2nix build, devshell, treefmt |
| `configs/mcr.yaml` | MCR dataset config (search queries, categories, curation settings) |

## Dataset Config Format

Each dataset is a YAML file in `configs/` (e.g., `configs/mcr.yaml`):

```yaml
name: mcr
subject: "My Chemical Romance"
trigger_word: "mcr_style"
output_dir: ./datasets/mcr
search_queries:
  album_covers:
    - "My Chemical Romance The Black Parade album cover"
  logos:
    - "My Chemical Romance logo"
categories:
  album_covers: "Album, EP, and single cover art"
  logos: "Band logos, emblems, icons"
curation:
  target_count: "50-150"
  min_resolution: 512
  training_resolution: 1024
```

## Custom MCP Tools (tools.py)

| Tool | Purpose |
|------|---------|
| `create_config` | Generate a new dataset YAML config |
| `read_config` | Load and return a dataset config |
| `update_config` | Update fields in an existing config |
| `list_configs` | List available configs in `configs/` |
| `search_bing` | Search Bing Images, return URLs |
| `search_wikimedia` | Search Wikimedia Commons API |
| `download_images` | Download URLs to a category dir with MD5 dedup |
| `download_gallery` | Download from 80+ sites via gallery-dl |
| `list_images` | List images with metadata (path, size, resolution) |
| `get_image_info` | Detailed info for one image |
| `move_images` | Move images between categories or to `rejected/` |
| `organize_images` | Auto-sort images by filename prefix |
| `analyze_quality` | Resolution distribution, file sizes, format stats |
| `find_duplicates` | Perceptual hash (phash) duplicate detection |
| `resize_images` | Batch resize to training resolution |
| `write_caption` | Write a .txt caption file alongside an image |
| `detect_screenshots` | Find and reject social media screenshots and text-only posts |
| `crop_center` | Center-crop images to square |
| `crop_smart` | Smart-crop to highest-entropy region |
| `detect_faces` | Detect faces and report bounding boxes |
| `crop_faces` | Crop around detected faces with padding |
| `export_dataset` | Export dataset to ai-toolkit format (flat dir + training config) |

## Dataset Structure

Datasets live under `datasets/<name>/` with category subdirectories:

```
datasets/
└── mcr/
    ├── album_covers/   — Album, EP, and single cover art
    ├── band_photos/    — Promo shots, live concert photos
    ├── eras/           — Era-specific imagery
    ├── fan_art/        — Fan-made graphic design and illustration
    ├── logos/          — Band logos, spider, killjoy, Black Parade emblems
    ├── merch/          — T-shirts, hoodies, vintage tees
    └── posters/        — Concert, tour, and gig poster art
```

Each dataset config's `output_dir` points to its directory (e.g., `./datasets/mcr`). Adding a new dataset creates a new subdirectory (e.g., `./datasets/pokemon`).

## Image Naming Convention

Files follow the pattern: `{search_query_prefix}_{md5_hash_12chars}.{ext}`

The MD5 hash prefix ensures deduplication across runs — re-running scripts won't create duplicates.
