#!/usr/bin/env python3
"""Generate docs/api/tools.md from the @tool decorators in src/latentforge/tools.py.

Parses with `ast` — no runtime import, so this script has zero dependencies
beyond the Python standard library. Output is deterministic: same input
produces byte-identical output, so it's safe to commit.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TOOLS_PY = REPO_ROOT / "src" / "latentforge" / "tools.py"
OUTPUT = REPO_ROOT / "docs" / "api" / "tools.md"

# Ordered list: (category title, tool names in display order)
CATEGORIES: list[tuple[str, list[str]]] = [
    (
        "Config Management",
        ["create_config", "read_config", "update_config", "list_configs"],
    ),
    (
        "Search & Download",
        ["search_bing", "search_wikimedia", "download_images", "download_gallery"],
    ),
    (
        "Dataset Browsing",
        ["list_images", "get_image_info"],
    ),
    (
        "Dataset Organization",
        ["move_images", "organize_images"],
    ),
    (
        "Quality & Curation",
        [
            "analyze_quality",
            "find_duplicates",
            "resize_images",
            "write_caption",
            "detect_screenshots",
        ],
    ),
    (
        "Cropping & Face Detection",
        ["crop_center", "crop_smart", "detect_faces", "crop_faces"],
    ),
    (
        "Export",
        ["export_dataset"],
    ),
]


def type_name(node: ast.AST) -> str:
    """Render an AST type-annotation node as a short display string."""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    if isinstance(node, ast.Constant):
        return repr(node.value)
    return ast.unparse(node)


def extract_tools(source: str) -> dict[str, dict]:
    """Walk the AST of tools.py and extract metadata for every @tool function."""
    tree = ast.parse(source)
    tools: dict[str, dict] = {}

    for node in tree.body:
        if not isinstance(node, ast.AsyncFunctionDef | ast.FunctionDef):
            continue
        for dec in node.decorator_list:
            if not isinstance(dec, ast.Call):
                continue
            target = dec.func
            if not (isinstance(target, ast.Name) and target.id == "tool"):
                continue
            if len(dec.args) < 3:
                continue

            name_node, desc_node, schema_node = dec.args[0], dec.args[1], dec.args[2]
            if not (
                isinstance(name_node, ast.Constant)
                and isinstance(desc_node, ast.Constant)
                and isinstance(schema_node, ast.Dict)
            ):
                continue

            params: list[tuple[str, str]] = []
            for key, value in zip(schema_node.keys, schema_node.values, strict=False):
                if not isinstance(key, ast.Constant):
                    continue
                params.append((str(key.value), type_name(value)))

            docstring = ast.get_docstring(node) or ""

            tools[name_node.value] = {
                "name": name_node.value,
                "description": desc_node.value,
                "params": params,
                "docstring": docstring.strip(),
                "func_name": node.name,
            }
    return tools


def render(tools: dict[str, dict]) -> str:
    lines: list[str] = []
    lines.append("---")
    lines.append("title: Tools Reference")
    lines.append(
        "description: Auto-generated reference for all MCP tools exposed by the LatentForge agent."
    )
    lines.append("---")
    lines.append("")
    lines.append("# Tools Reference")
    lines.append("")
    tools_src_url = "https://github.com/utensils/latentforge/blob/main/src/latentforge/tools.py"
    lines.append(
        "The LatentForge agent exposes its dataset-building capabilities through custom "
        "[Model Context Protocol](https://modelcontextprotocol.io) tools. Each tool below "
        f"is defined in [`src/latentforge/tools.py`]({tools_src_url}) "
        "with the `@tool` decorator and is registered on an in-process MCP server at startup."
    )
    lines.append("")
    lines.append(
        "::: tip Auto-generated\n"
        "This page is regenerated from the source code by `pnpm run docs:gen`. "
        "Edit `src/latentforge/tools.py` (not this file) to change tool behavior or descriptions.\n"
        ":::"
    )
    lines.append("")

    total = sum(len(names) for _, names in CATEGORIES)
    lines.append(f"**{total} tools** across **{len(CATEGORIES)} categories**.")
    lines.append("")

    # Table of contents
    lines.append("## Overview")
    lines.append("")
    lines.append("| Category | Tools |")
    lines.append("| --- | --- |")
    for category, names in CATEGORIES:
        cell = ", ".join(f"[`{n}`](#{n.replace('_', '-')})" for n in names)
        lines.append(f"| {category} | {cell} |")
    lines.append("")

    missing: list[str] = []
    seen: set[str] = set()

    for category, names in CATEGORIES:
        lines.append(f"## {category}")
        lines.append("")
        for name in names:
            tool = tools.get(name)
            if tool is None:
                missing.append(name)
                continue
            seen.add(name)

            lines.append(f"### `{name}`")
            lines.append("")
            lines.append(tool["description"] + ".")
            lines.append("")

            if tool["params"]:
                lines.append("**Parameters**")
                lines.append("")
                lines.append("| Name | Type |")
                lines.append("| --- | --- |")
                for pname, ptype in tool["params"]:
                    lines.append(f"| `{pname}` | `{ptype}` |")
                lines.append("")
            else:
                lines.append("_No parameters._")
                lines.append("")

            if tool["docstring"]:
                lines.append("**Notes**")
                lines.append("")
                for doc_line in tool["docstring"].splitlines():
                    lines.append(doc_line.rstrip())
                lines.append("")

    # Any tools in source but not in the category map
    unlisted = sorted(set(tools) - seen)
    if unlisted:
        lines.append("## Uncategorized")
        lines.append("")
        lines.append(
            "These tools were found in `tools.py` but are not mapped into a category. "
            "Add them to `CATEGORIES` in `scripts/gen_api_docs.py`."
        )
        lines.append("")
        for name in unlisted:
            lines.append(f"- `{name}` — {tools[name]['description']}")
        lines.append("")

    if missing:
        print(
            f"warning: CATEGORIES references {len(missing)} tool(s) not found "
            f"in tools.py: {', '.join(missing)}",
            file=sys.stderr,
        )

    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    source = TOOLS_PY.read_text()
    tools = extract_tools(source)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(render(tools))
    print(f"wrote {OUTPUT.relative_to(REPO_ROOT)} ({len(tools)} tools)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
