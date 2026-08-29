/**
 * One-shot client for the browser daemon. Reads the JSON command on stdin so
 * no selector or typed text ever has to survive shell quoting, and starts the
 * daemon on first use.
 */
const http = require('node:http')
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const PORT = Number(process.env.DSH_BROWSER_PORT || 47653)
const HERE = __dirname

function post(pathname, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: pathname, method: 'POST', timeout: timeoutMs },
      res => {
        let out = ''
        res.on('data', c => { out += c })
        res.on('end', () => resolve(out))
      },
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('daemon timed out')))
    req.end(body)
  })
}

function health() {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/health', timeout: 1500 }, res => {
      res.resume()
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * An unhealthy daemon exits on the health probe that found it, so its port is
 * still held for a moment afterwards and a spawn racing that window dies with
 * EADDRINUSE. Retrying the spawn — rather than only the probe — is what makes
 * recovery from a half-dead daemon reliable.
 */
async function ensureDaemon() {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await health()) return
    const log = fs.openSync(path.join(HERE, 'daemon.log'), 'a')
    spawn(process.execPath, [path.join(HERE, 'daemon.cjs')], {
      detached: true,
      stdio: ['ignore', log, log],
    }).unref()
    for (let i = 0; i < 24; i++) {
      await sleep(500)
      if (await health()) return
    }
  }
  throw new Error('browser daemon did not become healthy; see the daemon.log next to this script')
}

async function main() {
  let body = ''
  for await (const chunk of process.stdin) body += chunk
  await ensureDaemon()
  process.stdout.write(await post('/rpc', body, 180000))
}

main().catch(e => {
  process.stdout.write(JSON.stringify({ ok: false, error: String((e && e.message) || e) }))
  process.exit(1)
})
