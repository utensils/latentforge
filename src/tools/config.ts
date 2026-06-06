import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "yaml";
import { Type } from "typebox";

import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Static } from "typebox";
import type { ToolDetails } from "../types.js";
import { createTool } from "./response.js";

// ─── Schemas ────────────────────────────────────────────────────────────────

const CreateConfigParams = Type.Object({
  name: Type.String(),
  subject: Type.String(),
  trigger_word: Type.String(),
  output_dir: Type.String(),
  categories: Type.String(),
});

type CreateConfigParams = Static<typeof CreateConfigParams>;

const ReadConfigParams = Type.Object({
  path: Type.String(),
});

type ReadConfigParams = Static<typeof ReadConfigParams>;

const UpdateConfigParams = Type.Object({
  path: Type.String(),
  updates: Type.String(),
});

type UpdateConfigParams = Static<typeof UpdateConfigParams>;

const ListConfigParams = Type.Object({});

type ListConfigParams = Static<typeof ListConfigParams>;

// ─── Tool Implementations ───────────────────────────────────────────────────

async function createConfig(
  args: CreateConfigParams,
): Promise<AgentToolResult<ToolDetails>> {
  const name = args.name;
  const subject = args.subject;
  const triggerWord = args.trigger_word ?? "";
  const outputDir = args.output_dir ?? "";
  const categoriesJson = args.categories ?? "";

  const configDir = "configs";
  fs.mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, name + ".yaml");

  if (fs.existsSync(configPath)) {
    throw new Error(
      "Config " + configPath + " already exists. Use update_config to modify it.",
    );
  }

  let categories: Record<string, string> = {};
  try {
    categories = JSON.parse(categoriesJson) as Record<string, string>;
  } catch {
    throw new Error(
      "categories must be a JSON object, e.g. '{\"logos\": \"Band logos\"}'",
    );
  }

  const config: Record<string, unknown> = {
    name,
    subject,
    trigger_word: triggerWord,
    output_dir: outputDir,
    search_queries: Object.fromEntries(
      Object.keys(categories).map((cat) => [cat, []]),
    ),
    categories,
    curation: {
      target_count: "50-150",
      min_resolution: 512,
      training_resolution: 1024,
    },
  };

  const yamlText = yaml.stringify(config, {
    lineWidth: 0,
  });

  fs.writeFileSync(configPath, yamlText);

  return {
    content: [
      {
        type: "text",
        text: "Created config: " + configPath + "\n\n" + yamlText,
      },
    ],
    details: { ok: true, path: configPath },
  };
}

async function readConfig(
  args: ReadConfigParams,
): Promise<AgentToolResult<ToolDetails>> {
  const configPath = args.path;

  if (!fs.existsSync(configPath)) {
    throw new Error("Config not found: " + configPath);
  }

  const yamlText = fs.readFileSync(configPath, "utf-8");
  const parsed = yaml.parse(yamlText);
  const newYaml = yaml.stringify(parsed, { lineWidth: 0 });

  return {
    content: [{ type: "text", text: newYaml }],
    details: { ok: true, path: configPath },
  };
}

async function updateConfig(
  args: UpdateConfigParams,
): Promise<AgentToolResult<ToolDetails>> {
  const configPath = args.path;
  const updatesJson = args.updates;

  if (!fs.existsSync(configPath)) {
    throw new Error("Config not found: " + configPath);
  }

  const yamlText = fs.readFileSync(configPath, "utf-8");
  const config = yaml.parse(yamlText) as Record<string, unknown>;

  let updates: Record<string, unknown>;
  try {
    updates = JSON.parse(updatesJson) as Record<string, unknown>;
  } catch {
    throw new Error("updates must be a JSON object");
  }

  function deepMerge(
    base: Record<string, unknown>,
    upd: Record<string, unknown>,
  ) {
    for (const [key, value] of Object.entries(upd)) {
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        typeof base[key] === "object" &&
        base[key] !== null &&
        !Array.isArray(base[key])
      ) {
        deepMerge(base[key] as Record<string, unknown>, value as Record<string, unknown>);
      } else {
        (base as Record<string, unknown>)[key] = value;
      }
    }
  }

  deepMerge(config, updates);

  const newYaml = yaml.stringify(config, { lineWidth: 0 });

  fs.writeFileSync(configPath, newYaml);

  return {
    content: [
      { type: "text", text: "Updated " + configPath + ":\n\n" + newYaml },
    ],
    details: { ok: true, path: configPath },
  };
}

async function listConfigs(
  _args: ListConfigParams,
): Promise<AgentToolResult<ToolDetails>> {
  const configDir = "configs";

  if (!fs.existsSync(configDir)) {
    return {
      content: [{ type: "text", text: "No configs/ directory found." }],
      details: { ok: true },
    };
  }

  const entries = fs.readdirSync(configDir);
  const configs = entries.filter(
    (e) => e.endsWith(".yaml") || e.endsWith(".yml"),
  );

  if (configs.length === 0) {
    return {
      content: [{ type: "text", text: "No config files found in configs/" }],
      details: { ok: true },
    };
  }

  configs.sort();
  const lines: string[] = [];
  for (const cfgName of configs) {
    const cfgPath = configDir + "/" + cfgName;
    const content = fs.readFileSync(cfgPath, "utf-8");
    const cfg = yaml.parse(content) as Record<string, unknown>;
    const cfgName2 = (cfg.name as string) ?? cfgName.replace(/\.(yaml|yml)$/, "");
    const subject = (cfg.subject as string) ?? "unknown";
    lines.push(
      "  " + cfgPath + " \u2014 " + cfgName2 + ": " + subject,
    );
  }

  return {
    content: [
      {
        type: "text",
        text: "Available configs:\n" + lines.join("\n"),
      },
    ],
    details: { ok: true },
  };
}

// ─── Tool Definitions ───────────────────────────────────────────────────────

export const createConfigTool = createTool({
  name: "create_config",
  label: "Create Config",
  description:
    "Create a new dataset YAML config file with name, subject, trigger word, output dir, and categories.",
  parameters: CreateConfigParams,
  handler: createConfig,
});

export const readConfigTool = createTool({
  name: "read_config",
  label: "Read Config",
  description: "Load and return a dataset YAML config by path.",
  parameters: ReadConfigParams,
  handler: readConfig,
});

export const updateConfigTool = createTool({
  name: "update_config",
  label: "Update Config",
  description: "Update fields in a dataset YAML config file.",
  parameters: UpdateConfigParams,
  handler: updateConfig,
});

export const listConfigsTool = createTool({
  name: "list_configs",
  label: "List Configs",
  description: "List available dataset configs in configs/ directory.",
  parameters: ListConfigParams,
  handler: listConfigs,
});
