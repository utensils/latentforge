<!--
  AUTO-GENERATED — do not edit by hand.
  Source: src/latentforge/tools.py (ALL_TOOLS)
  Regenerate: python scripts/gen_tools_docs.py
-->

# MCP Tools Reference

LatentForge exposes **22 custom MCP tools** to the agent, grouped below by workflow stage. Each tool is registered via the
[`@tool`](https://github.com/anthropics/claude-agent-sdk-python) decorator in `src/latentforge/tools.py`.

## Config

### `create_config`

Create a new dataset YAML config file

| Parameter | Type |
| --- | --- |
| `name` | `str` |
| `subject` | `str` |
| `trigger_word` | `str` |
| `output_dir` | `str` |
| `categories` | `str` |

### `read_config`

Load and return a dataset YAML config

| Parameter | Type |
| --- | --- |
| `path` | `str` |

### `update_config`

Update fields in a dataset YAML config

| Parameter | Type |
| --- | --- |
| `path` | `str` |
| `updates` | `str` |

### `list_configs`

List available dataset configs in configs/

_No parameters._

## Search

### `search_bing`

Search Bing Images and return URLs

| Parameter | Type |
| --- | --- |
| `query` | `str` |
| `count` | `float` |

### `search_wikimedia`

Search Wikimedia Commons for CC-licensed images

| Parameter | Type |
| --- | --- |
| `query` | `str` |
| `limit` | `float` |

## Download

### `download_images`

Download a list of image URLs to a category directory with MD5 dedup

| Parameter | Type |
| --- | --- |
| `urls` | `str` |
| `output_dir` | `str` |
| `prefix` | `str` |

### `download_gallery`

Download images from a URL using gallery-dl (supports 80+ sites)

| Parameter | Type |
| --- | --- |
| `url` | `str` |
| `output_dir` | `str` |
| `prefix` | `str` |
| `min_size` | `float` |

## Browse

### `list_images`

List images with metadata (path, size, resolution, category)

| Parameter | Type |
| --- | --- |
| `directory` | `str` |

### `get_image_info`

Get detailed info for a single image

| Parameter | Type |
| --- | --- |
| `path` | `str` |

## Organize

### `move_images`

Move images between categories or to rejected/

| Parameter | Type |
| --- | --- |
| `paths` | `str` |
| `destination` | `str` |

### `organize_images`

Auto-sort images by filename prefix into category dirs

| Parameter | Type |
| --- | --- |
| `base_dir` | `str` |
| `config_path` | `str` |

## Quality & Curation

### `analyze_quality`

Analyze resolution distribution, file sizes, format stats

| Parameter | Type |
| --- | --- |
| `directory` | `str` |

### `find_duplicates`

Find perceptual hash (phash) duplicates in a directory

| Parameter | Type |
| --- | --- |
| `directory` | `str` |
| `threshold` | `float` |

### `detect_screenshots`

Find social media screenshots and text-only posts in a directory

| Parameter | Type |
| --- | --- |
| `directory` | `str` |
| `auto_reject` | `str` |

## Cropping

### `crop_center`

Center-crop images to square (good for logos, album covers)

| Parameter | Type |
| --- | --- |
| `source_dir` | `str` |
| `output_dir` | `str` |
| `resolution` | `float` |

### `crop_smart`

Smart-crop to the highest-entropy (most detailed) region

| Parameter | Type |
| --- | --- |
| `source_dir` | `str` |
| `output_dir` | `str` |
| `resolution` | `float` |

## Faces

### `detect_faces`

Detect faces in images and report bounding boxes

| Parameter | Type |
| --- | --- |
| `directory` | `str` |

### `crop_faces`

Crop images around detected faces for portrait training data

| Parameter | Type |
| --- | --- |
| `source_dir` | `str` |
| `output_dir` | `str` |
| `resolution` | `float` |
| `padding` | `float` |

## Training Prep

### `resize_images`

Batch resize images to training resolution

| Parameter | Type |
| --- | --- |
| `source_dir` | `str` |
| `output_dir` | `str` |
| `resolution` | `float` |

### `write_caption`

Write a .txt caption file alongside an image

| Parameter | Type |
| --- | --- |
| `image_path` | `str` |
| `caption` | `str` |

## Export

### `export_dataset`

Export dataset to ai-toolkit format (flat dir + training config)

| Parameter | Type |
| --- | --- |
| `config_path` | `str` |
| `output_dir` | `str` |
| `generate_config` | `str` |
| `platform` | `str` |
