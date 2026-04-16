#!/usr/bin/env python3
"""LatentForge — Interactive CLI for building image training datasets."""

import argparse
import asyncio
import os
import readline
import sys
import time
from pathlib import Path

import yaml
from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    TextBlock,
    ToolUseBlock,
    create_sdk_mcp_server,
)
from rich.console import Console
from rich.markdown import Markdown
from rich.syntax import Syntax
from rich.theme import Theme

from latentforge.prompts import build_system_prompt
from latentforge.tools import ALL_TOOLS

# ── Console ─────────────────────────────────────────────────────────────────

_theme = Theme(
    {
        "info": "dim",
        "tool": "dim magenta",
        "success": "green",
        "warning": "yellow",
        "error": "red",
    }
)
console = Console(theme=_theme, highlight=False)

# ── ANSI (for spinner on stderr) ────────────────────────────────────────────

DIM = "\033[2m"
BOLD = "\033[1m"
RESET = "\033[0m"
CYAN = "\033[36m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
CLEAR_LINE = "\033[2K\r"

SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

# Context window size by model (tokens)
MODEL_CONTEXT = {
    "claude-sonnet-4-5": 200_000,
    "claude-sonnet-4-6": 200_000,
    "claude-opus-4-6": 200_000,
    "claude-opus-4-7": 200_000,
    "claude-haiku-4-5": 200_000,
}
DEFAULT_CONTEXT = 200_000

# Auto-compact when context usage reaches this percentage (OpenCode uses 75%)
AUTO_COMPACT_PCT = 75

COMPACTION_SUMMARY_PROMPT = (
    "Provide a detailed summary of our entire conversation so far. Include:\n"
    "1. What dataset(s) we're working on and their current state\n"
    "2. Key actions taken (searches, downloads, curation, organization)\n"
    "3. Image counts per category and overall progress\n"
    "4. Any pending tasks, decisions, or issues\n"
    "5. Important user preferences or instructions mentioned\n\n"
    "Be thorough but concise — this summary replaces the full conversation history."
)


# ── Session Stats ───────────────────────────────────────────────────────────


class SessionStats:
    """Track token usage, cost, and session metadata."""

    def __init__(self, model: str, config_path: str | None):
        self.model = model
        self.config_path = config_path
        self.total_cost = 0.0
        self.turn_count = 0
        self.input_tokens = 0
        self.output_tokens = 0
        self.cache_read_tokens = 0
        self.cache_create_tokens = 0
        self.context_window = MODEL_CONTEXT.get(model, DEFAULT_CONTEXT)
        self.session_id: str | None = None
        self._start_time = time.monotonic()

    def update_from_result(self, msg: ResultMessage):
        """Extract token usage and cost from a ResultMessage."""
        self.total_cost += msg.total_cost_usd or 0.0
        self.turn_count += 1
        if msg.session_id:
            self.session_id = msg.session_id
        usage = msg.usage or {}
        self.input_tokens = usage.get("input_tokens", usage.get("prompt_tokens", self.input_tokens))
        self.output_tokens += usage.get("output_tokens", usage.get("completion_tokens", 0))
        self.cache_read_tokens = usage.get("cache_read_input_tokens", self.cache_read_tokens)
        self.cache_create_tokens = usage.get(
            "cache_creation_input_tokens", self.cache_create_tokens
        )

    def reset_tokens(self):
        """Reset token counters after compaction (cost/turns preserved)."""
        self.input_tokens = 0
        self.output_tokens = 0
        self.cache_read_tokens = 0
        self.cache_create_tokens = 0
        self.session_id = None

    @property
    def context_used(self) -> int:
        """Approximate tokens used in current context."""
        return self.input_tokens + self.output_tokens

    @property
    def context_pct(self) -> float:
        """Percentage of context window used."""
        return (self.context_used / self.context_window) * 100 if self.context_window else 0

    @property
    def context_remaining(self) -> int:
        return max(0, self.context_window - self.context_used)

    @property
    def uptime(self) -> str:
        elapsed = time.monotonic() - self._start_time
        mins = int(elapsed // 60)
        secs = int(elapsed % 60)
        return f"{mins}m {secs}s"

    def context_bar(self) -> str:
        """Render a compact context usage line for display below the prompt."""
        used = self.context_used
        pct = self.context_pct

        # Color based on usage
        if pct >= 90:
            color = "\033[31m"  # red
        elif pct >= 70:
            color = YELLOW
        else:
            color = DIM

        return (
            f"{color}"
            f"{_fmt_tokens(used)}/{_fmt_tokens(self.context_window)} tokens"
            f" ({pct:.0f}%)"
            f" · ${self.total_cost:.4f}"
            f" · turn {self.turn_count}"
            f"{RESET}"
        )


def _fmt_tokens(n: int) -> str:
    """Format token count: 1234 -> '1.2k', 150000 -> '150k'."""
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}k"
    return str(n)


