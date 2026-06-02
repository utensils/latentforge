### 1.2 Rewrite `flake.nix` from Python/uv2nix to Node/npm

- [x] Remove these flake inputs because the project will no longer use Python packaging:
  - [x] `pyproject-nix`
  - [x] `uv2nix`
  - [x] `pyproject-build-systems`
- [x] Keep:
  - [x] `nixpkgs`
  - [x] `treefmt-nix`
- [x] Read metadata from `package.json`, not `pyproject.toml`:

```nix
packageJson = builtins.fromJSON (builtins.readFile ./package.json);
pname = packageJson.name;
version = packageJson.version;
```

- [x] Define `packages.default` with `pkgs.buildNpmPackage`:

```nix
pkgs.buildNpmPackage {
  inherit pname version;
  src = self;
  npmDepsHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; # replace after first build failure

  nativeBuildInputs = [
    pkgs.makeWrapper
    pkgs.pkg-config
  ];

  buildInputs = [
    pkgs.vips
  ];

  npmBuildScript = "build";

  postInstall = ''
    wrapProgram $out/bin/latentforge \
      --prefix PATH : ${nixpkgs.lib.makeBinPath [ pkgs.gallery-dl ]}
  '';
}
```

- [x] If using OpenCV bindings for face detection, add `pkgs.opencv` to both `buildInputs` and devshell packages.
- [x] Keep `apps.default.program = "${self.packages.${system}.default}/bin/${pname}";`.
- [x] Rewrite the devshell:
  - [x] Include `pkgs.nodejs_22`.
  - [x] Include `pkgs.gallery-dl`.
  - [x] Include `pkgs.vips` and `pkgs.pkg-config` for `sharp`.
  - [x] Include `pkgs.prettier` only if formatting should use the Nix package; otherwise rely on npm scripts.
  - [x] Remove `pkgs.uv`, `pkgs.ruff`, `pkgs.pyright`, and the Python virtualenv.
  - [x] Preserve shell helper functions `count()` and `quality-check()` from the current flake.
- [x] Rewrite `formatter` and `checks.formatting`:
  - [x] Keep `programs.nixfmt.enable = true`.
  - [x] Replace `programs.ruff-format.enable = true` with `programs.prettier.enable = true`.
  - [x] Configure prettier for `.ts`, `.json`, `.md` if needed.
- [x] After generating `package-lock.json`, run `nix build` once, copy the reported real `npmDepsHash` into `flake.nix`, then rerun `nix build`.

### 1.3 Update repository metadata and ignored files

- [ ] Update `.gitignore`:
  - [ ] Remove Python-only entries: `__pycache__/`, `*.pyc`, `*.pyo`, `.venv/`, `*.egg-info/`, `.python-version`.
  - [ ] Keep generic `dist/` and `build/` ignored unless `dist/` must be published locally.
  - [ ] Add Node entries:
    - [ ] `node_modules/`
    - [ ] `.npm/`
    - [ ] `coverage/`
    - [ ] `*.tsbuildinfo`
- [ ] Keep dataset/config ignores exactly as-is:
  - [ ] `datasets/**` except `datasets/.gitkeep`
  - [ ] `configs/**` except `configs/.gitkeep`
- [ ] Update `.envrc` only if needed. `use flake` can stay.
- [ ] Remove `pyproject.toml` after package scripts are working.
- [ ] Remove `uv.lock` after `package-lock.json` exists and Nix build uses it.

## 2. Create the TypeScript source tree

- [ ] Replace `src/latentforge/*.py` with this TypeScript layout:

```text
src/
  cli.ts                  # executable entry point with shebang
  agent.ts                # pi SDK session creation, REPL, slash commands, stats
  prompts.ts              # buildSystemPrompt(configPath?: string)
  types.ts                # DatasetConfig and shared types
  tools/
    index.ts              # ALL_TOOLS and ALL_TOOL_NAMES
    response.ts           # textResult(), throwToolError()
    config.ts             # create/read/update/list config tools
    acquisition.ts        # search/download tools
    browse.ts             # list/get/move/organize tools
    quality.ts            # quality, phash duplicates, resize, caption, screenshots
    crop.ts               # center/smart crop
    faces.ts              # detect/crop faces
    export.ts             # ai-toolkit export
  image/
    constants.ts          # IMAGE_EXTS, MIME/ext helpers
    metadata.ts           # sharp metadata helpers
    entropy.ts            # entropy helpers
    screenshot.ts         # screenshot/text-post detection
    phash.ts              # perceptual hash implementation
  util/
    fs.ts                 # safe path/list helpers
    format.ts             # token/cost/status formatting
    json.ts               # JSON-or-newline parsing helpers
```

