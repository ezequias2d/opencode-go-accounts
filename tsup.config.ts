import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    server: "src/server.ts",
    tui: "src/tui.ts",
  },
  format: ["esm"],
  target: "esnext",
  platform: "node",
  clean: true,
  dts: false,
  splitting: false,
  sourcemap: false,
  external: [
    "@opencode-ai/plugin",
    "@opencode-ai/plugin/tui",
    "@opencode-ai/sdk",
    "@opentui/core",
    "@opentui/solid",
    "@opentui/keymap",
    "solid-js",
  ],
})
