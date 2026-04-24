---
title: Dataset Config
description: The YAML schema LatentForge uses to describe a dataset.
---

# Dataset Config

Every dataset is a YAML file under `configs/`. You can:

- **Ask the agent** to create one (`create_config` tool)
- **Write it by hand** using the schema below
- **Update** it mid-session (`update_config` tool, or edit the file directly)

Only `configs/` contents are gitignored — the directory itself is tracked with a `.gitkeep`.

## Minimal example

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

## Schema

### Top level

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` | yes | Short identifier for the dataset. Used as a filename prefix. |
| `subject` | `string` | yes | Human-readable subject (e.g. `"Studio Ghibli"`). Shown in the system prompt so the agent knows what it's building. |
| `trigger_word` | `string` | yes | The LoRA trigger token (e.g. `"ghibli_style"`). Written into every generated caption. |
| `output_dir` | `string` | yes | Path where images land (e.g. `./datasets/ghibli`). Relative paths are resolved from the repo root. |
| `search_queries` | `map<category, string[]>` | no | Search queries grouped by category. Used by `search_bing` / `search_wikimedia`. |
| `categories` | `map<category, string>` | no | Short description for each category. Shown to the agent. |
| `curation` | `object` | no | Target counts and resolution hints. See [Curation](#curation) below. |

### `search_queries`

A mapping from category name to a list of search strings. The category keys should match the keys in `categories`:

```yaml
search_queries:
  posters:
    - "Studio Ghibli movie poster art"
    - "Spirited Away poster"
    - "My Neighbor Totoro poster"
  characters:
    - "Studio Ghibli character portrait"
```

When the agent runs `search_bing` or `search_wikimedia`, it downloads into a per-category directory under `output_dir/<category>/`. Files are named `{query_prefix}_{md5_hash_12chars}.{ext}` so the same image from different queries deduplicates automatically.

### `categories`

Descriptions for each category. These end up in the agent's system prompt so it has useful context when curating:

```yaml
categories:
  posters: "Movie poster art — stylized, often with typography"
  backgrounds: "Background paintings — wide landscapes, architecture"
```

### Curation

Curation hints — the agent uses these when deciding how many images to keep and at what resolution to resize:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `target_count` | `string` | `"50-150"` | Desired image count range. The agent aims for the low end first, then curates up if quality is good. |
| `min_resolution` | `int` | `512` | Minimum acceptable dimension (px) on the short side. Images smaller than this are usually rejected. |
| `training_resolution` | `int` | `1024` | Target dimension for `resize_images` and the `crop_*` tools. Usually matches the LoRA training resolution. |

## On-disk layout

Running through the workflow produces a tree like:

```
datasets/
└── ghibli/
    ├── posters/
    │   ├── studio_ghibli_movie_poster_a1b2c3d4e5f6.jpg
    │   ├── studio_ghibli_movie_poster_a1b2c3d4e5f6.txt
    │   └── ...
    ├── backgrounds/
    │   ├── ghibli_background_art_7g8h9i0j1k2l.png
    │   └── ...
    └── rejected/
        └── ...
```

- **Filename prefix** — derived from the search query (lowercased, underscored). `organize_images` uses this prefix to auto-sort into the right category directory.
- **MD5 hash** — computed from the image bytes. Guarantees idempotency across multiple runs of the same search.
- **`.txt` sidecar** — written by `write_caption`. Contains the caption used during training, including the trigger word.
- **`rejected/`** — tools like `detect_screenshots` move low-quality images here rather than deleting them.

## Export

When the dataset is ready, `export_dataset` (or `/export`) flattens the category tree into a single directory suitable for [ai-toolkit](https://github.com/ostris/ai-toolkit), copies the `.txt` captions alongside, and generates a platform-specific training YAML (CUDA/bf16 on Linux, MPS/fp16 fallback on macOS).

See the [`export_dataset` tool reference](/api/tools#export-dataset) for parameters.