- [ ] `src/cli.ts` must start with:

```ts
#!/usr/bin/env node
import { main } from "./agent.js";

await main();
```

- [ ] Ensure every relative import includes `.js` because `moduleResolution` is `NodeNext`.

## 3. Port shared types and prompt builder

### 3.1 `src/types.ts`

- [ ] Add the current YAML config shape:

```ts
export interface DatasetConfig {
  name?: string;
  subject?: string;
  trigger_word?: string;
  output_dir?: string;
  search_queries?: Record<string, string[]>;
  wikimedia_queries?: Array<{ prefix: string; query?: string }>;
  categories?: Record<string, string>;
  curation?: {
    target_count?: string;
    min_resolution?: number;
    training_resolution?: number;
  };
}
```

- [ ] Add reusable tool detail type:

```ts
export interface ToolDetails {
  ok: boolean;
  [key: string]: unknown;
}
```

### 3.2 `src/prompts.ts`

- [ ] Port `src/latentforge/prompts.py` to TypeScript.
- [ ] Use `fs.readFileSync` or `await fs.promises.readFile`; keep the same text content and curation guidelines.
- [ ] Use `YAML.parse()` from `yaml` instead of `yaml.safe_load()`.
- [ ] Export:

```ts
export function buildSystemPrompt(configPath?: string): string;
```

- [ ] Preserve the active dataset injected section exactly:
  - [ ] Config path
  - [ ] Trigger word
  - [ ] Target count
  - [ ] Training resolution
  - [ ] Category lines

## 4. Port pi custom tool infrastructure

### 4.1 Tool response helpers

- [ ] In `src/tools/response.ts`, implement:

```ts
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ToolDetails } from "../types.js";

export function textResult(
  text: string,
  details: Record<string, unknown> = {},
): AgentToolResult<ToolDetails> {
  return {
    content: [{ type: "text", text }],
    details: { ok: true, ...details },
  };
}

export function throwToolError(message: string): never {
  throw new Error(message);
}
```

- [ ] Use `throwToolError()` for failures. pi tool errors should be thrown, not returned with Python-style `is_error`.

### 4.2 Tool schemas

- [ ] Use `Type` from `typebox` for every pi tool schema.
- [ ] Wrap every tool with `defineTool()` from `@mariozechner/pi-coding-agent`.
- [ ] Preserve tool names exactly:
  - [ ] `create_config`
  - [ ] `read_config`
  - [ ] `update_config`
  - [ ] `list_configs`
  - [ ] `search_bing`
  - [ ] `search_wikimedia`
  - [ ] `download_images`
  - [ ] `download_gallery`
  - [ ] `list_images`
  - [ ] `get_image_info`
  - [ ] `move_images`
  - [ ] `organize_images`
  - [ ] `analyze_quality`
  - [ ] `find_duplicates`
  - [ ] `detect_screenshots`
  - [ ] `crop_center`
  - [ ] `crop_smart`
  - [ ] `crop_faces`
  - [ ] `detect_faces`
  - [ ] `resize_images`
  - [ ] `write_caption`
  - [ ] `export_dataset`

### 4.3 Tool registry

- [ ] In `src/tools/index.ts`, export all tools in the same order as Python `ALL_TOOLS`.
- [ ] Export `ALL_TOOL_NAMES` for the pi SDK allowlist:

```ts
export const ALL_TOOLS = [createConfigTool, readConfigTool, ...] as const;
export const ALL_TOOL_NAMES = ALL_TOOLS.map((tool) => tool.name);
```

## 5. Port image helper modules

### 5.1 Constants and file helpers

- [ ] In `src/image/constants.ts`:
  - [ ] `export const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);`
  - [ ] Implement `isImagePath(path: string | PathLike): boolean`.
  - [ ] Implement `extensionFromContentTypeOrUrl(contentType: string, url: string): ".jpg" | ".png" | ".webp"`.

### 5.2 Metadata and entropy with `sharp`

- [ ] In `src/image/metadata.ts`, implement helpers:
  - [ ] `readImageMetadata(pathOrBuffer): Promise<{ width?: number; height?: number; format?: string; space?: string; channels?: number }>`.
  - [ ] `loadRgbRaw(pathOrBuffer): Promise<{ data: Buffer; width: number; height: number; channels: 3 }>` using `sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true })`.
