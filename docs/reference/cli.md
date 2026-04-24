# CLI

## Synopsis

```
latentforge [--config PATH] [--model NAME]
```

## Flags

| Flag | Default | Description |
| --- | --- | --- |
| `--config PATH` | _none_ | Path to a dataset YAML config. When set, the agent loads the config at startup and tailors the system prompt to the active dataset. |
| `--model NAME` | `claude-sonnet-4-5` | Claude model to use. One of `claude-sonnet-4-5`, `claude-opus-4-6`, `claude-haiku-4-5`. |
| `-h`, `--help` | | Show argparse help and exit. |

## Environment variables

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Primary auth — used when set |
| `CLAUDE_CODE_OAUTH_TOKEN` | Fallback auth — OAuth token (Claude Code) |
| `DATASETS_FOLDER` | Overrides the ai-toolkit datasets path used by `export_dataset` |
| `AI_TOOLKIT_UI_DATA` | If set, export goes to `$AI_TOOLKIT_UI_DATA/datasets/<name>` |
| `XDG_DATA_HOME` | If set, export falls back to `$XDG_DATA_HOME/ai-toolkit/datasets/<name>` |

The auth method actually in use is shown on the startup banner and via
`/status`.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Clean exit (`/quit`, Ctrl-D, Ctrl-C at the prompt) |
| non-zero | Unhandled exception — re-run with the error visible |

## Examples

```bash
# No config — interactive mode, ask the agent to create one
latentforge

# Resume work on an existing dataset
latentforge --config configs/ghibli.yaml

# Use Opus for higher-quality curation
latentforge --config configs/ghibli.yaml --model claude-opus-4-6

# Authenticate and launch
ANTHROPIC_API_KEY=sk-ant-... latentforge
```

## Running via Nix

```bash
# Pinned to the flake
nix run github:utensils/latentforge -- --config configs/ghibli.yaml

# Inside a clone
nix develop
latentforge
```
