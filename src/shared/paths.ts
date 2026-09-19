import os from "node:os"
import path from "node:path"

type Env = Record<string, string | undefined>

function home(): string {
  return process.env.OPENCODE_TEST_HOME ?? os.homedir()
}

function configBase(env: Env): string {
  return env.XDG_CONFIG_HOME ?? path.join(home(), ".config")
}

function dataBase(env: Env): string {
  return env.XDG_DATA_HOME ?? path.join(home(), ".local", "share")
}

export function configDir(env: Env = process.env): string {
  return env.OPENCODE_CONFIG_DIR ?? path.join(configBase(env), "opencode")
}

export function dataDir(env: Env = process.env): string {
  return path.join(dataBase(env), "opencode")
}

export function storeFile(env: Env = process.env): string {
  return path.join(configDir(env), "opencode-go", "accounts.json")
}

export function authFile(env: Env = process.env): string {
  return path.join(dataDir(env), "auth.json")
}
