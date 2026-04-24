# Dataset Configuration

Each dataset is described by a YAML file in `configs/`. The agent creates these via the `create_config` tool, but you can also write them by hand.

## Complete example

```yaml
name: ghibli
subject: "Studio Ghibli"
trigger_word: "ghibli_style"
output_dir: ./datasets/ghibli

search_queries:
  posters:
    - "Studio Ghibli movie poster art"
    - "Spirited Away poster"
    - "My Neighbor Totoro poster"
  backgrounds:
    - "Studio Ghibli background art landscape"
    - "Ghibli forest painting"
  characters:
    - "Studio Ghibli character design"

categories:
  posters: "Movie poster art"
  backgrounds: "Background paintings and landscapes"
  characters: "Character design and portrait art"

curation:
  target_count: "50-150"
  min_resolution: 512
  training_resolution: 1024
```

## Field reference

### Top-level

| Field            | Type                 | Description                                                                                          |
| ---------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `name`           | `string` (required)  | Short machine-friendly slug. Used for the config filename and default output subdirectory.           |
| `subject`        | `string` (required)  | Human-readable description. Shown in the system prompt and guides the agent's curation judgement.    |
| `trigger_word`   | `string` (required)  | The LoRA token. Every generated caption starts with this word.                                       |
| `output_dir`     | `string` (required)  | Root directory for downloaded images. Defaults to `./datasets/<name>`.                               |
| `search_queries` | `map<string,list>`   | Search query templates per category. Used by `organize_images` to auto-sort downloads by filename.   |
| `categories`     | `map<string,string>` | Category slug → human description. Creates subdirectories under `output_dir`.                        |
| `curation`       | `object`             | Curation targets — see below.                                                                        |

### `curation` block

| Field                 | Type                | Description                                                                                   |
| --------------------- | ------------------- | --------------------------------------------------------------------------------------------- |
| `target_count`        | `string` or `int`   | Desired total image count. Ranges like `"50-150"` are fine — the agent treats them as goals.  |
| `min_resolution`      | `int`               | Smaller images are flagged as rejection candidates. LoRA training generally needs ≥ 512 px.   |
| `training_resolution` | `int`               | Target square resolution for `resize_images` / `crop_*`. Default 1024.                        |

## How categories drive the workflow

The keys under `categories` and `search_queries` must match. Each category becomes:

- A subdirectory under `output_dir` (for example `datasets/ghibli/posters/`).
- A prefix used by `organize_images` to auto-sort downloads based on the originating query.
- A column in the caption template — the agent uses the category description to seed captions when `write_caption` is invoked without explicit text.

## File naming

Images are saved as:

```
datasets/<name>/<category>/{query_prefix}_{md5_hash_12chars}.{ext}
```

The MD5 prefix guarantees that re-running the same download is a no-op — hashes collide only for identical files, so dedup is deterministic across sessions.

Caption sidecars sit next to the image with the same stem and a `.txt` extension.
