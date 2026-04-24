# Workflow

The typical end-to-end pipeline for going from _"I want to train a LoRA on X"_
to a ready-to-train dataset is nine steps. Every step is driven by a natural
language message to the agent; the tool calls shown are what the agent
dispatches under the hood.

## 1. Configure

Describe what you want. The agent creates a YAML config.

```
> I want a dataset of Studio Ghibli art — posters, backgrounds, characters

  ▸ create_config
  Created configs/ghibli.yaml
```

See the [config reference](/guide/configs) for hand-editing.

## 2. Collect

Search and download from Bing Images (default) or any of gallery-dl's 80+
sources (DeviantArt, ArtStation, Pinterest, Tumblr, Reddit, Flickr, and more).

```
> Search Bing for the poster queries and download them

  ▸ search_bing
  Found 18 image URLs for 'Studio Ghibli movie poster art'
  ▸ download_images
  Download complete: 15 saved, 2 skipped (dup), 1 failed
```

Downloads are **MD5-deduped** at the file level — you can re-run safely. The
downloader also runs a **screenshot filter** that rejects phone-shaped
low-entropy text images before they ever land on disk.

## 3. Organize

If images were all dumped into a single directory, let the agent sort them
into category subfolders based on their filename prefix:

```
> Organize the downloaded images into category folders

  ▸ organize_images
  posters        15 images
  backgrounds     8 images
  TOTAL          23 images
```

## 4. Curate

The agent opens images with its built-in vision tool and helps you flag
anything off-topic, watermarked, or low-quality.

```
> Look at posters/ and reject anything that's not a movie poster

  ▸ list_images
  ▸ Read posters/studio_ghibli_movie_poster_a1b2c3d4e5f6.jpg
  ...
  ▸ move_images
  Moved 3 off-topic images to datasets/ghibli/rejected/
```

You can also explicitly scan for screenshots that slipped through:

```
> Run detect_screenshots on posters/ with auto_reject
```

## 5. Deduplicate

Perceptual-hash near-duplicates (rescales, crops, minor edits):

```
> Find duplicates in the posters folder

  ▸ find_duplicates
  Found 2 duplicate pairs (threshold=8)
```

## 6. Resize

Standardise to the training resolution (default 1024²):

```
> Resize everything in posters/ to 1024x1024

  ▸ resize_images
  Resized 12 images to 1024x1024
```

For portrait/face datasets, prefer `crop_faces`; for logos and symmetric
compositions, `crop_center`; for landscapes, `crop_smart` (picks the
highest-entropy region).

## 7. Caption

Either write captions by hand with `write_caption`, or let
`export_dataset` auto-generate them from the trigger word + category
description:

```
> Write captions for the posters

  ▸ write_caption   (one per image)
```

## 8. Export

Bundle a flat directory of image + caption pairs and generate a ready-to-train
ai-toolkit YAML config:

```
> /export

  Exporting to ai-toolkit format...
  Exported 12 images to ai-toolkit format
    Output: ~/.local/share/ai-toolkit/datasets/ghibli
    Training config: ~/.local/share/ai-toolkit/config/ghibli_lora.yaml
```

The training config is auto-tuned:

- **macOS** → MPS device, `adamw`, float32, resolutions `[512, 768]`
- **Linux** → CUDA device, `adamw8bit`, bf16, resolutions `[512, 768, 1024]`,
  model quantization enabled

## 9. Train

Point your trainer of choice at the export directory:

- [ai-toolkit](https://github.com/ostris/ai-toolkit) — config is already
  generated for you
- [kohya-ss/sd-scripts](https://github.com/kohya-ss/sd-scripts)
- Any Flux LoRA trainer that accepts flat `image + caption.txt` datasets