- [ ] In `src/image/entropy.ts`, implement Shannon entropy:
  - [ ] Build a 256-bin histogram over grayscale luminance `round(0.299*r + 0.587*g + 0.114*b)`.
  - [ ] Return entropy `-sum(p * log2(p))`.
- [ ] Use entropy to preserve the screenshot detection and smart crop behavior.

### 5.3 Screenshot detection

- [ ] Port `_is_screenshot()` to `src/image/screenshot.ts`:
  - [ ] Inputs: `Buffer | string`.
  - [ ] Return `{ isScreenshot: boolean; reason: string }`.
  - [ ] Preserve current rules:
    - [ ] entropy `< 3.5` => screenshot/text.
    - [ ] near-white or near-black background ratio `> 0.70` and entropy `< 5.0`.
    - [ ] phone-shaped `aspect < 0.6`, entropy `< 5.5`, height `> 1000`.
  - [ ] For performance, downsample very large images before raw pixel analysis, e.g. `resize({ width: 512, height: 512, fit: "inside" })`.

### 5.4 Perceptual hash

- [ ] Implement pHash in `src/image/phash.ts`; do not depend on Python `imagehash`.
- [ ] Algorithm:
  - [ ] Resize image to 32x32 grayscale using `sharp`.
  - [ ] Compute 2D DCT.
  - [ ] Keep the top-left 8x8 coefficients excluding the DC coefficient when calculating median.
  - [ ] Generate a 64-bit hash as a `bigint` or 16-char hex string.
  - [ ] Implement Hamming distance.
- [ ] Export:

```ts
export async function phash(path: string): Promise<bigint>;
export function hammingDistance(a: bigint, b: bigint): number;
```

## 6. Port each dataset tool

### 6.1 Config tools: `src/tools/config.ts`

- [ ] `create_config`
  - [ ] Schema fields: `name`, `subject`, `trigger_word`, `output_dir`, `categories` all strings.
  - [ ] Create `configs/` if missing.
  - [ ] Write `configs/<name>.yaml`.
  - [ ] Reject if it already exists.
  - [ ] Parse `categories` as JSON object.
  - [ ] Write YAML with keys in the current order.
  - [ ] Return `Created config: ...` plus YAML text.
- [ ] `read_config`
  - [ ] Schema: `{ path: string }`.
  - [ ] Return YAML text.
- [ ] `update_config`
  - [ ] Schema: `{ path: string, updates: string }`.
  - [ ] Parse updates JSON.
  - [ ] Implement recursive deep merge for object values.
  - [ ] Rewrite YAML.
- [ ] `list_configs`
  - [ ] Schema: `{}`.
  - [ ] List `configs/*.yaml`, sorted.
  - [ ] Output format: `Available configs:\n  configs/foo.yaml — foo: Subject`.

### 6.2 Acquisition tools: `src/tools/acquisition.ts`

- [ ] Define constants from Python:
  - [ ] Browser `HEADERS` user-agent.
  - [ ] Wikimedia `COMMONS_API`.
  - [ ] Commons user-agent.
- [ ] Use built-in `fetch`/`undici` APIs; set request timeouts with `AbortSignal.timeout(15000)`.
- [ ] `search_bing`
  - [ ] Schema: `{ query: string, count: number }`.
  - [ ] Build the same Bing image URL with `qft=+filterui:imagesize-large`.
  - [ ] Use `cheerio` to parse HTML.
  - [ ] Read `.iusc` anchor `m` JSON and collect `murl`.
  - [ ] Fallback to non-Bing `img[src]` URLs.
  - [ ] Return the same text format.
- [ ] `search_wikimedia`
  - [ ] Schema: `{ query: string, limit: number }`.
  - [ ] Call Commons search API, namespace 6.
  - [ ] Batch titles by 20.
  - [ ] Call imageinfo API with `iiprop=url|size|mime`.
  - [ ] Keep JPEG/PNG images with width and height >= 400.
  - [ ] Sleep 500ms between batches.
