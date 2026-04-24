# End-to-end Workflow

A conceptual tour of LatentForge's nine-step pipeline and the tools that power each stage. For a hands-on walk-through, see [Getting Started](./getting-started).

## 1. Configure

Write (or ask the agent to write) a YAML config describing the dataset — subject, trigger word, categories, and curation targets. See [Dataset Configuration](./configuration) for every field.

**Tools:** [`create_config`](/tools/reference#create-config), [`read_config`](/tools/reference#read-config), [`update_config`](/tools/reference#update-config), [`list_configs`](/tools/reference#list-configs).

## 2. Collect

Pull images from the web. Bing handles commercial / recent content; Wikimedia Commons gives you CC-licensed, high-resolution art; `gallery-dl` reaches 80+ specialized sites (DeviantArt, ArtStation, Pinterest, Reddit, Flickr, …). Every downloader hashes bytes with MD5 to skip exact duplicates across runs.

**Tools:** [`search_bing`](/tools/reference#search-bing), [`search_wikimedia`](/tools/reference#search-wikimedia), [`download_images`](/tools/reference#download-images), [`download_gallery`](/tools/reference#download-gallery).

## 3. Organize

Once raw images are on disk, `organize_images` sorts them into category subdirectories based on filename prefixes that match your search-query templates. `move_images` handles ad-hoc relocations and rejections.

**Tools:** [`organize_images`](/tools/reference#organize-images), [`move_images`](/tools/reference#move-images), [`list_images`](/tools/reference#list-images), [`get_image_info`](/tools/reference#get-image-info).

## 4. Curate

The agent reads images directly using its built-in vision capability — checking subject fit, visual quality, watermarks, aspect ratio, and background clutter — then moves rejects into `rejected/`. `detect_screenshots` catches the common failure mode of accidental social-media captures and text-only posts.

**Tools:** [`detect_screenshots`](/tools/reference#detect-screenshots), [`analyze_quality`](/tools/reference#analyze-quality).

## 5. Deduplicate

MD5 catches byte-identical duplicates. For reposted-but-recompressed images, `find_duplicates` uses a perceptual hash (phash) with a configurable Hamming-distance threshold.

**Tools:** [`find_duplicates`](/tools/reference#find-duplicates).

## 6. Crop

When images are large but the subject is off-center, pick a cropping strategy:

- `crop_center` — square center-crop. Good for symmetric subjects like logos and album covers.
- `crop_smart` — slides a window across the image and picks the highest-entropy region. Good for landscape art with a clear focal point.
- `crop_faces` — detects faces with Haar cascades and crops around them with configurable padding. Purpose-built for portrait datasets.

**Tools:** [`crop_center`](/tools/reference#crop-center), [`crop_smart`](/tools/reference#crop-smart), [`crop_faces`](/tools/reference#crop-faces), [`detect_faces`](/tools/reference#detect-faces).

## 7. Resize

Flux LoRA training expects square, fixed-resolution inputs — typically 1024×1024. `resize_images` batch-converts everything to PNG at the target resolution.

**Tools:** [`resize_images`](/tools/reference#resize-images).

## 8. Caption

Each training image needs a `.txt` caption. The agent generates defaults that start with your trigger word and describe visual content plus style. Override individual captions as needed.

**Tools:** [`write_caption`](/tools/reference#write-caption).

## 9. Export

`export_dataset` produces an [ai-toolkit](https://github.com/ostris/ai-toolkit)-shaped output directory: a flat folder of image + caption pairs plus a generated training YAML. The YAML is platform-aware — MPS settings on macOS, CUDA on Linux — and points at the exported image directory.

**Tools:** [`export_dataset`](/tools/reference#export-dataset).

## 10. Train

Point ai-toolkit at the generated YAML and start fine-tuning. LatentForge's job ends at export; training itself happens in [ai-toolkit](https://github.com/ostris/ai-toolkit), [kohya-ss/sd-scripts](https://github.com/kohya-ss/sd-scripts), or any Flux-compatible trainer.
