import { createHash } from "node:crypto"
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { authFile as defaultAuthFile, storeFile as defaultStoreFile } from "./paths"
import type { GoAccount, GoStore } from "./types"

export const STORE_VERSION = 1 as const
export const PROVIDER_ID = "opencode-go"

export function emptyStore(): GoStore {
  return { version: STORE_VERSION, active: null, accounts: [] }
}

export function maskKey(key: string): string {
  if (!key) return "••••"
  if (key.length <= 8) return "•".repeat(key.length)
  return `${key.slice(0, 3)}…${key.slice(-4)}`
}

export function idFor(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8)
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

export function normalizeStore(raw: unknown): GoStore {
  const store = emptyStore()
  if (!raw || typeof raw !== "object") return store

  const accounts = Array.isArray((raw as { accounts?: unknown }).accounts)
    ? ((raw as { accounts: unknown[] }).accounts as unknown[])
    : []

  const seen = new Set<string>()
  for (const item of accounts) {
    if (!item || typeof item !== "object") continue
    const record = item as Record<string, unknown>
    const key = asString(record.key)
    if (!key) continue
    const id = asString(record.id) ?? idFor(key)
    if (seen.has(id)) continue
    seen.add(id)
    store.accounts.push({
      id,
      name: asString(record.name) ?? `Account ${store.accounts.length + 1}`,
      key,
      createdAt: typeof record.createdAt === "number" ? record.createdAt : 0,
    })
  }

  const requested = asString((raw as { active?: unknown }).active)
  store.active = requested && store.accounts.some((account) => account.id === requested) ? requested : null
  if (!store.active) store.active = store.accounts[0]?.id ?? null
  return store
}

export function readStore(file: string = defaultStoreFile()): GoStore {
  try {
    return normalizeStore(JSON.parse(readFileSync(file, "utf8")))
  } catch {
    return emptyStore()
  }
}

export function writeFilePrivate(file: string, contents: string): void {
  const dir = path.dirname(file)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  try {
    chmodSync(dir, 0o700)
  } catch {}
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, contents, { mode: 0o600 })
  try {
    chmodSync(tmp, 0o600)
  } catch {}
  renameSync(tmp, file)
  try {
    chmodSync(file, 0o600)
  } catch {}
}

export function writeStore(store: GoStore, file: string = defaultStoreFile()): void {
  writeFilePrivate(file, `${JSON.stringify(store, null, 2)}\n`)
}

export function addAccount(store: GoStore, input: { name?: string; key: string }): { store: GoStore; account: GoAccount } {
  const key = input.key.trim()
  const id = idFor(key)
  const existing = store.accounts.find((account) => account.id === id)
  if (existing) return { store: setActive(store, id), account: existing }

  const name = input.name?.trim() || `Account ${store.accounts.length + 1}`
  const account: GoAccount = { id, name, key, createdAt: Date.now() }
  return { store: { ...store, accounts: [...store.accounts, account], active: id }, account }
}

export function removeAccount(store: GoStore, id: string): GoStore {
  const accounts = store.accounts.filter((account) => account.id !== id)
  const active = store.active === id ? (accounts[0]?.id ?? null) : store.active
  return { ...store, accounts, active }
}

export function setActive(store: GoStore, id: string): GoStore {
  return store.accounts.some((account) => account.id === id) ? { ...store, active: id } : store
}

export function activeAccount(store: GoStore): GoAccount | undefined {
  return store.accounts.find((account) => account.id === store.active) ?? store.accounts[0]
}

export function readAuthKey(file: string = defaultAuthFile()): string | undefined {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>
    const entry = raw[PROVIDER_ID]
    if (!entry || typeof entry !== "object") return undefined
    const record = entry as Record<string, unknown>
    return record.type === "api" ? asString(record.key) : undefined
  } catch {
    return undefined
  }
}

export function writeAuthKey(key: string, file: string = defaultAuthFile()): void {
  let data: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"))
    if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>
  } catch {}
  data[PROVIDER_ID] = { type: "api", key }
  writeFilePrivate(file, `${JSON.stringify(data, null, 2)}\n`)
}