- [ ] `download_images`
  - [ ] Schema: `{ urls: string, output_dir: string, prefix: string }`.
  - [ ] Accept JSON array or newline-delimited URL string.
  - [ ] Download with timeout 15s.
  - [ ] Skip non-200 responses.
  - [ ] Skip payloads `< 10000` bytes.
  - [ ] MD5 hash first 12 hex chars for filename.
  - [ ] Skip if `*<hash>*` exists in output dir.
  - [ ] Run screenshot detection before writing.
  - [ ] Infer extension from content-type or URL.
  - [ ] Return `Download complete: X saved, Y skipped (dup/small), Z failed[, N rejected (screenshot/text)]\nDirectory: ...`.
- [ ] `download_gallery`
  - [ ] Schema: `{ url: string, output_dir: string, prefix: string, min_size: number }`.
  - [ ] Check `gallery-dl` exists by spawning `gallery-dl --version` or locating via PATH.
  - [ ] Spawn `gallery-dl --dest <tmp> --no-mtime <url>` with 120s timeout.
  - [ ] Walk temp dir recursively for image extensions.
  - [ ] Apply min-size, MD5 dedup, screenshot detection, move into output dir.
  - [ ] Remove temp dir in `finally`.
  - [ ] Include last 3 stderr lines in output like Python.

### 6.3 Browse/organize tools: `src/tools/browse.ts`

- [ ] `list_images`
  - [ ] Recursively list image files under `directory`.
  - [ ] Sort paths.
  - [ ] For each image, output relative path, width x height, and size KB.
- [ ] `get_image_info`
  - [ ] Return JSON with path, size bytes, size KB, width, height, format, and mode/space if available.
  - [ ] Include caption text if sidecar `.txt` exists.
- [ ] `move_images`
  - [ ] Accept JSON array or newline-delimited paths.
  - [ ] Create destination.
  - [ ] Move image and sidecar caption.
  - [ ] Count missing files as errors.
- [ ] `organize_images`
  - [ ] Load config YAML.
  - [ ] Build prefix map from `search_queries` using Python regex equivalent: `q.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40).replace(/^_+|_+$/g, "")`.
  - [ ] Preserve special handling of `wikimedia_queries` mapping prefix to `band_photos`.
  - [ ] Create category dirs.
  - [ ] Move only images directly in `base_dir`, not nested images.
  - [ ] Output sorted moved summary and total.

### 6.4 Quality/training tools: `src/tools/quality.ts`

- [ ] `analyze_quality`
  - [ ] Recursively collect images.
  - [ ] Preserve buckets:
    - [ ] `excellent_500kb+`
    - [ ] `good_100_500kb`
    - [ ] `ok_50_100kb`
    - [ ] `small_10_50kb`
    - [ ] `tiny_under_10kb`
    - [ ] `1024+`, `512_1024`, `256_512`, `under_256`
  - [ ] Include formats, total size MB, average dimensions, min/max resolution.
  - [ ] Return JSON pretty-printed with 2 spaces.
- [ ] `find_duplicates`
  - [ ] Recursively collect images.
  - [ ] Compute pHash for each readable image.
  - [ ] Compare every pair and include pairs with distance <= threshold.
  - [ ] Preserve text output format.
- [ ] `resize_images`
  - [ ] Recursively collect images.
  - [ ] Use `sharp`: convert to RGB, resize to exact square resolution, save PNG.
  - [ ] Output filename: `<parent-dir-name>_<stem>.png`.
  - [ ] Count skipped if output exists.
- [ ] `write_caption`
  - [ ] Write sidecar `.txt` next to the image.
- [ ] `detect_screenshots`
  - [ ] Recursively scan images.
  - [ ] `auto_reject` is string; treat lowercase `"true"` as true.
  - [ ] If auto reject, move image and caption to `<directory>/rejected/`.
  - [ ] Preserve output text.

### 6.5 Crop tools: `src/tools/crop.ts`

- [ ] `crop_center`
  - [ ] Recursively collect images.
  - [ ] Center-crop square using smallest side.
  - [ ] Resize to resolution and save PNG to `<output_dir>/<stem>.png`.
- [ ] `crop_smart`
  - [ ] Recursively collect images.
  - [ ] For each image, slide a square crop along the longer axis with 10 steps like Python.
  - [ ] Compute entropy for each candidate crop.
  - [ ] Pick highest entropy crop.
  - [ ] Resize to resolution and save PNG.

### 6.6 Face tools: `src/tools/faces.ts`

