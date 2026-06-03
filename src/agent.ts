import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "readline";
import yaml from "yaml";
import type { DatasetConfig } from "./types.js";
import { buildSystemPrompt } from "./prompts.js";
import { ALL_TOOLS, ALL_TOOL_NAMES } from "./tools/index.js";

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL_CONTEXT: Record<string, number> = {
    "claude-sonnet-4-5": 200_000,
    "claude-opus-4-6": 200_000,
    "claude-haiku-4-5": 200_000,
};
const DEFAULT_CONTEXT = 200_000;
const AUTO_COMPACT_PCT = 75;
const SPINNER_FRAMES = ["\u{2312}", "\u{2311}", "\u{2317}", "\u{2310}"];

// ── Session Stats ────────────────────────────────────────────────────────────

interface TokenStats {
    model: string;
    configPath: string | null;
    totalCost: number;
    turnCount: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreateTokens: number;
    contextWindow: number;
    sessionId: string | null;
    _startTime: number;
}

function createTokenStats(model: string, configPath: string | null): TokenStats {
    return {
        model,
        configPath,
        totalCost: 0,
        turnCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
        contextWindow: MODEL_CONTEXT[model] ?? DEFAULT_CONTEXT,
        sessionId: null,
        _startTime: performance.now(),
    };
}

function fmtTokens(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
    return String(n);
}

// ── Auth Info ────────────────────────────────────────────────────────────────

function authInfo(): [string, string] {
    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    const oauth = process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "";
    if (apiKey) {
        const masked = apiKey.length > 12 ? apiKey.slice(0, 8) + "..." + apiKey.slice(-4) : "***";
        return ["API Key", masked];
    }
    if (oauth) {
        const masked = oauth.length > 12 ? oauth.slice(0, 8) + "..." + oauth.slice(-4) : "***";
        return ["OAuth", masked];
    }
    return ["None", "set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN"];
}

// ── Slash Commands ───────────────────────────────────────────────────────────

const AVAILABLE_MODELS = ["claude-sonnet-4-5", "claude-opus-4-6", "claude-haiku-4-5"];

async function printHelp(): Promise<void> {
    console.log();
    console.log("\x1B[1m" + "Commands" + "\x1B[0m");
    console.log("   \x1B[1m/help\x1B[0m              Show this help");
    console.log("   \x1B[1m/config\x1B[0m            Show active dataset config");
    console.log("   \x1B[1m/tools\x1B[0m             List available agent tools");
    console.log("   \x1B[1m/cost\x1B[0m              Show session cost");
    console.log("   \x1B[1m/status\x1B[0m            Show session status and context usage");
    console.log("   \x1B[1m/export\x1B[0m [path]   Export dataset to ai-toolkit format");
    console.log("   \x1B[1m/model\x1B[0m [name]    Switch Claude model (forks session)");
    console.log("   \x1B[1m/compact\x1B[0m           Compact context (summarize + fresh session)");
    console.log("   \x1B[1m/clear\x1B[0m             Clear screen");
    console.log("   \x1B[1m/quit\x1B[0m              Exit the agent");
    console.log("\x1B[2m" + "Everything else is sent to the agent as a message.\x1B[0m");
}

