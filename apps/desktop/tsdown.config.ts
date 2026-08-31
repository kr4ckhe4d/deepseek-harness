/**
 * Bundles the Electron main process (ESM) and the sandboxed preload (CJS)
 * into dist/. Electron and Node built-ins stay external; workspace-local
 * sources bundle in.
 */
import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: { main: 'src/main.ts' },
    format: 'esm',
    platform: 'node',
    external: ['electron'],
    outDir: 'dist',
    clean: true,
    dts: false,
    sourcemap: false,
  },
  {
    entry: { preload: 'src/preload.cts' },
    format: 'cjs',
    platform: 'node',
    external: ['electron'],
    outDir: 'dist',
    clean: false,
    dts: false,
    sourcemap: false,
  },
])