- [ ] Implement face detection in TypeScript/Node without Python.
- [ ] Required behavior parity:
  - [ ] `detect_faces` schema: `{ directory: string }`.
  - [ ] Recursively scan images.
  - [ ] Return no-face message if none found.
  - [ ] For images with faces, output `filename: N face(s) [WxH] — (x,y wxh), ...`.
  - [ ] `crop_faces` schema: `{ source_dir: string, output_dir: string, resolution: number, padding: number }`.
  - [ ] Use largest detected face.
  - [ ] Expand to square with padding.
  - [ ] Clamp crop bounds to image edges.
  - [ ] Save `<stem>_face.png`.
- [ ] If using `@vladmandic/human`:
  - [ ] Create a single lazy-loaded detector instance.
  - [ ] Convert each image to a compatible tensor/input.
  - [ ] Normalize results to `{ x, y, w, h }` boxes.
  - [ ] Add a unit/integration test guarded so it can be skipped if model assets are unavailable.
- [ ] If using OpenCV Node bindings:
  - [ ] Load `haarcascade_frontalface_default.xml` from the package or Nix `opencv` share path.
  - [ ] Do not shell out to Python.

### 6.7 Export tool: `src/tools/export.ts`

- [ ] Port `_detect_aitk_path()` exactly:
  - [ ] `$DATASETS_FOLDER`
  - [ ] `$AI_TOOLKIT_UI_DATA/datasets`
  - [ ] `$XDG_DATA_HOME/ai-toolkit/datasets`
  - [ ] `~/.local/share/ai-toolkit/datasets`
- [ ] Port `_generate_aitk_config()`:
  - [ ] macOS: `mps`, `adamw`, `[512, 768]`, `float32`, no quantize.
  - [ ] Linux/other: `cuda:0`, `adamw8bit`, `[512, 768, 1024]`, `bf16`, quantize true.
  - [ ] Preserve all YAML fields from Python.
- [ ] `export_dataset`
  - [ ] Load config YAML.
  - [ ] Resolve source dir from `output_dir` or `./datasets/<name>`.
  - [ ] Resolve explicit output dir unless missing/empty/`auto`.
  - [ ] Copy category images and captions.
  - [ ] Generate default captions using trigger word + category description.
  - [ ] Also copy images directly under source dir.
  - [ ] Generate training config only when `generate_config` is true and exported > 0.
  - [ ] Preserve output text.

## 7. Implement the pi SDK agent and REPL

### 7.1 Argument parsing and startup

- [ ] In `src/agent.ts`, use `commander` or manual parsing for:
  - [ ] `--config <path>`
  - [ ] `--model <id>` defaulting to the current default or a validated pi Anthropic model.
- [ ] Load config name for the banner exactly like Python:
  - [ ] If config exists, parse YAML and use `config.name || path stem`.
- [ ] Print banner:
  - [ ] `LatentForge`
  - [ ] Auth method summary.
  - [ ] Model.
  - [ ] Config.
  - [ ] Help hint.
- [ ] Auth handling:
  - [ ] Create `const authStorage = AuthStorage.create();`.
  - [ ] Create `const modelRegistry = ModelRegistry.create(authStorage);`.
  - [ ] For display only, check `ANTHROPIC_API_KEY`; otherwise show `pi auth / stored credentials` rather than assuming no auth.
  - [ ] Do not manually implement Claude SDK OAuth. pi SDK owns credential resolution.

### 7.2 Create the pi session

- [ ] Use these imports:

```ts
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
```

- [ ] Build the system prompt with `buildSystemPrompt(args.config)`.
- [ ] Create a `DefaultResourceLoader` with `systemPromptOverride: () => systemPrompt`, then `await loader.reload()`.
- [ ] Resolve the model:
  - [ ] Try `modelRegistry.find("anthropic", modelId)`.
  - [ ] Fallback to `getModel("anthropic", modelId)`.
  - [ ] If still missing, print available Anthropic models and exit non-zero.
- [ ] Create session:

```ts
const { session } = await createAgentSession({
  cwd: process.cwd(),
  model,
  thinkingLevel: "off",
  authStorage,
  modelRegistry,
  resourceLoader: loader,
  tools: ["read", "write", "bash", ...ALL_TOOL_NAMES],
  customTools: [...ALL_TOOLS],
  sessionManager: SessionManager.inMemory(process.cwd()),
  settingsManager: SettingsManager.inMemory({
    compaction: { enabled: true },
    retry: { enabled: true, maxRetries: 2 },
  }),
});
```

