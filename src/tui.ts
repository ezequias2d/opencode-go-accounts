import { appendFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import { createComponent } from "solid-js"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { authFile, configDir, storeFile } from "./shared/paths"
import {
  addAccount,
  activeAccount,
  maskKey,
  readAuthKey,
  readStore,
  removeAccount,
  setActive,
  writeAuthKey,
  writeStore,
} from "./shared/store"

// Render host dialog components without shipping a JSX build step. The host
// injects its own solid-js runtime, so `createComponent` keeps reactive
// ownership while the component still comes from `api.ui`.
function h(component: unknown, props: Record<string, unknown>): any {
  return (createComponent as any)(component, props)
}

function syncAuth(key: string): void {
  try {
    writeAuthKey(key, authFile())
  } catch {}
}

function activate(api: TuiPluginApi, id: string): void {
  const next = setActive(readStore(), id)
  const account = activeAccount(next)
  if (!account) return
  writeStore(next, storeFile())
  syncAuth(account.key)
  api.ui.toast({ variant: "success", title: "OpenCode Go", message: `Active account: ${account.name}` })
}

function save(api: TuiPluginApi, name: string, key: string): void {
  const { store, account } = addAccount(readStore(), { name, key })
  writeStore(store, storeFile())
  syncAuth(account.key)
  api.ui.toast({ variant: "success", title: "OpenCode Go", message: `Saved and activated ${account.name}` })
}

function promptName(api: TuiPluginApi, title: string, onDone: (name: string) => void): void {
  api.ui.dialog.setSize("medium")
  api.ui.dialog.replace(() =>
    h(api.ui.DialogPrompt, {
      title,
      placeholder: "e.g. Personal",
      onConfirm: (value: string) => {
        api.ui.dialog.clear()
        const name = String(value ?? "").trim()
        if (name) onDone(name)
      },
      onCancel: () => api.ui.dialog.clear(),
    }),
  )
}

function promptKey(api: TuiPluginApi, name: string, onDone: (key: string) => void): void {
  api.ui.dialog.setSize("medium")
  api.ui.dialog.replace(() =>
    h(api.ui.DialogPrompt, {
      title: `API key for "${name}"`,
      placeholder: "sk-...",
      onConfirm: (value: string) => {
        api.ui.dialog.clear()
        const key = String(value ?? "").trim()
        if (key) onDone(key)
      },
      onCancel: () => api.ui.dialog.clear(),
    }),
  )
}

function addFlow(api: TuiPluginApi, name: string): void {
  promptKey(api, name, (key) => save(api, name, key))
}

function confirmRemove(api: TuiPluginApi, id: string): void {
  const account = readStore().accounts.find((item) => item.id === id)
  if (!account) return

  api.ui.dialog.setSize("medium")
  api.ui.dialog.replace(() =>
    h(api.ui.DialogConfirm, {
      title: "Remove account",
      message: `Remove "${account.name}" (${maskKey(account.key)})?`,
      onConfirm: () => {
        api.ui.dialog.clear()
        const next = removeAccount(readStore(), id)
        writeStore(next, storeFile())
        const current = activeAccount(next)
        if (current) syncAuth(current.key)
        api.ui.toast({ variant: "info", title: "OpenCode Go", message: `Removed ${account.name}` })
      },
      onCancel: () => api.ui.dialog.clear(),
    }),
  )
}

function openRemove(api: TuiPluginApi): void {
  const store = readStore()
  if (!store.accounts.length) {
    api.ui.toast({ variant: "warning", title: "OpenCode Go", message: "No accounts to remove" })
    return
  }

  api.ui.dialog.setSize("medium")
  api.ui.dialog.replace(() =>
    h(api.ui.DialogSelect, {
      title: "Remove which account?",
      options: store.accounts.map((account) => ({
        title: account.name,
        value: account.id,
        description: maskKey(account.key),
      })),
      onSelect: (item: { value: unknown }) => {
        api.ui.dialog.clear()
        confirmRemove(api, String(item.value))
      },
    }),
  )
}

function importFlow(api: TuiPluginApi): void {
  const key = readAuthKey(authFile())
  if (!key) {
    api.ui.toast({ variant: "warning", title: "OpenCode Go", message: "No opencode-go key found in auth.json" })
    return
  }
  promptName(api, "Name for imported key", (name) => save(api, name, key))
}

function openPicker(api: TuiPluginApi): void {
  const store = readStore()
  const options: Array<Record<string, unknown>> = store.accounts.map((account) => ({
    title: account.name,
    value: account.id,
    description: `${account.id === store.active ? "● active" : "○"}  ${maskKey(account.key)}`,
  }))
  options.push({ title: "＋ Add account…", value: "__add__", description: "Name + API key" })
  options.push({ title: "⭳ Import current key", value: "__import__", description: "Save the key already in auth.json" })
  if (store.accounts.length) {
    options.push({ title: "🗑 Remove account…", value: "__remove__", description: "Delete a saved account" })
  }

  api.ui.dialog.setSize("medium")
  api.ui.dialog.replace(() =>
    h(api.ui.DialogSelect, {
      title: "OpenCode Go accounts",
      placeholder: "Select an account",
      current: store.active ?? undefined,
      options,
      onSelect: (item: { value: unknown }) => {
        const value = String(item.value)
        if (value === "__add__") {
          api.ui.dialog.clear()
          promptName(api, "New account name", (name) => addFlow(api, name))
          return
        }
        if (value === "__import__") {
          api.ui.dialog.clear()
          importFlow(api)
          return
        }
        if (value === "__remove__") {
          api.ui.dialog.clear()
          openRemove(api)
          return
        }
        api.ui.dialog.clear()
        activate(api, value)
      },
    }),
  )
}

function showStatus(api: TuiPluginApi): void {
  const account = activeAccount(readStore())
  api.ui.toast({
    variant: "info",
    title: "OpenCode Go",
    message: account ? `${account.name}  ${maskKey(account.key)}` : "No account configured",
  })
}

const commands = [
  { name: "go.accounts", title: "OpenCode Go: accounts", slash: "go", aliases: ["go-accounts"] },
  { name: "go.add", title: "OpenCode Go: add account", slash: "go-add" },
  { name: "go.import", title: "OpenCode Go: import current key", slash: "go-import" },
  { name: "go.remove", title: "OpenCode Go: remove account", slash: "go-remove" },
  { name: "go.status", title: "OpenCode Go: status", slash: "go-status" },
] as const

const run: Record<string, (api: TuiPluginApi) => void> = {
  "go.accounts": openPicker,
  "go.add": (api) => promptName(api, "New account name", (name) => addFlow(api, name)),
  "go.import": importFlow,
  "go.remove": openRemove,
  "go.status": showStatus,
}

function debug(message: string): void {
  if (process.env.OC_GO_DEBUG !== "1") return
  try {
    const file = path.join(configDir(), "opencode-go", "debug.log")
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    appendFileSync(file, `[${new Date().toISOString()}] tui: ${message}\n`, { mode: 0o600 })
  } catch {}
}

const tui: TuiPlugin = async (api) => {
  api.keymap.registerLayer({
    commands: commands.map((command) => ({
      name: command.name,
      title: command.title,
      category: "OpenCode Go",
      namespace: "palette",
      slashName: command.slash,
      ...("aliases" in command ? { slashAliases: [...command.aliases] } : {}),
      run() {
        run[command.name]?.(api)
      },
    })),
  })
  debug(`activated with ${commands.length} commands`)
}

const plugin: TuiPluginModule & { id: string } = { id: "opencode-go-accounts", tui }
export default plugin
