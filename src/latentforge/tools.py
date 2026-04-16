"""Custom MCP tools for LatentForge."""

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

import requests
import yaml
from bs4 import BeautifulSoup
from claude_agent_sdk import tool
from PIL import Image

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}
COMMONS_HEADERS = {"User-Agent": "LatentForge/1.0 (dataset collection)"}
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def _is_screenshot(img: Image.Image, data_bytes: bytes | None = None) -> tuple[bool, str]:
    """Detect if an image is likely a social media screenshot or text-only post.

    Returns (is_screenshot, reason).
    """
    w, h = img.size

    # Check for very low entropy (text on solid background)
    try:
        entropy = img.convert("RGB").entropy()
    except Exception:
        entropy = 99.0

    # Pure text screenshots typically have entropy < 4.0
    # Photos/artwork are usually 6.0+
    if entropy < 3.5:
        return True, f"very low entropy ({entropy:.1f}) — likely text on solid background"

    # Check for dominant solid background (>70% of pixels near-white or near-black)
    try:
        rgb = img.convert("RGB")
        pixels = list(rgb.getdata())
        total = len(pixels)
        near_white = sum(1 for r, g, b in pixels if r > 240 and g > 240 and b > 240)
        near_black = sum(1 for r, g, b in pixels if r < 15 and g < 15 and b < 15)
        bg_ratio = max(near_white, near_black) / total
        if bg_ratio > 0.70 and entropy < 5.0:
            return True, f"solid background ({bg_ratio:.0%}) with low entropy ({entropy:.1f})"
    except Exception:
        pass

    # Check for phone screenshot aspect ratios with UI chrome indicators
    # (very tall images with low entropy are almost always screenshots)
    aspect = w / h if h > 0 else 1.0
    if aspect < 0.6 and entropy < 5.5 and h > 1000:
        return True, f"phone-shaped ({w}x{h}, ratio {aspect:.2f}) with low entropy ({entropy:.1f})"

    return False, ""


def _text(msg: str) -> dict[str, Any]:
    """Helper to build a text content response."""
    return {"content": [{"type": "text", "text": msg}]}


def _error(msg: str) -> dict[str, Any]:
    """Helper to build an error response."""
    return {"content": [{"type": "text", "text": f"Error: {msg}"}], "is_error": True}


# ─── Config Management ────────────────────────────────────────────────────────


@tool(
    "create_config",
    "Create a new dataset YAML config file",
    {
        "name": str,
        "subject": str,
        "trigger_word": str,
        "output_dir": str,
        "categories": str,
    },
)
async def create_config(args: dict[str, Any]) -> dict[str, Any]:
    config_dir = Path("configs")
    config_dir.mkdir(exist_ok=True)
    path = config_dir / f"{args['name']}.yaml"
    if path.exists():
        return _error(f"Config {path} already exists. Use update_config to modify it.")

    # Parse categories as JSON dict
    try:
        categories = json.loads(args["categories"])
    except (json.JSONDecodeError, TypeError):
        return _error('categories must be a JSON object, e.g. \'{"logos": "Band logos"}\'')

    config = {
        "name": args["name"],
        "subject": args["subject"],
        "trigger_word": args["trigger_word"],
        "output_dir": args["output_dir"],
        "search_queries": {cat: [] for cat in categories},
        "categories": categories,
        "curation": {
            "target_count": "50-150",
            "min_resolution": 512,
            "training_resolution": 1024,
        },
    }
    path.write_text(yaml.dump(config, default_flow_style=False, sort_keys=False))
    return _text(
        f"Created config: {path}\n\n{yaml.dump(config, default_flow_style=False, sort_keys=False)}"
    )


@tool("read_config", "Load and return a dataset YAML config", {"path": str})
async def read_config(args: dict[str, Any]) -> dict[str, Any]:
    path = Path(args["path"])
    if not path.exists():
        return _error(f"Config not found: {path}")
    config = yaml.safe_load(path.read_text())
    return _text(yaml.dump(config, default_flow_style=False, sort_keys=False))


@tool(
    "update_config",
    "Update fields in a dataset YAML config",
    {
        "path": str,
        "updates": str,
    },
)
async def update_config(args: dict[str, Any]) -> dict[str, Any]:
    path = Path(args["path"])
    if not path.exists():
        return _error(f"Config not found: {path}")
    config = yaml.safe_load(path.read_text())
    try:
        updates = json.loads(args["updates"])
    except (json.JSONDecodeError, TypeError):
        return _error("updates must be a JSON object")

    def deep_merge(base, updates):
        for k, v in updates.items():
            if isinstance(v, dict) and isinstance(base.get(k), dict):
                deep_merge(base[k], v)
            else:
                base[k] = v

    deep_merge(config, updates)
    path.write_text(yaml.dump(config, default_flow_style=False, sort_keys=False))
    return _text(
        f"Updated {path}:\n\n{yaml.dump(config, default_flow_style=False, sort_keys=False)}"
    )


@tool("list_configs", "List available dataset configs in configs/", {})
async def list_configs(args: dict[str, Any]) -> dict[str, Any]:
    config_dir = Path("configs")
    if not config_dir.exists():
        return _text("No configs/ directory found.")
    configs = sorted(config_dir.glob("*.yaml"))
    if not configs:
        return _text("No config files found in configs/")
    lines = []
    for p in configs:
        cfg = yaml.safe_load(p.read_text())
        name = cfg.get("name", p.stem)
        subject = cfg.get("subject", "unknown")
        lines.append(f"  {p} — {name}: {subject}")
    return _text("Available configs:\n" + "\n".join(lines))