- [ ] If TypeScript rejects `customTools: [...ALL_TOOLS]`, adjust `ALL_TOOLS` typing to `ToolDefinition[]`.
- [ ] Verify custom tools appear by sending `/tools` locally and by asking the agent to use `list_configs`.

### 7.3 Subscribe to pi events

- [ ] Subscribe once per session:
  - [ ] On `message_update` + `text_delta`, write delta to stdout.
  - [ ] On `tool_execution_start`, stop spinner/newline and print `▸ <toolName>` in dim magenta.
  - [ ] On `tool_execution_end`, optionally show error marker if event reports error.
  - [ ] On `agent_end`, refresh cached stats with `session.getSessionStats()`.
  - [ ] On `compaction_start`/`compaction_end`, print compact status.
- [ ] Implement a simple spinner on stderr while awaiting `session.prompt()`.
  - [ ] Start before `await session.prompt(...)`.
  - [ ] Stop on first text delta, tool start, error, or finally after prompt resolves.

### 7.4 Initial prompt

- [ ] Match Python behavior:
  - [ ] If config passed: `I've loaded the dataset config from <path>. What would you like to do?`
  - [ ] Else: `No config loaded. I can help you create a new dataset config, or you can load one with --config. What would you like to work on?`
- [ ] Send with `await session.prompt(initial)`.

### 7.5 Interactive loop

- [ ] Use `readline/promises` for the prompt loop.
- [ ] Before each user prompt, print context/cost line.
- [ ] Use `session.getSessionStats()` and `session.getContextUsage()` instead of manually parsing Claude `ResultMessage`.
- [ ] Format context line:
  - [ ] `<used>/<window> tokens (<pct>%) · $<cost> · turn <userMessages>`
  - [ ] If context usage tokens are null, show `context unknown`.
- [ ] If empty input, continue.
- [ ] If input starts with `/`, route to local slash command handler.
- [ ] Else call `await session.prompt(userInput)`.
- [ ] After each prompt, auto-compact if:
  - [ ] `session.getContextUsage()?.percent !== null`
  - [ ] percent >= 75
  - [ ] at least 3 user messages have occurred
  - [ ] Call `await session.compact()` and print before/after stats.

### 7.6 Slash commands

- [ ] Implement a `SlashCommands` class or functions in `agent.ts`.
- [ ] `/help`: print the same command list as Python.
- [ ] `/config`: print loaded config YAML or the no-config message.
- [ ] `/tools`: print the same tool groups as Python, but say `22 pi custom tools` instead of `22 MCP tools`.
- [ ] `/cost`: use `session.getSessionStats().cost`, user/assistant/tool counts.
- [ ] `/status`: include auth, model, config, session id, compaction, turns, cost, context.
- [ ] `/model` with no arg:
  - [ ] Show current model.
  - [ ] Show available configured Anthropic/pi models from `modelRegistry.getAvailable()`.
- [ ] `/model <name>`:
  - [ ] Resolve model as in startup.
  - [ ] Use `await session.setModel(model)`.
  - [ ] Update displayed model.
  - [ ] Send a brief confirmation prompt only if needed; otherwise just print `Now using <name>`.
- [ ] `/export [path]`:
  - [ ] Require loaded config.
  - [ ] Call the TypeScript `exportDatasetTool.execute()` helper directly **or** export a plain function used by both the tool and slash command.
  - [ ] Use args: `{ config_path, generate_config: "true", platform: "auto", output_dir?: path }`.
- [ ] `/compact`:
  - [ ] Call `await session.compact()`.
  - [ ] Print token count before and after.
- [ ] `/clear`: clear screen with `process.stdout.write("\x1Bc")`.
- [ ] `/quit`, `/q`, `/exit`: break loop and dispose session.
- [ ] Unknown slash command: print warning and do not send to agent.

### 7.7 Shutdown

- [ ] On EOF/Ctrl+C:
  - [ ] Stop spinner.
  - [ ] Close readline.
  - [ ] `session.dispose()`.
  - [ ] Print `Goodbye! Session cost: $... across ... turns`.

## 8. Tests and verification

### 8.1 Unit tests

- [ ] Add `test/` with Vitest tests for pure functionality:
  - [ ] JSON-or-newline URL/path parsing.
  - [ ] Deep merge for config updates.
  - [ ] Prefix generation for `organize_images`.
  - [ ] Entropy on simple buffers.
  - [ ] pHash Hamming distance.
  - [ ] ai-toolkit config generation for macOS and Linux.
