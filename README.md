# @ezequias2d/opencode-go-accounts

Switch between multiple [opencode-go](https://opencode.ai/docs/go) accounts from the opencode TUI.

OpenCode stores a single `opencode-go` API key in `~/.local/share/opencode/auth.json`.
This plugin keeps a list of keys and lets you pick the active one with `/go`. The switch
takes effect immediately (no restart) and is persisted to `auth.json` for the next run.

## Install

```jsonc
// ~/.config/opencode/opencode.jsonc  (server target: chat header injection)
{
  "plugin": ["@ezequias2d/opencode-go-accounts"],
}
```

```jsonc
// ~/.config/opencode/tui.json  (tui target: slash command + picker)
{
  "plugin": ["@ezequias2d/opencode-go-accounts"],
}
```

Local development: point both entries at the repository directory instead and run
`bun install && bun run build` (use `bun run dev` for watch mode).

## Usage

| Command | Description |
| --- | --- |
| `/go` (alias `/go-accounts`) | Open the account picker (switch, add, import, remove) |
| `/go-add` | Add an account (prompts for name, then API key) |
| `/go-import` | Save the key currently in `auth.json` under a new name |
| `/go-remove` | Remove a saved account |
| `/go-status` | Show the active account |

Add your first key either with `/connect` (normal opencode flow) and then `/go-import`,
or directly with `/go-add`. Keys are stored in
`~/.config/opencode/opencode-go/accounts.json` (mode `0600`) and the active key is written
to `~/.local/share/opencode/auth.json`.

## How it works

- **TUI plugin** (`./tui`) writes the account store and `auth.json` when you switch.
- **Server plugin** (`./server`) injects the active key on every `opencode-go` request via
  the `chat.headers` hook. This is needed because a running server caches provider
  credentials at startup, so editing `auth.json` alone would not apply until restart.
  - `@ai-sdk/anthropic` models receive `x-api-key`.
  - `@ai-sdk/openai-compatible` models receive `Authorization: Bearer`.

The server plugin also exposes a read-only `go_account_status` tool.

## Environment

| Variable | Effect |
| --- | --- |
| `OPENCODE_CONFIG_DIR` | Overrides the config directory (account store location). |
| `XDG_CONFIG_HOME` / `XDG_DATA_HOME` | Standard XDG overrides. |
| `OC_GO_DEBUG=1` | Log header injection decisions (masked) via `client.app.log`. |

If `OPENCODE_AUTH_CONTENT` is set, opencode ignores `auth.json`. The header hook still works,
but the persisted key will not be used.

## Security

API keys are stored in plaintext, exactly like opencode's own `auth.json`. The store and
`auth.json` are written with mode `0600` inside a `0700` directory. Keys are never logged in
full; the status tool and UI show a masked form (`sk-…abcd`).

## Development

```bash
bun install
bun run typecheck
bun test
bun run build
```
