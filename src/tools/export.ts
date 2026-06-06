import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as yaml from "yaml";
import { Type } from "typebox";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Static } from "typebox";
import { IMAGE_EXTS } from "../image/constants.js";
import { createTool } from "./response.js";
import type { ToolDetails } from "../types.js";

// ─── ai-toolkit helpers ───────────────────────────────────────────────────────

/** Auto-detect ai-toolkit datasets directory. */
function detectAitkPath(): string {
  const env1 = process.env.DATASETS_FOLDER;
  if (env1) return env1;
  const env2 = process.env.AI_TOOLKIT_UI_DATA;
  if (env2) return path.join(env2, "datasets");
  const env3 = process.env.XDG_DATA_HOME;
  if (env3) return path.join(env3, "ai-toolkit", "datasets");
  return path.join(os.homedir(), ".local", "share", "ai-toolkit", "datasets");
}

/** Generate ai-toolkit YAML training config for macOS or Linux. */
function generateAitkConfig(
  name: string,
  triggerWord: string,
  folderPath: string,
  platform: string,
  resolution: number,
): string {
   /* ... same as before ... */
  const isMacos =
      platform === "macos" || (platform === "auto" && process.platform === "darwin");
  const config: Record<string, unknown> = {
      job: "extension",
      config: {
          name: name + "_lora_v1",
          process: [
                 {
                  type: "sd_trainer",
                  training_folder: folderPath,
                  device: isMacos ? "mps" : "cuda:0",
                  trigger_word: triggerWord,
                  network: { type: "lora", linear: 16, linear_alpha: 16 },
                  save: { dtype: isMacos ? "float32" : "bf16", save_every: 250, max_step_saves_to_keep: 3 },
                  datasets: [
                     {
                          folder_path: folderPath,
                          caption_ext: "txt",
                          caption_dropout_rate: 0.05,
                          shuffle_tokens: false,
                          cache_latents_to_disk: true,
                          resolution: isMacos ? [512, 768] : [512, 768, 1024],
                         },
                      ],
                  train: {
                      batch_size: 1,
                      steps: 2000,
                      gradient_accumulation_steps: 1,
                      train_unet: true,
                      train_text_encoder: false,
                      gradient_checkpointing: true,
                      noise_scheduler: "flowmatch",
                      optimizer: isMacos ? "adamw" : "adamw8bit",
                      lr: 0.0004,
                      ema_config: { use_ema: true, ema_decay: 0.99 },
                      dtype: isMacos ? "float32" : "bf16",
                        },
                  model: {
                      name_or_path: "black-forest-labs/FLUX.1-dev",
                      is_flux: true,
                      quantize: !isMacos,
                        },
                  sample: {
                      sampler: "flowmatch",
                      sample_every: 250,
                      width: Math.min(isMacos ? 768 : 1024, resolution),
                      height: Math.min(isMacos ? 768 : 1024, resolution),
                      prompts: [triggerWord, triggerWord + ", detailed high quality artwork"],
                      neg: "",
                      seed: 42,
                      walk_seed: true,
                      guidance_scale: 4,
                      sample_steps: 20,
                        },
                  },
                ],
              },
          };
  return yaml.stringify(config, { lineWidth: 0 });
}

// ─── Tool: export_dataset ────────────────────────────────────────────────────

const ExportDatasetParams = Type.Object({
  config_path: Type.String(),
  generate_config: Type.Optional(Type.String()),
  platform: Type.Optional(Type.String()),
  output_dir: Type.Optional(Type.String()),
});

type ExportDatasetParams = Static<typeof ExportDatasetParams>;

