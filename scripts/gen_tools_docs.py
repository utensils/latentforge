"""Generate docs/tools/reference.md from latentforge.tools.ALL_TOOLS.

The tools reference page is auto-generated from the SdkMcpTool objects
produced by the @tool decorator. Do not edit docs/tools/reference.md by hand —
re-run this script (or `docs-dev` / `docs-build` in the devshell) instead.
"""

from __future__ import annotations

from pathlib import Path

from latentforge.tools import ALL_TOOLS

CATEGORIES: list[tuple[str, str, list[str]]] = [
    ("config", "Config", ["create_config", "read_config", "update_config", "list_configs"]),
    ("search", "Search", ["search_bing", "search_wikimedia"]),
    ("download", "Download", ["download_images", "download_gallery"]),
    ("browse", "Browse", ["list_images", "get_image_info"]),
    ("organize", "Organize", ["move_images", "organize_images"]),
    ("quality", "Quality & Curation", ["analyze_quality", "find_duplicates", "detect_screenshots"]),
    ("cropping", "Cropping", ["crop_center", "crop_smart"]),
    ("faces", "Faces", ["detect_faces", "crop_faces"]),
    ("training", "Training Prep", ["resize_images", "write_caption"]),
    ("export", "Export", ["export_dataset"]),
]


def _fmt_type(t: object) -> str:
    name = getattr(t, "__name__", None)
    if name:
        return f"`{name}`"
    return f"`{t}`"


def render_tool(tool) -> str:
    lines: list[str] = []
    lines.append(f"### `{tool.name}`")
    lines.append("")
    lines.append(tool.description.strip())
    lines.append("")
    schema = tool.input_schema or {}
    if schema:
        lines.append("| Parameter | Type |")
        lines.append("| --- | --- |")
        for pname, ptype in schema.items():
            lines.append(f"| `{pname}` | {_fmt_type(ptype)} |")
    else:
        lines.append("_No parameters._")
    lines.append("")
    return "\n".join(lines)


def render() -> str:
    by_name = {t.name: t for t in ALL_TOOLS}
    categorised: set[str] = set()
    sections: list[str] = []

    for _slug, title, names in CATEGORIES:
        sections.append(f"## {title}")
        sections.append("")
        for n in names:
            tool = by_name.get(n)
            if tool is None:
                continue
            sections.append(render_tool(tool))
            categorised.add(n)

    uncategorised = [t for t in ALL_TOOLS if t.name not in categorised]
    if uncategorised:
        sections.append("## Uncategorised")
        sections.append("")
        sections.append(
            "_These tools are not yet classified in `scripts/gen_tools_docs.py`. "
            "Add them to `CATEGORIES` to move them under a proper heading._"
        )
        sections.append("")
        for tool in uncategorised:
            sections.append(render_tool(tool))

    body = "\n".join(sections).rstrip() + "\n"

    header = (
        "<!--\n"
        "  AUTO-GENERATED — do not edit by hand.\n"
        "  Source: src/latentforge/tools.py (ALL_TOOLS)\n"
        "  Regenerate: python scripts/gen_tools_docs.py\n"
        "-->\n\n"
        "# MCP Tools Reference\n\n"
        f"LatentForge exposes **{len(ALL_TOOLS)} custom MCP tools** to the agent, "
        "grouped below by workflow stage. Each tool is registered via the\n"
        "[`@tool`](https://github.com/anthropics/claude-agent-sdk-python) decorator in "
        "`src/latentforge/tools.py`.\n\n"
    )
    return header + body


def main() -> int:
    out = Path(__file__).resolve().parent.parent / "docs" / "tools" / "reference.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render(), encoding="utf-8")
    print(f"Wrote {out} ({len(ALL_TOOLS)} tools)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