# ─── Image Acquisition ────────────────────────────────────────────────────────


@tool(
    "search_bing",
    "Search Bing Images and return URLs",
    {
        "query": str,
        "count": float,
    },
)
async def search_bing(args: dict[str, Any]) -> dict[str, Any]:
    query = args["query"]
    count = int(args.get("count", 20))
    search_url = (
        f"https://www.bing.com/images/search?"
        f"q={quote_plus(query)}&first=1&count={count}"
        f"&qft=+filterui:imagesize-large"
    )
    urls = []
    try:
        resp = requests.get(search_url, headers=HEADERS, timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")
        for a in soup.find_all("a", {"class": "iusc"}):
            m = a.get("m")
            if m:
                data = json.loads(m)
                if "murl" in data:
                    urls.append(data["murl"])
        if not urls:
            for img in soup.find_all("img"):
                src = img.get("src", "")
                if src.startswith("http") and "bing" not in src:
                    urls.append(src)
    except Exception as e:
        return _error(f"Bing search failed: {e}")
    urls = urls[:count]
    return _text(f"Found {len(urls)} image URLs for '{query}':\n" + "\n".join(urls))


@tool(
    "search_wikimedia",
    "Search Wikimedia Commons for CC-licensed images",
    {
        "query": str,
        "limit": float,
    },
)
async def search_wikimedia(args: dict[str, Any]) -> dict[str, Any]:
    query = args["query"]
    limit = int(args.get("limit", 50))
    params = {
        "action": "query",
        "list": "search",
        "srsearch": query,
        "srnamespace": 6,
        "srlimit": limit,
        "format": "json",
    }
    try:
        resp = requests.get(COMMONS_API, params=params, headers=COMMONS_HEADERS, timeout=15)
        titles = [r["title"] for r in resp.json().get("query", {}).get("search", [])]
    except Exception as e:
        return _error(f"Wikimedia search failed: {e}")

    results = []
    for i in range(0, len(titles), 20):
        batch = titles[i : i + 20]
        params = {
            "action": "query",
            "titles": "|".join(batch),
            "prop": "imageinfo",
            "iiprop": "url|size|mime",
            "format": "json",
        }
        try:
            resp = requests.get(COMMONS_API, params=params, headers=COMMONS_HEADERS, timeout=15)
            pages = resp.json().get("query", {}).get("pages", {})
            for page in pages.values():
                info = page.get("imageinfo", [{}])[0]
                url = info.get("url", "")
                mime = info.get("mime", "")
                w, h = info.get("width", 0), info.get("height", 0)
                if url and any(t in mime for t in ["jpeg", "png"]) and w >= 400 and h >= 400:
                    results.append({"url": url, "width": w, "height": h})
        except Exception:
            continue
        time.sleep(0.5)

    lines = [f"Found {len(results)} images for '{query}':"]
    for r in results:
        lines.append(f"  {r['width']}x{r['height']} — {r['url']}")
    return _text("\n".join(lines))


@tool(
    "download_images",
    "Download a list of image URLs to a category directory with MD5 dedup",
    {
        "urls": str,
        "output_dir": str,
        "prefix": str,
    },
)
async def download_images(args: dict[str, Any]) -> dict[str, Any]:
    try:
        urls = json.loads(args["urls"])
    except (json.JSONDecodeError, TypeError):
        urls = [u.strip() for u in args["urls"].split("\n") if u.strip()]

    output_dir = Path(args["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    prefix = args.get("prefix", "img")

    downloaded, skipped, failed, screenshots = 0, 0, 0, 0
    for url in urls:
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15, stream=True)
            if resp.status_code != 200:
                failed += 1
                continue

            data = resp.content
            if len(data) < 10000:
                skipped += 1
                continue

            file_hash = hashlib.md5(data).hexdigest()[:12]
            existing = list(output_dir.glob(f"*{file_hash}*"))
            if existing:
                skipped += 1
                continue

            # Screenshot/text-post detection
            try:
                with Image.open(BytesIO(data)) as im:
                    is_ss, _ = _is_screenshot(im, data)
                    if is_ss:
                        screenshots += 1
                        continue
            except Exception:
                pass

            content_type = resp.headers.get("content-type", "")
            ext = ".jpg"
            if "png" in content_type or url.lower().endswith(".png"):
                ext = ".png"
            elif "webp" in content_type or url.lower().endswith(".webp"):
                ext = ".webp"

            filename = f"{prefix}_{file_hash}{ext}"
            (output_dir / filename).write_bytes(data)
            downloaded += 1
        except Exception:
            failed += 1

    parts = [
        f"Download complete: {downloaded} saved, {skipped} skipped (dup/small), {failed} failed"
    ]
    if screenshots:
        parts[0] += f", {screenshots} rejected (screenshot/text)"
    parts.append(f"Directory: {output_dir}")
    return _text("\n".join(parts))


@tool(
    "download_gallery",
    "Download images from a URL using gallery-dl (supports 80+ sites)",
    {
        "url": str,
        "output_dir": str,
        "prefix": str,
        "min_size": float,
    },
)
async def download_gallery(args: dict[str, Any]) -> dict[str, Any]:
    url = args["url"]
    output_dir = Path(args["output_dir"])
    prefix = args.get("prefix", "gdl")
    min_size = int(args.get("min_size", 10000))

    if not shutil.which("gallery-dl"):
        return _error("gallery-dl not found. Install it or enter the nix devshell.")

    output_dir.mkdir(parents=True, exist_ok=True)

    # Download to a temp dir first, then dedup into output
    tmp = output_dir / ".gdl_tmp"
    tmp.mkdir(exist_ok=True)

    try:
        result = subprocess.run(
            ["gallery-dl", "--dest", str(tmp), "--no-mtime", url],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return _error("gallery-dl timed out after 120s")
    except Exception as e:
        return _error(f"gallery-dl failed: {e}")

    # Collect downloaded images, dedup via MD5, move to output
    downloaded, skipped, small, screenshots = 0, 0, 0, 0
    for f in tmp.rglob("*"):
        if not f.is_file() or f.suffix.lower() not in IMAGE_EXTS:
            continue
        data = f.read_bytes()
        if len(data) < min_size:
            small += 1
            f.unlink()
            continue
        file_hash = hashlib.md5(data).hexdigest()[:12]
        existing = list(output_dir.glob(f"*{file_hash}*"))
        if existing:
            skipped += 1
            f.unlink()
            continue
        # Screenshot/text-post detection
        try:
            with Image.open(f) as im:
                is_ss, _ = _is_screenshot(im)
                if is_ss:
                    screenshots += 1
                    f.unlink()
                    continue
        except Exception:
            pass
        ext = f.suffix.lower()
        filename = f"{prefix}_{file_hash}{ext}"
        f.rename(output_dir / filename)
        downloaded += 1

    # Clean up temp dir
    shutil.rmtree(tmp, ignore_errors=True)

    stderr_msg = ""
    if result.stderr:
        # Extract just the last few lines of stderr for useful info
        lines = result.stderr.strip().splitlines()[-3:]
        stderr_msg = "\n" + "\n".join(lines)

    parts = [f"gallery-dl: {downloaded} saved, {skipped} skipped (dup), {small} skipped (small)"]
    if screenshots:
        parts[0] += f", {screenshots} rejected (screenshot/text)"
    parts[0] += stderr_msg
    parts.append(f"Directory: {output_dir}")
    return _text("\n".join(parts))


# ─── Dataset Management ──────────────────────────────────────────────────────


@tool(
    "list_images",
    "List images with metadata (path, size, resolution, category)",
    {
        "directory": str,
    },
)
async def list_images(args: dict[str, Any]) -> dict[str, Any]:
    directory = Path(args["directory"])
    if not directory.exists():
        return _error(f"Directory not found: {directory}")

    images = []
    for ext in IMAGE_EXTS:
        images.extend(directory.rglob(f"*{ext}"))
    images.sort()

    if not images:
        return _text(f"No images found in {directory}")

    lines = [f"Found {len(images)} images in {directory}:\n"]
    for img_path in images:
        size_kb = img_path.stat().st_size / 1024
        try:
            with Image.open(img_path) as im:
                w, h = im.size
            lines.append(f"  {img_path.relative_to(directory)}  {w}x{h}  {size_kb:.0f}KB")
        except Exception:
            lines.append(f"  {img_path.relative_to(directory)}  ??x??  {size_kb:.0f}KB")

    return _text("\n".join(lines))


@tool("get_image_info", "Get detailed info for a single image", {"path": str})
async def get_image_info(args: dict[str, Any]) -> dict[str, Any]:
    path = Path(args["path"])
    if not path.exists():
        return _error(f"Image not found: {path}")

    stat = path.stat()
    info = {
        "path": str(path),
        "size_bytes": stat.st_size,
        "size_kb": f"{stat.st_size / 1024:.1f}",
    }

    try:
        with Image.open(path) as im:
            info["width"] = im.size[0]
            info["height"] = im.size[1]
            info["format"] = im.format
            info["mode"] = im.mode
    except Exception as e:
        info["error"] = f"Could not read image: {e}"

    # Check for caption file
    caption_path = path.with_suffix(".txt")
    if caption_path.exists():
        info["caption"] = caption_path.read_text().strip()

    return _text(json.dumps(info, indent=2))


@tool(
    "move_images",
    "Move images between categories or to rejected/",
    {
        "paths": str,
        "destination": str,
    },
)
async def move_images(args: dict[str, Any]) -> dict[str, Any]:
    try:
        paths = json.loads(args["paths"])
    except (json.JSONDecodeError, TypeError):
        paths = [p.strip() for p in args["paths"].split("\n") if p.strip()]

    dest = Path(args["destination"])
    dest.mkdir(parents=True, exist_ok=True)

    moved, errors = 0, 0
    for p in paths:
        src = Path(p)
        if not src.exists():
            errors += 1
            continue
        target = dest / src.name
        src.rename(target)
        # Move caption file too if it exists
        caption = src.with_suffix(".txt")
        if caption.exists():
            caption.rename(dest / caption.name)
        moved += 1

    return _text(f"Moved {moved} images to {dest} ({errors} errors)")


@tool(
    "organize_images",
    "Auto-sort images by filename prefix into category dirs",
    {
        "base_dir": str,
        "config_path": str,
    },
)
async def organize_images(args: dict[str, Any]) -> dict[str, Any]:
    base = Path(args["base_dir"])
    config_path = Path(args["config_path"])

    if not config_path.exists():
        return _error(f"Config not found: {config_path}")

    config = yaml.safe_load(config_path.read_text())
    categories = config.get("categories", {})

    # Build prefix-to-category mapping from search queries
    prefix_map = {}
    for cat, queries in config.get("search_queries", {}).items():
        for q in queries:
            prefix = re.sub(r"[^a-z0-9]+", "_", q.lower())[:40].strip("_")
            prefix_map[prefix] = cat
    for wq in config.get("wikimedia_queries", []):
        prefix_map[wq["prefix"]] = "band_photos"

    # Create category dirs
    for cat in categories:
        (base / cat).mkdir(exist_ok=True)

    moved = {}
    for img in sorted(base.glob("*")):
        if img.is_dir() or img.suffix.lower() not in IMAGE_EXTS:
            continue
        name = img.stem
        target_cat = "uncategorized"
        for prefix, cat in prefix_map.items():
            if name.startswith(prefix):
                target_cat = cat
                break

        (base / target_cat).mkdir(exist_ok=True)
        img.rename(base / target_cat / img.name)
        moved.setdefault(target_cat, 0)
        moved[target_cat] += 1

    lines = ["Organization complete:\n"]
    total = 0
    for cat in sorted(moved):
        lines.append(f"  {cat:20s} {moved[cat]:4d} images")
        total += moved[cat]
    lines.append(f"  {'─' * 30}")
    lines.append(f"  {'TOTAL':20s} {total:4d} images")
    return _text("\n".join(lines))


# ─── Quality & Curation ──────────────────────────────────────────────────────


@tool(
    "analyze_quality",
    "Analyze resolution distribution, file sizes, format stats",
    {
        "directory": str,
    },
)
async def analyze_quality(args: dict[str, Any]) -> dict[str, Any]:
    directory = Path(args["directory"])
    if not directory.exists():
        return _error(f"Directory not found: {directory}")

    images = []
    for ext in IMAGE_EXTS:
        images.extend(directory.rglob(f"*{ext}"))

    if not images:
        return _text(f"No images found in {directory}")

    stats = {
        "total": len(images),
        "formats": {},
        "size_buckets": {
            "excellent_500kb+": 0,
            "good_100_500kb": 0,
            "ok_50_100kb": 0,
            "small_10_50kb": 0,
            "tiny_under_10kb": 0,
        },
        "resolution_buckets": {"1024+": 0, "512_1024": 0, "256_512": 0, "under_256": 0},
        "total_size_mb": 0,
    }
    widths, heights = [], []

    for img_path in images:
        size = img_path.stat().st_size
        stats["total_size_mb"] += size
        ext = img_path.suffix.lower()
        stats["formats"][ext] = stats["formats"].get(ext, 0) + 1

        size_kb = size / 1024
        if size_kb >= 500:
            stats["size_buckets"]["excellent_500kb+"] += 1
        elif size_kb >= 100:
            stats["size_buckets"]["good_100_500kb"] += 1
        elif size_kb >= 50:
            stats["size_buckets"]["ok_50_100kb"] += 1
        elif size_kb >= 10:
            stats["size_buckets"]["small_10_50kb"] += 1
        else:
            stats["size_buckets"]["tiny_under_10kb"] += 1

        try:
            with Image.open(img_path) as im:
                w, h = im.size
                widths.append(w)
                heights.append(h)
                min_dim = min(w, h)
                if min_dim >= 1024:
                    stats["resolution_buckets"]["1024+"] += 1
                elif min_dim >= 512:
                    stats["resolution_buckets"]["512_1024"] += 1
                elif min_dim >= 256:
                    stats["resolution_buckets"]["256_512"] += 1
                else:
                    stats["resolution_buckets"]["under_256"] += 1
        except Exception:
            pass

    stats["total_size_mb"] = f"{stats['total_size_mb'] / (1024 * 1024):.1f}"
    if widths:
        stats["avg_width"] = int(sum(widths) / len(widths))
        stats["avg_height"] = int(sum(heights) / len(heights))
        stats["min_resolution"] = f"{min(widths)}x{min(heights)}"
        stats["max_resolution"] = f"{max(widths)}x{max(heights)}"

    return _text(json.dumps(stats, indent=2))


@tool(
    "find_duplicates",
    "Find perceptual hash (phash) duplicates in a directory",
    {
        "directory": str,
        "threshold": float,
    },
)
async def find_duplicates(args: dict[str, Any]) -> dict[str, Any]:
    directory = Path(args["directory"])
    threshold = int(args.get("threshold", 8))

    if not directory.exists():
        return _error(f"Directory not found: {directory}")

    try:
        import imagehash
    except ImportError:
        return _error("imagehash package not installed.")

    images = []
    for ext in IMAGE_EXTS:
        images.extend(directory.rglob(f"*{ext}"))

    hashes = []
    for img_path in images:
        try:
            with Image.open(img_path) as im:
                h = imagehash.phash(im)
                hashes.append((img_path, h))
        except Exception:
            continue

    duplicates = []
    for i in range(len(hashes)):
        for j in range(i + 1, len(hashes)):
            diff = hashes[i][1] - hashes[j][1]
            if diff <= threshold:
                duplicates.append(
                    {
                        "file1": str(hashes[i][0]),
                        "file2": str(hashes[j][0]),
                        "distance": diff,
                    }
                )

    if not duplicates:
        return _text(f"No duplicates found (threshold={threshold}) among {len(hashes)} images.")

    lines = [f"Found {len(duplicates)} duplicate pairs (threshold={threshold}):\n"]
    for d in duplicates:
        lines.append(f"  distance={d['distance']}: {d['file1']} <-> {d['file2']}")
    return _text("\n".join(lines))


@tool(
    "resize_images",
    "Batch resize images to training resolution",
    {
        "source_dir": str,
        "output_dir": str,
        "resolution": float,
    },
)
async def resize_images(args: dict[str, Any]) -> dict[str, Any]:
    source = Path(args["source_dir"])
    output = Path(args["output_dir"])
    resolution = int(args.get("resolution", 1024))

    if not source.exists():
        return _error(f"Source directory not found: {source}")

    output.mkdir(parents=True, exist_ok=True)

    images = []
    for ext in IMAGE_EXTS:
        images.extend(source.rglob(f"*{ext}"))

    resized, skipped, errors = 0, 0, 0
    for img_path in images:
        out_name = f"{img_path.parent.name}_{img_path.stem}.png"
        out_path = output / out_name
        if out_path.exists():
            skipped += 1
            continue
        try:
            with Image.open(img_path) as im:
                im = im.convert("RGB")
                im = im.resize((resolution, resolution), Image.LANCZOS)
                im.save(out_path, "PNG")
                resized += 1
        except Exception:
            errors += 1

    return _text(
        f"Resized {resized} images to {resolution}x{resolution} in {output}\n"
        f"Skipped {skipped} (already exist), {errors} errors"
    )


@tool(
    "write_caption",
    "Write a .txt caption file alongside an image",
    {
        "image_path": str,
        "caption": str,
    },
)
async def write_caption(args: dict[str, Any]) -> dict[str, Any]:
    img_path = Path(args["image_path"])
    if not img_path.exists():
        return _error(f"Image not found: {img_path}")

    caption_path = img_path.with_suffix(".txt")
    caption_path.write_text(args["caption"])
    return _text(f"Wrote caption to {caption_path}:\n{args['caption']}")


@tool(
    "validate_dataset",
    "Check dataset health: missing/empty captions, low-res images, orphaned files",
    {
        "directory": str,
        "config_path": str,
        "min_resolution": float,
    },
)
async def validate_dataset(args: dict[str, Any]) -> dict[str, Any]:
    directory = Path(args["directory"])
    if not directory.exists():
        return _error(f"Directory not found: {directory}")

    # Resolve min_resolution: explicit arg > config > default 512
    min_res = int(args.get("min_resolution", 0))
    config_path = args.get("config_path", "")
    if not min_res and config_path:
        cp = Path(config_path)
        if cp.exists():
            config = yaml.safe_load(cp.read_text())
            min_res = config.get("curation", {}).get("min_resolution", 512)
    if not min_res:
        min_res = 512

    # Collect all images and caption files
    images: list[Path] = []
    for ext in IMAGE_EXTS:
        images.extend(directory.rglob(f"*{ext}"))
    images.sort()

    caption_files: set[Path] = set()
    for txt in directory.rglob("*.txt"):
        caption_files.add(txt)

    if not images and not caption_files:
        return _text(f"No images or caption files found in {directory}")

    # Build set of image stems (relative to directory) for orphan detection
    image_stems: set[Path] = set()
    for img in images:
        image_stems.add(img.with_suffix(".txt"))

    # Analyze
    total_size = 0
    missing_captions: list[str] = []
    empty_captions: list[str] = []
    low_res: list[str] = []
    unreadable: list[str] = []

    for img_path in images:
        total_size += img_path.stat().st_size
        caption_path = img_path.with_suffix(".txt")

        # Caption checks
        if caption_path not in caption_files:
            missing_captions.append(str(img_path.relative_to(directory)))
        elif caption_path.read_text().strip() == "":
            empty_captions.append(str(img_path.relative_to(directory)))

        # Resolution check
        try:
            with Image.open(img_path) as im:
                w, h = im.size
                if min(w, h) < min_res:
                    low_res.append(
                        f"{img_path.relative_to(directory)} ({w}x{h})"
                    )
        except Exception:
            unreadable.append(str(img_path.relative_to(directory)))

    # Orphaned captions (no matching image)
    orphaned = sorted(
        str(cf.relative_to(directory))
        for cf in caption_files
        if cf not in image_stems
    )

    # Build report
    size_mb = total_size / (1024 * 1024)
    lines = [
        f"Dataset Validation: {directory}",
        f"{'=' * 50}",
        "",
        "Overview:",
        f"  Images:     {len(images)}",
        f"  Total size: {size_mb:.1f} MB",
        f"  Min resolution threshold: {min_res}px (shortest side)",
    ]

    issues_found = False

    if missing_captions:
        issues_found = True
        lines.append("")
        lines.append(f"Missing captions ({len(missing_captions)}):")
        for f in missing_captions:
            lines.append(f"  {f}")

    if empty_captions:
        issues_found = True
        lines.append("")
        lines.append(f"Empty captions ({len(empty_captions)}):")
        for f in empty_captions:
            lines.append(f"  {f}")

    if low_res:
        issues_found = True
        lines.append("")
        lines.append(f"Below minimum resolution ({len(low_res)}):")
        for f in low_res:
            lines.append(f"  {f}")

    if orphaned:
        issues_found = True
        lines.append("")
        lines.append(f"Orphaned caption files ({len(orphaned)}):")
        for f in orphaned:
            lines.append(f"  {f}")

    if unreadable:
        issues_found = True
        lines.append("")
        lines.append(f"Unreadable images ({len(unreadable)}):")
        for f in unreadable:
            lines.append(f"  {f}")

    if not issues_found:
        lines.append("")
        lines.append("No issues found. Dataset looks healthy!")

    return _text("\n".join(lines))


@tool(
    "detect_screenshots",
    "Find social media screenshots and text-only posts in a directory",
    {
        "directory": str,
        "auto_reject": str,
    },
)
async def detect_screenshots(args: dict[str, Any]) -> dict[str, Any]:
    directory = Path(args["directory"])
    if not directory.exists():
        return _error(f"Directory not found: {directory}")

    auto_reject = args.get("auto_reject", "false").lower() == "true"

    images = []
    for ext in IMAGE_EXTS:
        images.extend(directory.rglob(f"*{ext}"))

    if not images:
        return _text(f"No images found in {directory}")

    detected = []
    for img_path in sorted(images):
        try:
            with Image.open(img_path) as im:
                is_ss, reason = _is_screenshot(im)
                if is_ss:
                    detected.append((img_path, reason))
        except Exception:
            continue

    if not detected:
        return _text(f"No screenshots detected among {len(images)} images.")

    moved = 0
    if auto_reject:
        rejected_dir = directory / "rejected"
        rejected_dir.mkdir(exist_ok=True)
        for img_path, _ in detected:
            target = rejected_dir / img_path.name
            img_path.rename(target)
            caption = img_path.with_suffix(".txt")
            if caption.exists():
                caption.rename(rejected_dir / caption.name)
            moved += 1

    lines = [f"Found {len(detected)} likely screenshots among {len(images)} images:\n"]
    for img_path, reason in detected:
        status = " [REJECTED]" if auto_reject else ""
        lines.append(f"  {img_path.name}: {reason}{status}")

    if auto_reject:
        lines.append(f"\nMoved {moved} images to {directory}/rejected/")

    return _text("\n".join(lines))


# ─── Cropping & Face Detection ────────────────────────────────────────────────


@tool(
    "crop_center",
    "Center-crop images to square (good for logos, album covers)",
    {
        "source_dir": str,
        "output_dir": str,
        "resolution": float,
    },
)
async def crop_center(args: dict[str, Any]) -> dict[str, Any]:
    source = Path(args["source_dir"])
    output = Path(args["output_dir"])
    resolution = int(args.get("resolution", 1024))

    if not source.exists():
        return _error(f"Source directory not found: {source}")
    output.mkdir(parents=True, exist_ok=True)

    images = []
    for ext in IMAGE_EXTS:
        images.extend(source.rglob(f"*{ext}"))

    cropped, skipped, errors = 0, 0, 0
    for img_path in images:
        out_path = output / f"{img_path.stem}.png"
        if out_path.exists():
            skipped += 1
            continue
        try:
            with Image.open(img_path) as im:
                im = im.convert("RGB")
                w, h = im.size
                side = min(w, h)
                left = (w - side) // 2
                top = (h - side) // 2
                im = im.crop((left, top, left + side, top + side))
                im = im.resize((resolution, resolution), Image.LANCZOS)
                im.save(out_path, "PNG")
                cropped += 1
        except Exception:
            errors += 1

    return _text(
        f"Center-cropped {cropped} images to {resolution}x{resolution} in {output}\n"
        f"Skipped {skipped} (already exist), {errors} errors"
    )


@tool(
    "crop_smart",
    "Smart-crop to the highest-entropy (most detailed) region",
    {
        "source_dir": str,
        "output_dir": str,
        "resolution": float,
    },
)
async def crop_smart(args: dict[str, Any]) -> dict[str, Any]:
    source = Path(args["source_dir"])
    output = Path(args["output_dir"])
    resolution = int(args.get("resolution", 1024))

    if not source.exists():
        return _error(f"Source directory not found: {source}")
    output.mkdir(parents=True, exist_ok=True)

    images = []
    for ext in IMAGE_EXTS:
        images.extend(source.rglob(f"*{ext}"))

    cropped, skipped, errors = 0, 0, 0
    for img_path in images:
        out_path = output / f"{img_path.stem}.png"
        if out_path.exists():
            skipped += 1
            continue
        try:
            with Image.open(img_path) as im:
                im = im.convert("RGB")
                w, h = im.size
                side = min(w, h)
                best_crop = None
                best_entropy = -1.0

                # Slide a square window across the longer axis, pick highest entropy
                if w > h:
                    step = max(1, (w - side) // 10)
                    for x in range(0, w - side + 1, step):
                        region = im.crop((x, 0, x + side, side))
                        entropy = region.entropy()
                        if entropy > best_entropy:
                            best_entropy = entropy
                            best_crop = (x, 0, x + side, side)
                else:
                    step = max(1, (h - side) // 10)
                    for y in range(0, h - side + 1, step):
                        region = im.crop((0, y, side, y + side))
                        entropy = region.entropy()
                        if entropy > best_entropy:
                            best_entropy = entropy
                            best_crop = (0, y, side, y + side)

                if best_crop:
                    im = im.crop(best_crop)
                im = im.resize((resolution, resolution), Image.LANCZOS)
                im.save(out_path, "PNG")
                cropped += 1
        except Exception:
            errors += 1

    return _text(
        f"Smart-cropped {cropped} images to {resolution}x{resolution} in {output}\n"
        f"Skipped {skipped} (already exist), {errors} errors"
    )


@tool(
    "detect_faces",
    "Detect faces in images and report bounding boxes",
    {
        "directory": str,
    },
)
async def detect_faces(args: dict[str, Any]) -> dict[str, Any]:
    directory = Path(args["directory"])
    if not directory.exists():
        return _error(f"Directory not found: {directory}")

    try:
        import cv2
    except ImportError:
        return _error("opencv-python-headless not installed.")

    # Load Haar cascade for face detection
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(cascade_path)
    if face_cascade.empty():
        return _error(f"Could not load face cascade from {cascade_path}")

    images = []
    for ext in IMAGE_EXTS:
        images.extend(directory.rglob(f"*{ext}"))

    results = []
    for img_path in images:
        try:
            img = cv2.imread(str(img_path))
            if img is None:
                continue
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
            )
            if len(faces) > 0:
                h, w = img.shape[:2]
                face_list = [
                    {"x": int(x), "y": int(y), "w": int(fw), "h": int(fh)}
                    for (x, y, fw, fh) in faces
                ]
                results.append(
                    {
                        "path": str(img_path),
                        "image_size": f"{w}x{h}",
                        "faces": len(faces),
                        "bounding_boxes": face_list,
                    }
                )
        except Exception:
            continue

    if not results:
        return _text(f"No faces detected in {len(images)} images.")

    total_faces = sum(r["faces"] for r in results)
    lines = [f"Found {total_faces} faces in {len(results)} images:\n"]
    for r in results:
        boxes = ", ".join(f"({b['x']},{b['y']} {b['w']}x{b['h']})" for b in r["bounding_boxes"])
        lines.append(
            f"  {Path(r['path']).name}: {r['faces']} face(s) [{r['image_size']}] — {boxes}"
        )
    return _text("\n".join(lines))


@tool(
    "crop_faces",
    "Crop images around detected faces for portrait training data",
    {
        "source_dir": str,
        "output_dir": str,
        "resolution": float,
        "padding": float,
    },
)
async def crop_faces(args: dict[str, Any]) -> dict[str, Any]:
    source = Path(args["source_dir"])
    output = Path(args["output_dir"])
    resolution = int(args.get("resolution", 1024))
    padding = float(args.get("padding", 0.5))  # 50% padding around face

    if not source.exists():
        return _error(f"Source directory not found: {source}")

    try:
        import cv2
    except ImportError:
        return _error("opencv-python-headless not installed.")

    output.mkdir(parents=True, exist_ok=True)

    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(cascade_path)

    images = []
    for ext in IMAGE_EXTS:
        images.extend(source.rglob(f"*{ext}"))

    cropped, no_face, errors = 0, 0, 0
    for img_path in images:
        try:
            img = cv2.imread(str(img_path))
            if img is None:
                errors += 1
                continue
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
            )
            if len(faces) == 0:
                no_face += 1
                continue

            # Use the largest face
            areas = [fw * fh for (_, _, fw, fh) in faces]
            idx = areas.index(max(areas))
            fx, fy, fw, fh = faces[idx]

            # Expand to square with padding
            cx, cy = fx + fw // 2, fy + fh // 2
            face_size = max(fw, fh)
            side = int(face_size * (1 + padding * 2))

            h_img, w_img = img.shape[:2]
            x1 = max(0, cx - side // 2)
            y1 = max(0, cy - side // 2)
            x2 = min(w_img, x1 + side)
            y2 = min(h_img, y1 + side)
            # Re-center if we hit an edge
            x1 = max(0, x2 - side)
            y1 = max(0, y2 - side)

            # Crop with Pillow for quality resize
            with Image.open(img_path) as pil_img:
                pil_img = pil_img.convert("RGB")
                pil_img = pil_img.crop((x1, y1, x2, y2))
                pil_img = pil_img.resize((resolution, resolution), Image.LANCZOS)
                out_path = output / f"{img_path.stem}_face.png"
                pil_img.save(out_path, "PNG")
                cropped += 1
        except Exception:
            errors += 1

    return _text(
        f"Face-cropped {cropped} images to {resolution}x{resolution} in {output}\n"
        f"No face found: {no_face}, errors: {errors}"
    )


# ─── Export to ai-toolkit ─────────────────────────────────────────────────────


def _detect_aitk_path() -> Path:
    """Auto-detect ai-toolkit datasets directory."""
    if p := os.environ.get("DATASETS_FOLDER"):
        return Path(p)
    if p := os.environ.get("AI_TOOLKIT_UI_DATA"):
        return Path(p) / "datasets"
    if p := os.environ.get("XDG_DATA_HOME"):
        return Path(p) / "ai-toolkit" / "datasets"
    return Path.home() / ".local" / "share" / "ai-toolkit" / "datasets"


def _generate_aitk_config(
    name: str,
    trigger_word: str,
    folder_path: str,
    platform: str,
    resolution: int,
) -> str:
    """Generate an ai-toolkit training YAML config."""
    is_macos = platform == "macos" or (platform == "auto" and sys.platform == "darwin")

    if is_macos:
        device = "mps"
        optimizer = "adamw"
        resolutions = [512, 768]
        dtype = "float32"
    else:
        device = "cuda:0"
        optimizer = "adamw8bit"
        resolutions = [512, 768, 1024]
        dtype = "bf16"

    config = {
        "job": "extension",
        "config": {
            "name": f"{name}_lora_v1",
            "process": [
                {
                    "type": "sd_trainer",
                    "training_folder": folder_path,
                    "device": device,
                    "trigger_word": trigger_word,
                    "network": {
                        "type": "lora",
                        "linear": 16,
                        "linear_alpha": 16,
                    },
                    "save": {
                        "dtype": dtype,
                        "save_every": 250,
                        "max_step_saves_to_keep": 3,
                    },
                    "datasets": [
                        {
                            "folder_path": folder_path,
                            "caption_ext": "txt",
                            "caption_dropout_rate": 0.05,
                            "shuffle_tokens": False,
                            "cache_latents_to_disk": True,
                            "resolution": resolutions,
                        }
                    ],
                    "train": {
                        "batch_size": 1,
                        "steps": 2000,
                        "gradient_accumulation_steps": 1,
                        "train_unet": True,
                        "train_text_encoder": False,
                        "gradient_checkpointing": True,
                        "noise_scheduler": "flowmatch",
                        "optimizer": optimizer,
                        "lr": 4e-4,
                        "ema_config": {
                            "use_ema": True,
                            "ema_decay": 0.99,
                        },
                        "dtype": dtype,
                    },
                    "model": {
                        "name_or_path": "black-forest-labs/FLUX.1-dev",
                        "is_flux": True,
                        "quantize": not is_macos,
                    },
                    "sample": {
                        "sampler": "flowmatch",
                        "sample_every": 250,
                        "width": min(resolutions[-1], resolution),
                        "height": min(resolutions[-1], resolution),
                        "prompts": [
                            f"{trigger_word}",
                            f"{trigger_word}, detailed high quality artwork",
                        ],
                        "neg": "",
                        "seed": 42,
                        "walk_seed": True,
                        "guidance_scale": 4,
                        "sample_steps": 20,
                    },
                }
            ],
        },
    }

    return yaml.dump(config, default_flow_style=False, sort_keys=False)


@tool(
    "export_dataset",
    "Export dataset to ai-toolkit format (flat dir + training config)",
    {
        "config_path": str,
        "output_dir": str,
        "generate_config": str,
        "platform": str,
    },
)
async def export_dataset(args: dict[str, Any]) -> dict[str, Any]:
    config_path = Path(args["config_path"])
    if not config_path.exists():
        return _error(f"Config not found: {config_path}")

    config = yaml.safe_load(config_path.read_text())
    name = config.get("name", config_path.stem)
    trigger_word = config.get("trigger_word", "style")
    categories = config.get("categories", {})
    src_dir = Path(config.get("output_dir", f"./datasets/{name}"))
    resolution = config.get("curation", {}).get("training_resolution", 1024)
    gen_config = args.get("generate_config", "true").lower() == "true"
    platform = args.get("platform", "auto").lower()

    if not src_dir.exists():
        return _error(f"Source dataset directory not found: {src_dir}")

    # Resolve output directory ("auto", empty, or missing all mean auto-detect)
    explicit_dir = args.get("output_dir", "").strip()
    if explicit_dir and explicit_dir.lower() != "auto":
        out_dir = Path(explicit_dir)
    else:
        out_dir = _detect_aitk_path() / name

    out_dir.mkdir(parents=True, exist_ok=True)

    # Walk category subdirectories and copy images + captions
    exported, captions_written, skipped = 0, 0, 0
    for cat_name in sorted(categories.keys()):
        cat_dir = src_dir / cat_name
        if not cat_dir.is_dir():
            continue

        cat_desc = categories.get(cat_name, cat_name)

        for img_path in sorted(cat_dir.iterdir()):
            if img_path.suffix.lower() not in IMAGE_EXTS:
                continue

            dest_img = out_dir / img_path.name
            if dest_img.exists():
                skipped += 1
                continue

            # Copy image
            shutil.copy2(img_path, dest_img)
            exported += 1

            # Copy or generate caption
            src_caption = img_path.with_suffix(".txt")
            dest_caption = dest_img.with_suffix(".txt")
            if src_caption.exists():
                shutil.copy2(src_caption, dest_caption)
            else:
                dest_caption.write_text(f"{trigger_word}, {cat_desc}")
                captions_written += 1

    # Also check for images directly in src_dir (not in a category subdir)
    for img_path in sorted(src_dir.iterdir()):
        if img_path.is_dir() or img_path.suffix.lower() not in IMAGE_EXTS:
            continue
        dest_img = out_dir / img_path.name
        if dest_img.exists():
            skipped += 1
            continue
        shutil.copy2(img_path, dest_img)
        exported += 1
        src_caption = img_path.with_suffix(".txt")
        dest_caption = dest_img.with_suffix(".txt")
        if src_caption.exists():
            shutil.copy2(src_caption, dest_caption)
        else:
            dest_caption.write_text(f"{trigger_word}")
            captions_written += 1

    lines = [
        f"Exported {exported} images to ai-toolkit format",
        f"  Output: {out_dir}",
        f"  Skipped: {skipped} (already exist)",
        f"  Captions: {captions_written} generated (rest copied from source)",
    ]

    # Generate training config
    config_out_path = None
    if gen_config and exported > 0:
        config_dir = out_dir.parent.parent / "config"
        if not config_dir.exists():
            config_dir = out_dir.parent
        config_dir.mkdir(parents=True, exist_ok=True)
        config_out_path = config_dir / f"{name}_lora.yaml"

        aitk_yaml = _generate_aitk_config(
            name=name,
            trigger_word=trigger_word,
            folder_path=str(out_dir),
            platform=platform,
            resolution=resolution,
        )
        config_out_path.write_text(aitk_yaml)
        lines.append(f"  Training config: {config_out_path}")

    return _text("\n".join(lines))


# ─── Tool Registry ────────────────────────────────────────────────────────────

ALL_TOOLS = [
    # Config
    create_config,
    read_config,
    update_config,
    list_configs,
    # Acquisition
    search_bing,
    search_wikimedia,
    download_images,
    download_gallery,
    # Dataset management
    list_images,
    get_image_info,
    move_images,
    organize_images,
    # Quality & curation
    analyze_quality,
    find_duplicates,
    resize_images,
    write_caption,
    validate_dataset,
    detect_screenshots,
    # Cropping & face detection
    crop_center,
    crop_smart,
    detect_faces,
    crop_faces,
    # Export
    export_dataset,
]