- [ ] Add filesystem integration tests using `mkdtemp` for:
  - [ ] `create_config`, `read_config`, `update_config`, `list_configs`.
  - [ ] `write_caption`.
  - [ ] `move_images` including sidecar caption.
  - [ ] `export_dataset` with generated captions.
- [ ] Add image tests by generating tiny test images with `sharp`; avoid network.

### 8.2 Manual CLI verification

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Run `npm test`.
- [ ] Run `node dist/cli.js --help`.
- [ ] Run `npm run dev -- --help`.
- [ ] Run `npm run dev` and verify:
  - [ ] Startup banner appears.
  - [ ] Initial agent prompt works.
  - [ ] `/help` works.
  - [ ] `/tools` lists 22 tools.
  - [ ] `/status` works.
  - [ ] `/quit` exits cleanly.
- [ ] Create a temporary config through the tool or manually and run:
  - [ ] `npm run dev -- --config configs/<temp>.yaml`
  - [ ] `/config`
  - [ ] `/export /tmp/latentforge-export-test`
- [ ] Verify `gallery-dl` tool only inside `nix develop` or when `gallery-dl` is installed on PATH.

### 8.3 Nix verification

- [ ] Run `nix fmt`.
- [ ] Run `nix develop -c npm run typecheck`.
- [ ] Run `nix develop -c npm test`.
- [ ] Run `nix build`.
- [ ] If `nix build` fails with an `npmDepsHash` mismatch, replace fake hash with the suggested hash and rerun.
- [ ] Run `nix run . -- --help`.

## 9. Documentation updates

- [ ] Update `README.md`:
  - [ ] Replace Python badge with TypeScript/Node badge.
  - [ ] Replace Claude Agent SDK badge/link with pi SDK/pi.dev badge/link.
  - [ ] Update Quick Start:
    - [ ] `nix run github:utensils/latentforge`
    - [ ] `nix run .`
    - [ ] `npm install -g .` or `npm run dev`
  - [ ] Replace `uvx latentforge` and `uv tool install latentforge` instructions with npm/nix instructions.
  - [ ] Update Development:
    - [ ] `nix develop`
    - [ ] `npm install`
    - [ ] `npm run dev`
    - [ ] `npm run typecheck`
    - [ ] `npm test`
    - [ ] `nix fmt`
  - [ ] Change `22 custom MCP tools` to `22 custom pi tools`.
  - [ ] Keep dataset config examples and workflow.
  - [ ] Update authentication section to pi SDK behavior:
    - [ ] `ANTHROPIC_API_KEY`
    - [ ] pi stored credentials/auth if applicable.
- [ ] Update `CLAUDE.md`:
  - [ ] Replace Python architecture with TypeScript architecture.
  - [ ] Replace commands with npm/nix commands.
  - [ ] Document pi SDK usage and custom tool registration.
  - [ ] Document TypeScript tool adding procedure.
  - [ ] Remove ruff/pyright/uv references.
- [ ] Update `.claude/settings.json` only if command permissions are no longer relevant; otherwise leave it.

## 10. Remove Python implementation after parity is reached

- [ ] Only after all TypeScript checks pass, remove:
  - [ ] `pyproject.toml`
  - [ ] `uv.lock`
  - [ ] `src/latentforge/__init__.py`
  - [ ] `src/latentforge/__main__.py`
  - [ ] `src/latentforge/agent.py`
  - [ ] `src/latentforge/prompts.py`
  - [ ] `src/latentforge/tools.py`
- [ ] Remove empty `src/latentforge/` directory if it is empty.
- [ ] Confirm `find . -name '*.py' -not -path './.git/*'` returns no application Python files.

## 11. Final acceptance criteria

- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes and creates executable `dist/cli.js`.
- [ ] `npm test` passes.
- [ ] `nix fmt` passes.
- [ ] `nix build` passes.
- [ ] `nix run . -- --help` works.
- [ ] `latentforge` launches an interactive pi SDK agent.
- [ ] The agent has built-in `read`, `write`, and `bash` tools enabled.
- [ ] The agent has all 22 LatentForge custom tools enabled.
- [ ] `/tools` shows the expected tool groups.
- [ ] `/config`, `/status`, `/cost`, `/model`, `/compact`, and `/export` work.
- [ ] Dataset config YAMLs remain backward-compatible.
- [ ] Existing dataset folders remain backward-compatible.
- [ ] No Python package/runtime files remain in the project.
