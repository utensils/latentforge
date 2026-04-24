---
title: Tools Reference
description: Auto-generated reference for all MCP tools exposed by the LatentForge agent.
---

# Tools Reference

The LatentForge agent exposes its dataset-building capabilities through custom [Model Context Protocol](https://modelcontextprotocol.io) tools. Each tool below is defined in [`src/latentforge/tools.py`](https://github.com/utensils/latentforge/blob/main/src/latentforge/tools.py) with the `@tool` decorator and is registered on an in-process MCP server at startup.

::: tip Auto-generated
This page is regenerated from the source code by `pnpm run docs:gen`. Edit `src/latentforge/tools.py` (not this file) to change tool behavior or descriptions.
:::

**22 tools** across **7 categories**.

## Overview

| Category | Tools |
| --- | --- |
| Config Management | [`create_config`](#create-config), [`read_config`](#read-config), [`update_config`](#update-config), [`list_configs`](#list-configs) |
| Search & Download | [`search_bing`](#search-bing), [`search_wikimedia`](#search-wikimedia), [`download_images`](#download-images), [`download_gallery`](#download-gallery) |
| Dataset Browsing | [`list_images`](#list-images), [`get_image_info`](#get-image-info) |
| Dataset Organization | [`move_images`](#move-images), [`organize_images`](#organize-images) |
| Quality & Curation | [`analyze_quality`](#analyze-quality), [`find_duplicates`](#find-duplicates), [`resize_images`](#resize-images), [`write_caption`](#write-caption), [`detect_screenshots`](#detect-screenshots) |
| Cropping & Face Detection | [`crop_center`](#crop-center), [`crop_smart`](#crop-smart), [`detect_faces`](#detect-faces), [`crop_faces`](#crop-faces) |
| Export | [`export_dataset`](#export-dataset) |

## Config Management

### `create_config`

Create a new dataset YAML config file.

**Parameters**

| Name | Type |
| --- | --- |
| `name` | `str` |
| `subject` | `str` |
| `trigger_word` | `str` |
| `output_dir` | `str` |
| `categories` | `str` |

### `read_config`

Load and return a dataset YAML config.

**Parameters**

| Name | Type |
| --- | --- |
| `path` | `str` |

### `update_config`

Update fields in a dataset YAML config.

**Parameters**

| Name | Type |
| --- | --- |
| `path` | `str` |
| `updates` | `str` |

### `list_configs`

List available dataset configs in configs/.

_No parameters._

## Search & Download

### `search_bing`

Search Bing Images and return URLs.

**Parameters**

| Name | Type |
| --- | --- |
| `query` | `str` |
| `count` | `float` |

### `search_wikimedia`

Search Wikimedia Commons for CC-licensed images.

**Parameters**

| Name | Type |
| --- | --- |
| `query` | `str` |
| `limit` | `float` |

### `download_images`

Download a list of image URLs to a category directory with MD5 dedup.

**Parameters**

| Name | Type |
| --- | --- |
| `urls` | `str` |
| `output_dir` | `str` |
| `prefix` | `str` |

### `download_gallery`

Download images from a URL using gallery-dl (supports 80+ sites).

**Parameters**

| Name | Type |
| --- | --- |
| `url` | `str` |
| `output_dir` | `str` |
| `prefix` | `str` |
| `min_size` | `float` |

## Dataset Browsing

### `list_images`

List images with metadata (path, size, resolution, category).

**Parameters**

| Name | Type |
| --- | --- |
| `directory` | `str` |

### `get_image_info`

Get detailed info for a single image.

**Parameters**

| Name | Type |
| --- | --- |
| `path` | `str` |

## Dataset Organization

### `move_images`

Move images between categories or to rejected/.

**Parameters**

| Name | Type |
| --- | --- |
| `paths` | `str` |
| `destination` | `str` |

### `organize_images`

Auto-sort images by filename prefix into category dirs.

**Parameters**

| Name | Type |
| --- | --- |
| `base_dir` | `str` |
| `config_path` | `str` |

## Quality & Curation

### `analyze_quality`

Analyze resolution distribution, file sizes, format stats.

**Parameters**

| Name | Type |
| --- | --- |
| `directory` | `str` |

### `find_duplicates`

Find perceptual hash (phash) duplicates in a directory.

**Parameters**

| Name | Type |
| --- | --- |
| `directory` | `str` |
| `threshold` | `float` |

### `resize_images`

Batch resize images to training resolution.

**Parameters**

| Name | Type |
| --- | --- |
| `source_dir` | `str` |
| `output_dir` | `str` |
| `resolution` | `float` |

### `write_caption`

Write a .txt caption file alongside an image.

**Parameters**

| Name | Type |
| --- | --- |
| `image_path` | `str` |
| `caption` | `str` |

### `detect_screenshots`

Find social media screenshots and text-only posts in a directory.

**Parameters**

| Name | Type |
| --- | --- |
| `directory` | `str` |
| `auto_reject` | `str` |

## Cropping & Face Detection

### `crop_center`

Center-crop images to square (good for logos, album covers).

**Parameters**

| Name | Type |
| --- | --- |
| `source_dir` | `str` |
| `output_dir` | `str` |
| `resolution` | `float` |

### `crop_smart`

Smart-crop to the highest-entropy (most detailed) region.

**Parameters**

| Name | Type |
| --- | --- |
| `source_dir` | `str` |
| `output_dir` | `str` |
| `resolution` | `float` |

### `detect_faces`

Detect faces in images and report bounding boxes.

**Parameters**

| Name | Type |
| --- | --- |
| `directory` | `str` |

### `crop_faces`

Crop images around detected faces for portrait training data.

**Parameters**

| Name | Type |
| --- | --- |
| `source_dir` | `str` |
| `output_dir` | `str` |
| `resolution` | `float` |
| `padding` | `float` |

## Export

### `export_dataset`

Export dataset to ai-toolkit format (flat dir + training config).

**Parameters**

| Name | Type |
| --- | --- |
| `config_path` | `str` |
| `output_dir` | `str` |
| `generate_config` | `str` |
| `platform` | `str` |
