import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  addAccount,
  activeAccount,
  emptyStore,
  idFor,
  maskKey,
  normalizeStore,
  readAuthKey,
  readStore,
  removeAccount,
  setActive,
  writeAuthKey,
  writeStore,
} from "../src/shared/store"

function tempFile(name: string): { dir: string; file: string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "goacc-"))
  return { dir, file: path.join(dir, name) }
}

describe("normalizeStore", () => {
  test("returns an empty store for garbage", () => {
    expect(normalizeStore(null)).toEqual(emptyStore())
    expect(normalizeStore("nope")).toEqual(emptyStore())
    expect(normalizeStore({ accounts: "x" })).toEqual(emptyStore())
  })

  test("dedupes accounts by id and repairs active", () => {
    const key = "sk-abc"
    const store = normalizeStore({
      active: "missing",
      accounts: [
        { id: idFor(key), name: "One", key, createdAt: 1 },
        { id: idFor(key), name: "Dup", key, createdAt: 2 },
      ],
    })
    expect(store.accounts).toHaveLength(1)
    expect(store.active).toBe(idFor(key))
  })

  test("defaults active to the first account", () => {
    const store = normalizeStore({ accounts: [{ key: "sk-one" }, { key: "sk-two" }] })
    expect(store.active).toBe(idFor("sk-one"))
    expect(store.accounts[1]?.name).toBe("Account 2")
  })
})

describe("account mutations", () => {
  test("adds, activates and dedupes", () => {
    const first = addAccount(emptyStore(), { name: "Personal", key: "sk-one" })
    expect(first.store.active).toBe(first.account.id)

    const second = addAccount(first.store, { name: "Work", key: "sk-two" })
    expect(second.store.accounts).toHaveLength(2)
    expect(second.store.active).toBe(second.account.id)

    const duplicate = addAccount(second.store, { name: "Again", key: "sk-one" })
    expect(duplicate.store.accounts).toHaveLength(2)
    expect(duplicate.account.name).toBe("Personal")
    expect(duplicate.store.active).toBe(idFor("sk-one"))
  })

  test("reassigns active when the active account is removed", () => {
    const a = addAccount(emptyStore(), { name: "A", key: "sk-a" }).store
    const b = addAccount(a, { name: "B", key: "sk-b" }).store
    const after = removeAccount(b, idFor("sk-b"))
    expect(after.accounts).toHaveLength(1)
    expect(after.active).toBe(idFor("sk-a"))
  })

  test("reassigns active to null when the last account is removed", () => {
    const a = addAccount(emptyStore(), { name: "A", key: "sk-a" }).store
    expect(removeAccount(a, idFor("sk-a")).active).toBeNull()
  })

  test("setActive ignores unknown ids", () => {
    const a = addAccount(emptyStore(), { name: "A", key: "sk-a" }).store
    expect(setActive(a, "nope")).toEqual(a)
  })
})

describe("persistence", () => {
  test("round trips and writes private permissions", () => {
    const { dir, file } = tempFile("accounts.json")
    try {
      const store = addAccount(emptyStore(), { name: "Personal", key: "sk-one" }).store
      writeStore(store, file)
      expect(readStore(file)).toEqual(store)
      expect(statSync(file).mode & 0o777).toBe(0o600)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("readStore returns empty on malformed json", () => {
    const { dir, file } = tempFile("accounts.json")
    try {
      writeFileSync(file, "{ not json")
      expect(readStore(file)).toEqual(emptyStore())
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("writeAuthKey preserves other providers and sets private mode", () => {
    const { dir, file } = tempFile("auth.json")
    try {
      writeFileSync(file, JSON.stringify({ deepseek: { type: "api", key: "sk-deep" } }))
      writeAuthKey("sk-go", file)
      const data = JSON.parse(readFileSync(file, "utf8"))
      expect(data.deepseek.key).toBe("sk-deep")
      expect(data["opencode-go"]).toEqual({ type: "api", key: "sk-go" })
      expect(statSync(file).mode & 0o777).toBe(0o600)
      expect(readAuthKey(file)).toBe("sk-go")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("readAuthKey ignores non-api entries", () => {
    const { dir, file } = tempFile("auth.json")
    try {
      writeFileSync(file, JSON.stringify({ "opencode-go": { type: "oauth", refresh: "x" } }))
      expect(readAuthKey(file)).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("maskKey", () => {
  test("never exposes the full key", () => {
    const masked = maskKey("sk-1234567890abcdef")
    expect(masked).toContain("…")
    expect(masked).not.toContain("7890abcd")
    expect(maskKey("short")).toBe("•••••")
    expect(maskKey("")).toBe("••••")
  })
})
