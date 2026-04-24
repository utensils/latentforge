---
layout: home

hero:
  name: LatentForge
  text: LoRA dataset agent
  tagline: Interactive image dataset collection and curation tool for LoRA training, powered by the Claude Agent SDK.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Tools Reference
      link: /tools/reference
    - theme: alt
      text: View on GitHub
      link: https://github.com/utensils/latentforge

features:
  - title: Claude Agent SDK
    details: Chat-driven workflow. Describe the dataset you want; the agent searches, downloads, curates, and exports it through natural-language conversation.
  - title: 22 custom MCP tools
    details: Purpose-built tools for every workflow stage — config, search, download, organize, curate, crop, resize, caption, and export.
  - title: Multi-source image search
    details: Pull from Bing Images, Wikimedia Commons (CC-licensed), and 80+ gallery sites via gallery-dl — DeviantArt, ArtStation, Pinterest, Reddit, Flickr, and more.
  - title: Perceptual deduplication
    details: MD5 hashing on download for exact duplicates, perceptual hash (phash) similarity search for near-duplicates and reposts.
  - title: Vision-powered curation
    details: The agent reads images directly to reject off-topic, low-quality, watermarked, screenshot, and text-only content.
  - title: ai-toolkit export
    details: Auto-detects your ai-toolkit install, generates a platform-specific training YAML (MPS on macOS, CUDA on Linux), and writes default captions with your trigger word.
---

## Example Session

```text
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

See the [Getting Started guide](/guide/getting-started) for a full walk-through, or jump to the [MCP tools reference](/tools/reference).