async function exportDataset(
  args: ExportDatasetParams,
): Promise<AgentToolResult<ToolDetails>> {
  const configPath = path.resolve(args.config_path);
  if (!fs.existsSync(configPath)) {
      throw new Error("Config not found: " + configPath);
         }

  const yamlText = fs.readFileSync(configPath, "utf-8");
  const yamlConfig = yaml.parse(yamlText) as Record<string, unknown>;

  const datasetName =
     String(yamlConfig.name ?? path.basename(configPath, path.extname(configPath)));
  const triggerWord = String(yamlConfig.trigger_word ?? "style");
  const categories: Record<string, string> = yamlConfig.categories
         ? yamlConfig.categories as Record<string, string>
         : {};
  const srcDir = path.resolve(
      String(
        yamlConfig.output_dir ?? "./datasets/" + datasetName,
           ),
         );
  const resolution =
       ((yamlConfig.curation as Record<string, unknown>)?.training_resolution as number) ?? 1024;
  const genConfig = String(args.generate_config ?? "true") === "true";
  const platform = String(args.platform ?? "auto");

  if (!fs.existsSync(srcDir)) {
      throw new Error("Source dataset directory not found: " + srcDir);
         }

  const explicitDir = String(args.output_dir ?? "").trim();
  let outDir: string;
  if (explicitDir && explicitDir.toLowerCase() !== "auto") {
      outDir = path.resolve(explicitDir);
         } else {
      outDir = path.join(detectAitkPath(), datasetName);
         }

  fs.mkdirSync(outDir, { recursive: true });

  let exported = 0;
  let captionsWritten = 0;
  let skipped = 0;

      // Walk category subdirectories
  if (Object.keys(categories).length > 0) {
      for (const catName of Object.keys(categories).sort()) {
        const catDir = path.join(srcDir, catName);
        if (!fs.existsSync(catDir) || !fs.statSync(catDir).isDirectory()) continue;

        const catDesc = categories[catName] ?? catName;
        const catEntries = fs.readdirSync(catDir, { withFileTypes: true });

        for (const entry of catEntries) {
          if (!entry.isFile()) continue;
          const ext = path.extname(entry.name).toLowerCase();
          if (!IMAGE_EXTS.has(ext)) continue;

          const srcPath = path.join(catDir, entry.name);
          const destPath = path.join(outDir, entry.name);

          if (fs.existsSync(destPath)) {
              skipped++;
              continue;
                }
          fs.copyFileSync(srcPath, destPath);
          exported++;

          const srcCaption = srcPath.replace(/\.(jpg|jpeg|png|webp)$/i, ".txt");
          const destCaption = destPath.replace(/\.(jpg|jpeg|png|webp)$/i, ".txt");
          if (fs.existsSync(srcCaption)) {
              fs.copyFileSync(srcCaption, destCaption);
                } else {
              fs.writeFileSync(destCaption, triggerWord + ", " + catDesc);
              captionsWritten++;
                }
            }
          }
         }

      // Also check for images directly under source dir
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      if (entry.isDirectory()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) continue;

      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(outDir, entry.name);

      if (fs.existsSync(destPath)) {
          skipped++;
          continue;
            }
      fs.copyFileSync(srcPath, destPath);
      exported++;

      const srcCaption = srcPath.replace(/\.(jpg|jpeg|png|webp)$/i, ".txt");
      const destCaption = destPath.replace(/\.(jpg|jpeg|png|webp)$/i, ".txt");
      if (fs.existsSync(srcCaption)) {
          fs.copyFileSync(srcCaption, destCaption);
            } else {
          fs.writeFileSync(destCaption, triggerWord);
          captionsWritten++;
            }
           }

  const lines: string[] = [
       "Exported " + exported + " images to ai-toolkit format",
       "    Output: " + outDir,
       "    Skipped: " + skipped + " (already exist)",
       "    Captions: " + captionsWritten + " generated (rest copied from source)",
        ];

  if (genConfig && exported > 0) {
      const configDir = path.join(path.dirname(path.dirname(outDir)), "config");
      if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
            }
      const configOutPath = path.join(configDir, datasetName + "_lora.yaml");
      const aitkYaml = generateAitkConfig(datasetName, triggerWord, outDir, platform, resolution);
      fs.writeFileSync(configOutPath, aitkYaml);
      lines.push("    Training config: " + configOutPath);
         }

  return {
       content: [{ type: "text", text: lines.join("\n") }],
        details: { ok: true },
          };
}

// ─── Tool Definition ────────────────────────────────────────────────────────

export const exportDatasetTool = createTool({
  name: "export_dataset",
  label: "Export Dataset",
  description: "Export curated dataset to ai-toolkit format (flat directory of image + caption pairs).",
  parameters: ExportDatasetParams,
  handler: exportDataset,
});
