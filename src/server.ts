import { statSync } from "node:fs"
import { tool, type Plugin } from "@opencode-ai/plugin"
import { storeFile } from "./shared/paths"
import { PROVIDER_ID, activeAccount, maskKey, readStore } from "./shared/store"

const debug = process.env.OC_GO_DEBUG === "1"

type ActiveSnapshot = {
  stamp: string
  key: string | undefined
  name: string | undefined
}

let snapshot: ActiveSnapshot = { stamp: "", key: undefined, name: undefined }

function active(file: string): ActiveSnapshot {
  try {
    const stat = statSync(file)
    const stamp = `${stat.mtimeMs}:${stat.size}`
    if (stamp !== snapshot.stamp) {
      const account = activeAccount(readStore(file))
      snapshot = { stamp, key: account?.key, name: account?.name }
    }
  } catch {
    snapshot = { stamp: "", key: undefined, name: undefined }
  }
  return snapshot
}

export const GoAccountsServer: Plugin = async ({ client }) => {
  const log = async (message: string, extra?: Record<string, unknown>) => {
    if (!debug) return
    try {
      await client.app.log({
        body: { service: "opencode-go-accounts", level: "debug", message, extra: extra ?? {} },
      })
    } catch {}
  }

  return {
    "chat.headers": async (input, output) => {
      if (input.model.providerID !== PROVIDER_ID) return

      const account = active(storeFile())
      if (!account.key) return

      const npm = input.model.api?.npm ?? ""
      if (npm.includes("anthropic")) {
        output.headers["x-api-key"] = account.key
      } else {
        output.headers["Authorization"] = `Bearer ${account.key}`
      }
      await log("Injected opencode-go credentials", { npm, account: account.name })
    },

    tool: {
      go_account_status: tool({
        description:
          "Report which opencode-go account the opencode-go-accounts plugin is currently injecting. Returns the account name and a masked API key.",
        args: {},
        async execute() {
          const account = active(storeFile())
          if (!account.key) return "No opencode-go account configured. Run /go in the TUI to add one."
          return `Active opencode-go account: ${account.name ?? "unnamed"} (${maskKey(account.key)})`
        },
      }),
    },
  }
}

export default { id: "opencode-go-accounts", server: GoAccountsServer }