async function handleSlashCommand(
    cmd: string,
    stats: TokenStats,
): Promise<"quit" | null> {
    const parts = cmd.trim().split(/\s+/, 2);
    const name = (parts[0] ?? "").toLowerCase();
    const arg = parts[1] ?? undefined;

    switch (name) {
        case "/help":
        case "/h": {
            await printHelp();
            return null;
        }
        case "/config": {
            if (!stats.configPath) {
                console.log();
                console.log("\x1B[2m" + "No config loaded. Ask the agent to create one, or relaunch with --config.\x1B[0m" + "\n");
                return null;
            }
            try {
                const yamlText = fs.readFileSync(stats.configPath, "utf-8");
                const config = yaml.parse(yamlText) as DatasetConfig;
                console.log();
                console.log("   --- " + stats.configPath + " ---");
                console.log(yamlText);
            } catch {
                console.log();
                console.log("\x1B[31m" + "   Config not found: " + stats.configPath + "\x1B[0m" + "\n");
            }
            return null;
        }
        case "/tools": {
            console.log();
            console.log("\x1B[1m" + "Dataset Tools" + "\x1B[0m" + " \x1B[2m" + "(22 pi custom tools)" + "\x1B[0m");
            console.log();
            const groups: Record<string, string[]> = {
                Config: ["create_config", "read_config", "update_config", "list_configs"],
                Search: ["search_bing", "search_wikimedia"],
                Download: ["download_images", "download_gallery"],
                Browse: ["list_images", "get_image_info"],
                Organize: ["move_images", "organize_images"],
                Quality: ["analyze_quality", "find_duplicates", "detect_screenshots"],
                Cropping: ["crop_center", "crop_smart", "crop_faces"],
                Faces: ["detect_faces"],
                Training: ["resize_images", "write_caption"],
                Export: ["export_dataset"],
            };
            for (const [group, tools] of Object.entries(groups)) {
                console.log(
                    "   \x1B[1m" + group.padEnd(10) + "\x1B[0m    " + tools.join("\x1B[2m" + ", " + "\x1B[0m"),
                );
            }
            console.log();
            console.log("   \x1B[2m" + "Plus built-in: Read (vision), Write, Bash" + "\x1B[0m");
            console.log();
            return null;
        }
        case "/cost": {
            console.log();
            console.log("   \x1B[2mSession cost:\x1B[0m \x1B[32m$" + stats.totalCost.toFixed(4) + "\x1B[0m");
            console.log("   \x1B[2mTurns:\x1B[0m " + stats.turnCount);
            console.log();
            return null;
        }
        case "/status": {
            const [authMethod] = authInfo();
            const ctxUsed = stats.inputTokens + stats.outputTokens;
            const pct = stats.contextWindow > 0 ? (ctxUsed / stats.contextWindow) * 100 : 0;
            const pctStyle = pct >= 90 ? "\x1B[31m" : pct >= 70 ? "\x1B[33m" : "\x1B[32m";
            const elapsed = (performance.now() - stats._startTime) / 1000;
            const mins = Math.floor(elapsed / 60);
            const secs = Math.floor(elapsed % 60);
            console.log();
            console.log("   \x1B[2mAuth:\x1B[0m         " + authMethod);
            console.log("   \x1B[2mModel:\x1B[0m        " + stats.model);
            console.log("   \x1B[2mConfig:\x1B[0m       " + (stats.configPath ?? "none"));
            console.log("   \x1B[2mSession:\x1B[0m      " + (stats.sessionId ?? "pending"));
            console.log("   \x1B[2mCompact:\x1B[0m   client-side (auto at " + AUTO_COMPACT_PCT + "%)");
            console.log("   \x1B[2mTurns:\x1B[0m       " + stats.turnCount);
            console.log("   \x1B[2mCost:\x1B[0m         $" + stats.totalCost.toFixed(4));
            console.log("   \x1B[2mUptime:\x1B[0m      " + mins + "m " + secs + "s");
            console.log();
            console.log(
                "   \x1B[2mContext:\x1B[0m       [" +
                    pctStyle +
                    fmtTokens(ctxUsed) +
                    "\x1B[0m" +
                    " / " +
                    fmtTokens(stats.contextWindow) +
                    " (" +
                    pct.toFixed(0) +
                    "%)" +
                    "\x1B[0m",
                );
            console.log("   \x1B[2m  Input:\x1B[0m      " + fmtTokens(stats.inputTokens));
            console.log("   \x1B[2m  Output:\x1B[0m     " + fmtTokens(stats.outputTokens));
            if (stats.cacheReadTokens > 0) {
                console.log(
                    "   \x1B[2m  Cached:\x1B[0m     " +
                        fmtTokens(stats.cacheReadTokens) +
                        " read, " +
                        fmtTokens(stats.cacheCreateTokens) +
                        " created",
                    );
            }
            console.log();
            return null;
        }
        case "/model": {
            if (!arg) {
                console.log();
                console.log("   \x1B[2mCurrent model:\x1B[0m \x1B[1m" + stats.model + "\x1B[0m");
                console.log();
                console.log("   \x1B[2mAvailable models:\x1B[0m");
                for (const m of AVAILABLE_MODELS) {
                    console.log("     " + m + (m === stats.model ? " \x1B[32m<\x1B[0m" : ""));
                }
                console.log();
                console.log("   \x1B[2mUsage: /model claude-opus-4-6\x1B[0m");
                console.log();
                return null;
            }
            const model = arg.trim();
            if (!AVAILABLE_MODELS.includes(model)) {
                console.log("\x1B[33m" + "   Unknown model: " + model + "\x1B[0m");
                console.log("   \x1B[2mAvailable: " + AVAILABLE_MODELS.join(", ") + "\x1B[0m");
                return null;
            }
            if (model === stats.model) {
                console.log("   \x1B[2mAlready using " + model + "\x1B[0m");
                return null;
            }
            // Model change handled externally
            console.log("   \x1B[2mSwitching to " + model + "...\x1B[0m");
            return null;
        }
        case "/export": {
            if (!stats.configPath) {
                console.log();
                console.log("\x1B[33m" + "   No config loaded. Pass --config or ask the agent to export.\x1B[0m" + "\n");
                return null;
            }
            console.log("   \x1B[2mExport triggered for " + stats.configPath + "\x1B[0m");
            return null;
        }
        case "/compact": {
            if (stats.turnCount < 1) {
                console.log("   \x1B[33m" + "   No conversation to compact yet.\x1B[0m");
                return null;
            }
            console.log("   \x1B[2mCompacting...\x1B[0m");
            return null;
        }
        case "/clear": {
            process.stdout.write("\x1Bc");
            return null;
        }
        case "/quit":
        case "/q":
        case "/exit": {
            return "quit";
        }
        default: {
            if (name.startsWith("/")) {
                console.log(
                    "\x1B[33m" +
                        "   Unknown command: " +
                        name +
                        "\x1B[0m" +
                        " -- type \x1B[1m/help\x1B[0m for commands",
                    );
                return null;
            }
            break;
        }
    }
    return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
    // ── Arg parsing ──────────────────────────────────────────────────
    const args: Record<string, string | undefined> = {};
    for (let i = 2; i < process.argv.length; i++) {
        if (process.argv[i] === "--config" && i + 1 < process.argv.length) {
            args.config = process.argv[++i];
        } else if (process.argv[i] === "--model" && i + 1 < process.argv.length) {
            args.model = process.argv[++i];
        }
    }

    const configPath = args.config ?? undefined;
    const modelId = args.model ?? "claude-sonnet-4-5";

    // ── Load config name for banner ─────────────────────────────────
    let configName: string | undefined;
    if (configPath) {
        const pp = path.resolve(configPath);
        if (fs.existsSync(pp)) {
            try {
                const cfgText = fs.readFileSync(pp, "utf-8");
                const cfg = yaml.parse(cfgText) as DatasetConfig;
                configName = cfg.name ?? path.basename(pp, path.extname(pp));
            } catch {
                // skip
            }
        }
    }

    // ── Banner ───────────────────────────────────────────────────────
    const [authMethod, authDetail] = authInfo();
    const authStyle = authMethod !== "None" ? "\x1B[32m" : "\x1B[33m";

    console.log();
    console.log("\x1B[1mLatentForge\x1B[0m");
    console.log("\x1B[2m" + "─".repeat(50) + "\x1B[0m");
    console.log("  Auth       " + authStyle + authMethod + "\x1B[0m" + " \x1B[2m" + authDetail + "\x1B[0m");
    console.log("  Model      " + modelId);
    if (configPath && configName) {
        console.log("  Config     \x1B[36m" + configName + "\x1B[0m" + " \x1B[2m" + "(" + configPath + ")" + "\x1B[0m");
    } else {
        console.log("  Config    \x1B[2mnone -- pass --config or ask me to create one\x1B[0m");
    }
    console.log(" \x1B[2m" + "─".repeat(50) + "\x1B[0m");
    console.log("   \x1B[2mType /help for commands, Ctrl+C to exit\x1B[0m");
    console.log();

    // ── Create session stats ─────────────────────────────────────────
    const stats = createTokenStats(modelId, configPath ?? null);

    // ── Note: pi SDK session would be created here ─────────────────────
    // TODO: Implement full pi SDK agent session with:
    //   - createAgentSession() with custom tools
    //   - Interactive REPL loop with readline
    //   - Slash command handling
    //   - Auto-compact at 75% context usage

    console.log("   \x1B[2mSession initialized. Waiting for your message...\x1B[0m");
    console.log();

    // Create readline for interactive mode
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "\x1B[1m>\x1B[0m ",
    });

    rl.on("line", (line: string) => {
        const input = line.trim();
        if (!input) {
            rl.prompt();
            return;
        }

        if (input === "/quit" || input === "/exit") {
            rl.close();
            console.log(
                "\x1B[2m" +
                    "Goodbye! Session cost: $" +
                    stats.totalCost.toFixed(4) +
                    " across " +
                    stats.turnCount +
                    " turns\x1B[0m",
                );
            process.exit(0);
        } else if (input.startsWith("/")) {
            handleSlashCommand(input, stats).then(() => rl.prompt());
        } else {
            console.log("   \x1B[2m[stub] Sending to agent: " + input + "\x1B[0m");
            rl.prompt();
        }
    });

    rl.prompt();
}
