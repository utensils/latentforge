# Dataset Config

Each dataset is a YAML file in `configs/`. The agent can create and edit these
for you (via `create_config` / `update_config`), or you can write them by
hand.

## Full example

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

## Fields

| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Short slug, used for the dataset folder and training run name |
| `subject` | string | Human-readable subject description the agent uses in prompts |
| `trigger_word` | string | Token prepended to every caption and used at inference time |
| `output_dir` | path | Where downloaded images land (typically `./datasets/<name>`) |
| `search_queries` | map | `category → list[str]` — Bing/Wikimedia queries per category |
| `categories` | map | `category → description` — used to generate default captions |
| `curation.target_count` | string/int | Target dataset size (e.g. `"50-150"`) |
| `curation.min_resolution` | int | Minimum dimension in pixels for keeps |
| `curation.training_resolution` | int | Target edge length for `resize_images` |

## Dataset layout on disk

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

Image filenames follow the pattern `{query_prefix}_{md5_hash_12chars}.{ext}`.
The MD5 hash ensures cross-run deduplication — re-running a search will
silently skip anything you already have.

Optional sidecar `.txt` files sit next to each image and hold its caption.

## Trigger word tips

- **Make it unique.** `ghibli_style` is fine; `style` will collide with
  anything else you've trained.
- **No spaces.** Single token (or hyphen/underscore-joined).
- **Prefix every caption.** `write_caption` and `export_dataset` both expect
  the trigger word at the start.

## Captioning guidelines

The agent's system prompt already encodes these — you don't need to think
about them unless you're hand-writing captions:

- Start with the trigger word.
- 1–2 sentences, describe visual content, style, composition.
- Mention the subject naturally — no marketing copy.
- Example: `ghibli_style, lush green hillside with a small cottage, soft
  watercolor clouds, Studio Ghibli background art`.
