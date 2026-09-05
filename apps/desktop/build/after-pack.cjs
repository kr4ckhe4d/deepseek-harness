/**
 * Copy the staged backend closure into the packaged application.
 *
 * electron-builder refuses to carry a `node_modules` tree through
 * `extraResources` — it ships the closure's manifest and drops everything
 * under it — so the closure is placed here instead, after the app directory
 * exists. It lands outside the asar archive because the launcher resolves its
 * sibling packages from the real filesystem.
 *
 * Symlinks are copied verbatim: build/stage-backend.mjs has already replaced
 * every link escaping the closure with a real copy, so the ones left resolve
 * within the tree being copied.
 */
const fs = require('node:fs')
const path = require('node:path')

/**
 * @param {{ appOutDir: string, packager: { projectDir: string, appInfo: { productFilename: string } } }} context
 *   electron-builder's after-pack context.
 * @returns {Promise<void>} settles once the closure is in place.
 */
exports.default = async function afterPack(context) {
  const source = path.join(context.packager.projectDir, 'staged-backend')
  if (!fs.existsSync(source)) {
    throw new Error('after-pack: staged-backend is missing; run `npm run stage:backend` first')
  }
  const destination = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Resources',
    'backend',
  )
  await fs.promises.rm(destination, { recursive: true, force: true })
  await fs.promises.cp(source, destination, { recursive: true, verbatimSymlinks: true })
}
