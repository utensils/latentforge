---
layout: home

hero:
  name: "LatentForge"
  text: "Build LoRA datasets by chatting."
  tagline: Interactive CLI for curating high-quality image datasets for Flux fine-tuning — powered by the Claude Agent SDK.
  image:
    src: /logo.svg
    alt: LatentForge
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Architecture
      link: /guide/architecture
    - theme: alt
      text: View on GitHub
      link: https://github.com/utensils/latentforge

features:
  - icon: 🔥
    title: Chat, don't script
    details: Tell the agent what dataset you want. It searches, downloads, organizes, deduplicates, resizes, and captions — guided by natural language, not brittle pipelines.
  - icon: 🛠️
    title: 22 MCP tools
    details: Bing + Wikimedia search, gallery-dl for 80+ sites, perceptual-hash dedup, smart/face crops, screenshot detection, ai-toolkit export — all first-class tools the agent can call.
  - icon: 👁️
    title: Vision-aware curation
    details: The agent uses Claude's built-in vision to actually look at your images, flag low-quality ones, and help you curate down to a tight training set.
  - icon: ❄️
    title: Nix-native
    details: A single flake builds the full environment — Python, PIL, OpenCV, gallery-dl, CUDA on Linux. nix run and you're chatting in seconds.
  - icon: 📦
    title: Exports to ai-toolkit
    details: One command flattens the category tree, copies captions, and generates a platform-specific training YAML. Hand it straight to ai-toolkit or kohya-ss.
  - icon: 🧠
    title: Long sessions handled
    details: Automatic context compaction at 75% — the agent summarizes itself, restarts fresh, and keeps curating. Multi-hour dataset builds without losing state.
---

## Quick start

```bash
# With Nix (builds the full env, no local Python setup)
nix run github:utensils/latentforge

# With uv (no install)
uvx latentforge

# Or install globally
uv tool install latentforge
latentforge
```

Then:

```
> I want a dataset for Studio Ghibli art styles

  [tool: create_config]
  Created config: configs/ghibli.yaml with 5 categories

> Search for movie poster art and download them

  [tool: search_bing]
  Found 18 image URLs for 'Studio Ghibli movie poster art'
  [tool: download_images]
  Download complete: 15 saved, 2 skipped (dup), 1 failed
```

Head over to [**Getting Started**](/guide/getting-started) for the full walkthrough, or dive into the [**Tools Reference**](/api/tools) to see every capability the agent has.