# ── Auth ────────────────────────────────────────────────────────────────────


def _auth_info() -> tuple[str, str]:
    """Detect which auth method the SDK will use. Returns (method, detail)."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    oauth = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN", "")
    if api_key:
        masked = api_key[:8] + "..." + api_key[-4:] if len(api_key) > 12 else "***"
        return "API Key", masked
    if oauth:
        masked = oauth[:8] + "..." + oauth[-4:] if len(oauth) > 12 else "***"
        return "OAuth", masked
    return "None", "set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN"


# ── Banner ──────────────────────────────────────────────────────────────────


def _banner(model: str, config_path: str | None, config_name: str | None):
    """Print startup banner."""
    auth_method, auth_detail = _auth_info()
    auth_style = "success" if auth_method != "None" else "warning"
    w = min(console.width, 50)
    rule = "─" * w

    console.print()
    console.print("[bold]LatentForge[/bold]")
    console.print(f"[dim]{rule}[/dim]")
    console.print(f"  Auth    [{auth_style}]{auth_method}[/{auth_style}] [dim]{auth_detail}[/dim]")
    console.print(f"  Model   {model}")
    if config_path and config_name:
        console.print(f"  Config  [cyan]{config_name}[/cyan] [dim]({config_path})[/dim]")
    else:
        console.print("  Config  [dim]none — pass --config or ask me to create one[/dim]")
    console.print(f"[dim]{rule}[/dim]")
    console.print("  [dim]Type /help for commands, Ctrl+C to exit[/dim]")
    console.print()


# ── Spinner ─────────────────────────────────────────────────────────────────


class Spinner:
    """Async spinner that runs while the agent is thinking."""

    def __init__(self, label: str = "Thinking"):
        self._label = label
        self._task: asyncio.Task | None = None
        self._active = False

    async def _spin(self):
        i = 0
        while self._active:
            frame = SPINNER_FRAMES[i % len(SPINNER_FRAMES)]
            elapsed = time.monotonic() - self._start
            sys.stderr.write(
                f"{CLEAR_LINE}{DIM}{CYAN}{frame}{RESET}{DIM} {self._label} ({elapsed:.0f}s){RESET}"
            )
            sys.stderr.flush()
            i += 1
            await asyncio.sleep(0.08)
        sys.stderr.write(CLEAR_LINE)
        sys.stderr.flush()

    def start(self, label: str | None = None):
        if label:
            self._label = label
        self._active = True
        self._start = time.monotonic()
        self._task = asyncio.create_task(self._spin())

    async def stop(self):
        self._active = False
        if self._task:
            await self._task
            self._task = None


# ── Response Rendering ──────────────────────────────────────────────────────


async def _print_response(
    client: ClaudeSDKClient,
    spinner: Spinner,
    stats: SessionStats,
    silent: bool = False,
) -> str:
    """Consume and print agent response. Updates stats from ResultMessage.

    Args:
        silent: If True, suppress output (used during compaction to capture summary).

    Returns:
        Collected text content from the response.
    """
    first_text = True
    collected: list[str] = []

    async for msg in client.receive_messages():
        if isinstance(msg, AssistantMessage):
            for block in msg.content:
                if isinstance(block, TextBlock):
                    collected.append(block.text)
                    if not silent:
                        if first_text:
                            await spinner.stop()
                            first_text = False
                        console.print(Markdown(block.text))
                elif isinstance(block, ToolUseBlock):
                    if not silent:
                        await spinner.stop()
                        console.print(f"  [tool]▸ {block.name}[/tool]")
                        spinner.start("Working")
        elif isinstance(msg, ResultMessage):
            await spinner.stop()
            stats.update_from_result(msg)
            break

    return "\n\n".join(collected)


# ── Client-Side Compaction ──────────────────────────────────────────────────


async def _compact_session(
    client: ClaudeSDKClient,
    spinner: Spinner,
    stats: SessionStats,
    system_prompt: str,
    model: str,
    server,
    auto: bool = False,
) -> int:
    """Client-side context compaction (works with both OAuth and API key).

    1. Ask the agent to summarize the conversation
    2. Capture the summary text (silently if auto-triggered)
    3. Disconnect and start a fresh session
    4. Inject the summary as initial context

    Returns the old token count (for reporting savings).
    """
    old_tokens = stats.context_used
    label = "Auto-compacting" if auto else "Compacting"

    if auto:
        console.print(
            f"\n  [warning]Context at {stats.context_pct:.0f}% — auto-compacting...[/warning]"
        )

    # Step 1: Ask agent to summarize (silently for auto, visible for manual)
    spinner.start(f"{label}: summarizing")
    await client.query(COMPACTION_SUMMARY_PROMPT)
    summary = await _print_response(client, spinner, stats, silent=auto)

    if not summary.strip():
        summary = "(No summary available — session was empty or summary failed.)"

    # Step 2: Disconnect current session
    await client.disconnect()

    # Step 3: Reset token counters
    stats.reset_tokens()

    # Step 4: Start fresh session (no resume — clean slate)
    opts = _build_options(system_prompt, model, server)
    await client.connect(opts)

    # Step 5: Inject summary as initial context
    spinner.start(f"{label}: resuming")
    await client.query(
        f"[Context compacted from previous session]\n\n"
        f"## Session Summary\n\n{summary}\n\n"
        f"---\n\n"
        f"Session compacted successfully. Briefly confirm you remember the context "
        f"and are ready to continue."
    )
    await _print_response(client, spinner, stats)

    return old_tokens


# ── Slash Commands ──────────────────────────────────────────────────────────

SLASH_COMMANDS = [
    "/help",
    "/config",
    "/tools",
    "/cost",
    "/status",
    "/model",
    "/export",
    "/compact",
    "/clear",
    "/quit",
    "/exit",
]

AVAILABLE_MODELS = [
    "claude-sonnet-4-5",
    "claude-opus-4-6",
    "claude-haiku-4-5",
]


def _setup_readline():
    """Configure readline with tab completion for slash commands."""

    def completer(text: str, state: int) -> str | None:
        if text.startswith("/"):
            matches = [c for c in SLASH_COMMANDS if c.startswith(text)]
        else:
            return None
        return matches[state] if state < len(matches) else None

    readline.set_completer(completer)
    readline.set_completer_delims(" \t\n")
    if "libedit" in (readline.__doc__ or ""):
        readline.parse_and_bind("bind ^I rl_complete")
    else:
        readline.parse_and_bind("tab: complete")


# Sentinels to signal requests from slash commands to the main loop
class _CompactRequest(Exception):
    pass


class _ModelChangeRequest(Exception):
    def __init__(self, model: str):
        self.model = model


class _ExportRequest(Exception):
    def __init__(self, output_dir: str | None = None):
        self.output_dir = output_dir


class SlashCommands:
    """Local slash commands that don't hit the API."""

    def __init__(self, stats: SessionStats):
        self.stats = stats

    def handle(self, cmd: str) -> bool:
        """Handle a slash command. Returns True if handled."""
        parts = cmd.strip().split(None, 1)
        name = parts[0].lower()
        arg = parts[1] if len(parts) > 1 else None

        # Commands that take arguments
        if name == "/model":
            self._model(arg)
            return True
        if name == "/export":
            self._export(arg)
            return True

        handler = {
            "/help": self._help,
            "/h": self._help,
            "/cost": self._cost,
            "/config": self._config,
            "/tools": self._tools,
            "/status": self._status,
            "/compact": self._compact,
            "/clear": self._clear,
            "/quit": self._quit,
            "/q": self._quit,
            "/exit": self._quit,
        }.get(name)

        if handler:
            handler()
            return True
        if name.startswith("/"):
            console.print(
                f"  [warning]Unknown command: {name}[/warning]"
                " — type [bold]/help[/bold] for commands"
            )
            return True
        return False

    def _help(self):
        console.print()
        console.print("[bold]Commands[/bold]")
        console.print("  [bold]/help[/bold]              Show this help")
        console.print("  [bold]/config[/bold]            Show active dataset config")
        console.print("  [bold]/tools[/bold]             List available agent tools")
        console.print("  [bold]/cost[/bold]              Show session cost")
        console.print("  [bold]/status[/bold]            Show session status and context usage")
        console.print(
            "  [bold]/export[/bold] [dim][path][/dim]   Export dataset to ai-toolkit format"
        )
        console.print(
            "  [bold]/model[/bold] [dim]<name>[/dim]    Switch Claude model (forks session)"
        )
        console.print(
            "  [bold]/compact[/bold]           Compact context (summarize + fresh session)"
        )
        console.print("  [bold]/clear[/bold]             Clear screen")
        console.print("  [bold]/quit[/bold]              Exit the agent")
        console.print()
        console.print("[dim]Everything else is sent to the agent as a message.[/dim]")

    def _cost(self):
        s = self.stats
        console.print()
        console.print(f"  [dim]Session cost:[/dim] [success]${s.total_cost:.4f}[/success]")
        console.print(f"  [dim]Turns:[/dim] {s.turn_count}")
        console.print()

    def _config(self):
        if not self.stats.config_path:
            console.print(
                "\n  [dim]No config loaded. Ask the agent to create one,"
                " or relaunch with --config.[/dim]\n"
            )
            return
        try:
            text = Path(self.stats.config_path).read_text()
            console.print(f"\n[dim]── {self.stats.config_path} ──[/dim]")
            console.print(Syntax(text, "yaml", theme="monokai", padding=1))
            console.print()
        except FileNotFoundError:
            console.print(f"\n  [error]Config not found: {self.stats.config_path}[/error]\n")

    def _tools(self):
        console.print()
        console.print("[bold]Dataset Tools[/bold] [dim](22 MCP tools)[/dim]")
        console.print()
        groups = {
            "Config": ["create_config", "read_config", "update_config", "list_configs"],
            "Search": ["search_bing", "search_wikimedia"],
            "Download": ["download_images", "download_gallery"],
            "Browse": ["list_images", "get_image_info"],
            "Organize": ["move_images", "organize_images"],
            "Quality": ["analyze_quality", "find_duplicates", "detect_screenshots"],
            "Cropping": ["crop_center", "crop_smart", "crop_faces"],
            "Faces": ["detect_faces"],
            "Training": ["resize_images", "write_caption"],
            "Export": ["export_dataset"],
        }
        for group, tools in groups.items():
            names = "[dim],[/dim] ".join(tools)
            console.print(f"  [bold]{group:10}[/bold]  {names}")
        console.print()
        console.print("  [dim]Plus built-in: Read (vision), Write, Bash[/dim]")
        console.print()

    def _status(self):
        s = self.stats
        auth_method, _ = _auth_info()
        pct = s.context_pct
        if pct >= 90:
            ctx_style = "error"
        elif pct >= 70:
            ctx_style = "warning"
        else:
            ctx_style = "success"
        console.print()
        console.print(f"  [dim]Auth:[/dim]      {auth_method}")
        console.print(f"  [dim]Model:[/dim]     {s.model}")
        console.print(f"  [dim]Config:[/dim]    {s.config_path or 'none'}")
        console.print(f"  [dim]Session:[/dim]   {s.session_id or 'pending'}")
        console.print(f"  [dim]Compact:[/dim]   client-side (auto at {AUTO_COMPACT_PCT}%)")
        console.print(f"  [dim]Turns:[/dim]     {s.turn_count}")
        console.print(f"  [dim]Cost:[/dim]      ${s.total_cost:.4f}")
        console.print(f"  [dim]Uptime:[/dim]    {s.uptime}")
        console.print()
        ctx = _fmt_tokens(s.context_used)
        win = _fmt_tokens(s.context_window)
        console.print(
            f"  [dim]Context:[/dim]   [{ctx_style}]{ctx}[/{ctx_style}] / {win} ({pct:.0f}%)"
        )
        console.print(f"  [dim]  Input:[/dim]   {_fmt_tokens(s.input_tokens)}")
        console.print(f"  [dim]  Output:[/dim]  {_fmt_tokens(s.output_tokens)}")
        if s.cache_read_tokens:
            cr = _fmt_tokens(s.cache_read_tokens)
            cc = _fmt_tokens(s.cache_create_tokens)
            console.print(f"  [dim]  Cached:[/dim]  {cr} read, {cc} created")
        console.print()

    def _model(self, arg: str | None):
        if not arg:
            console.print()
            console.print(f"  [dim]Current model:[/dim] [bold]{self.stats.model}[/bold]")
            console.print()
            console.print("  [dim]Available models:[/dim]")
            for m in AVAILABLE_MODELS:
                marker = " [success]◂[/success]" if m == self.stats.model else ""
                console.print(f"    {m}{marker}")
            console.print()
            console.print("  [dim]Usage: /model claude-opus-4-6[/dim]")
            console.print()
            return
        model = arg.strip()
        if model not in AVAILABLE_MODELS:
            console.print(f"  [warning]Unknown model: {model}[/warning]")
            console.print(f"  [dim]Available: {', '.join(AVAILABLE_MODELS)}[/dim]")
            return
        if model == self.stats.model:
            console.print(f"  [dim]Already using {model}[/dim]")
            return
        raise _ModelChangeRequest(model)

    def _export(self, arg: str | None):
        if not self.stats.config_path:
            console.print(
                "\n  [warning]No config loaded."
                " Pass --config or ask the agent to export.[/warning]\n"
            )
            return
        raise _ExportRequest(arg.strip() if arg else None)

    def _compact(self):
        raise _CompactRequest()

    def _clear(self):
        console.clear()

    def _quit(self):
        raise SystemExit(0)


