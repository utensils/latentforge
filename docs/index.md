---
layout: home

hero:
  name: LatentForge
  text: Build LoRA training datasets by chatting with an agent.
  tagline: >-
    An interactive CLI powered by the Claude Agent SDK. Tell it what you want —
    it searches, downloads, curates, deduplicates, resizes, and captions images
    end-to-end.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: MCP Tools Reference
      link: /reference/tools
    - theme: alt
      text: View on GitHub
      link: https://github.com/utensils/latentforge

features:
  - icon: 🤖
    title: Claude Agent SDK
    details: >-
      Built on the official Claude Agent SDK. The agent has built-in vision,
      Read/Write/Bash tools, and a fully custom MCP server exposing 22 dataset
      tools.
  - icon: 🧰
    title: 22 MCP Tools
    details: >-
      Config management, Bing & Wikimedia search, MD5-dedup downloads,
      gallery-dl for 80+ sites, screenshot rejection, perceptual-hash duplicate
      detection, smart cropping, face cropping, and ai-toolkit export.
  - icon: 👁️
    title: Vision-Based Curation
    details: >-
      The agent opens images with the built-in Read tool, examines them
      directly, and helps you reject off-topic, watermarked, or low-quality
      frames before training.
  - icon: 🌐
    title: 80+ Gallery Sources
    details: >-
      gallery-dl is wired in, so you can drop a DeviantArt, ArtStation,
      Pinterest, Tumblr, Reddit, or Flickr URL and let the agent pull images
      with dedup in a single step.
  - icon: 📦
    title: ai-toolkit Export
    details: >-
      One command exports a flat image + caption directory plus a
      ready-to-train Flux LoRA YAML — auto-tuned for macOS (MPS) or Linux
      (CUDA).
  - icon: ❄️
    title: Nix-First Dev Shell
    details: >-
      Everything is reproducible. `nix develop` drops you into a shell with the
      app, ruff, pyright, gallery-dl, Node, pnpm, and helpers like `docs-dev`
      already on PATH.
---

<style>
.VPHero .name,
.VPHero .text {
  max-width: 100%;
}
</style>