# ── Main ────────────────────────────────────────────────────────────────────


def _build_options(
    system_prompt: str,
    model: str,
    server,
    resume: str | None = None,
    fork: bool = False,
) -> ClaudeAgentOptions:
    """Build ClaudeAgentOptions. Compaction is handled client-side."""
    opts = ClaudeAgentOptions(
        system_prompt=system_prompt,
        model=model,
        mcp_servers={"ds": server},
        allowed_tools=[
            "Read",
            "Write",
            "Bash",
            "mcp__ds__*",
        ],
        permission_mode="acceptEdits",
        cwd=".",
    )
    if resume:
        opts.resume = resume
        opts.fork_session = fork
    return opts


async def main():
    parser = argparse.ArgumentParser(
        description="LatentForge — interactive image dataset builder for LoRA training"
    )
    parser.add_argument("--config", help="Path to dataset YAML config")
    parser.add_argument(
        "--model",
        default="claude-sonnet-4-5",
        help="Claude model to use (default: claude-sonnet-4-5)",
    )
    args = parser.parse_args()

    # Load config name for banner
    config_name = None
    if args.config:
        p = Path(args.config)
        if p.exists():
            cfg = yaml.safe_load(p.read_text())
            config_name = cfg.get("name") or p.stem

    _banner(args.model, args.config, config_name)

    server = create_sdk_mcp_server(name="dataset", version="1.0.0", tools=ALL_TOOLS)
    system_prompt = build_system_prompt(args.config)

    stats = SessionStats(args.model, args.config)
    cmds = SlashCommands(stats)
    spinner = Spinner()
    _setup_readline()

    options = _build_options(system_prompt, args.model, server)

    try:
        async with ClaudeSDKClient(options=options) as client:
            if args.config:
                initial = (
                    f"I've loaded the dataset config from {args.config}. What would you like to do?"
                )
            else:
                initial = (
                    "No config loaded. I can help you create a new dataset config, "
                    "or you can load one with --config. What would you like to work on?"
                )
            spinner.start("Thinking")
            await client.query(initial)
            await _print_response(client, spinner, stats)

            # Interactive loop
            while True:
                # Context line below prompt (like Claude Code)
                sys.stderr.write(f"\n{stats.context_bar()}\n")
                sys.stderr.flush()

                try:
                    user_input = input(f"{BOLD}>{RESET} ").strip()
                except (EOFError, KeyboardInterrupt):
                    break

                if not user_input:
                    continue

                # Slash commands handled locally
                try:
                    if cmds.handle(user_input):
                        continue
                except _ModelChangeRequest as req:
                    old_model = stats.model
                    new_model = req.model
                    if not stats.session_id:
                        console.print(
                            "  [warning]No session yet — model will apply on next query.[/warning]"
                        )
                        stats.model = new_model
                        stats.context_window = MODEL_CONTEXT.get(new_model, DEFAULT_CONTEXT)
                        continue
                    console.print(
                        f"  [dim]Switching {old_model} → {new_model} (forking session)...[/dim]"
                    )
                    await client.disconnect()
                    stats.model = new_model
                    stats.context_window = MODEL_CONTEXT.get(new_model, DEFAULT_CONTEXT)
                    fork_opts = _build_options(
                        system_prompt,
                        new_model,
                        server,
                        resume=stats.session_id,
                        fork=True,
                    )
                    await client.connect(fork_opts)
                    spinner.start("Reconnecting")
                    await client.query(
                        f"Model changed from {old_model} to {new_model}. "
                        "Briefly confirm you're ready to continue."
                    )
                    await _print_response(client, spinner, stats)
                    console.print(f"  [success]Now using {new_model}[/success]")
                    continue
                except _ExportRequest as req:
                    from latentforge.tools import export_dataset

                    export_args = {
                        "config_path": stats.config_path,
                        "generate_config": "true",
                        "platform": "auto",
                    }
                    if req.output_dir:
                        export_args["output_dir"] = req.output_dir
                    console.print("  [dim]Exporting to ai-toolkit format...[/dim]")
                    result = await export_dataset(export_args)
                    text = result.get("content", [{}])[0].get("text", "")
                    is_err = result.get("is_error", False)
                    style = "error" if is_err else "success"
                    console.print(f"  [{style}]{text}[/{style}]")
                    console.print()
                    continue
                except _CompactRequest:
                    if stats.turn_count < 1:
                        console.print("  [warning]No conversation to compact yet.[/warning]")
                        continue
                    ctx_tokens = _fmt_tokens(stats.context_used)
                    console.print(f"  [dim]Compacting context ({ctx_tokens} tokens)...[/dim]")
                    old_tokens = await _compact_session(
                        client,
                        spinner,
                        stats,
                        system_prompt,
                        stats.model,
                        server,
                        auto=False,
                    )
                    console.print(
                        f"  [success]Compacted:[/success] [dim]"
                        f"{_fmt_tokens(old_tokens)} → {_fmt_tokens(stats.context_used)} tokens"
                        f"[/dim]"
                    )
                    continue

                spinner.start("Thinking")
                await client.query(user_input)
                await _print_response(client, spinner, stats)

                # Auto-compact if context usage exceeds threshold
                if stats.context_pct >= AUTO_COMPACT_PCT and stats.turn_count >= 3:
                    old_tokens = await _compact_session(
                        client,
                        spinner,
                        stats,
                        system_prompt,
                        stats.model,
                        server,
                        auto=True,
                    )
                    console.print(
                        f"  [success]Auto-compacted:[/success] [dim]"
                        f"{_fmt_tokens(old_tokens)} → {_fmt_tokens(stats.context_used)} tokens"
                        f"[/dim]"
                    )

    except (KeyboardInterrupt, SystemExit):
        await spinner.stop()

    console.print(
        f"\n[dim]Goodbye! Session cost: ${stats.total_cost:.4f}"
        f" across {stats.turn_count} turns[/dim]"
    )


def cli():
    """Synchronous entry point for the `latentforge` console script."""
    asyncio.run(main())


if __name__ == "__main__":
    cli()
