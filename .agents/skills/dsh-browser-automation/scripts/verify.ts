import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { sandboxDefineTool } from '../../../../packages/extensions/cordis-host-runner/src/guard.ts'

const source = readFileSync(new URL('./plugin.host.js', import.meta.url), 'utf8')
const registered: Record<string, any> = {}
const harness = {
  defineTool: sandboxDefineTool,
  registerTool: (_ctx: unknown, tool: any) => { registered[tool.name] = tool },
}
const plugin = new Function('harness', source)(harness)
plugin.apply({ shell: { run: async () => ({}) } })

assert.deepEqual(Object.keys(registered).sort(), [
  'browser_back', 'browser_click', 'browser_close_tab', 'browser_fill',
  'browser_get_text', 'browser_list_tabs', 'browser_navigate', 'browser_new_tab',
  'browser_press', 'browser_screenshot', 'browser_select_tab', 'browser_snapshot',
  'browser_status', 'browser_wait_for',
])
console.log('✓ 14 tools registered through the real sandboxDefineTool guard')

const shot = registered.browser_screenshot.output.render({}, { url: 'https://example.com', title: 'Example', path: '/tmp/shot.png' })
assert.deepEqual(shot, [{ type: 'text', text: 'Example\nhttps://example.com\nscreenshot: /tmp/shot.png' }])
console.log('✓ screenshot renders as a path, not the image block that crashed the turn')

const snap = registered.browser_snapshot.output.render({}, {
  url: 'u', title: 't', count: 1,
  elements: [{ tag: 'button', type: 'button', label: 'Add To Cart', selector: '#goods_sty > li:nth-of-type(1) > div > button' }],
})
assert.ok(snap[0].text.includes('[0] <button type=button> "Add To Cart"  selector: #goods_sty > li:nth-of-type(1) > div > button'))
console.log('✓ snapshot renders unique pure-CSS selectors')

const value = { url: 'u', title: 't', text: 'x', truncated: false, filled: 'f', matched: 'm', path: 'p', count: 0, elements: [], tabs: [], index: 0, closed: 'active', remaining: 1 }
for (const [name, tool] of Object.entries(registered)) {
  for (const block of (tool as any).output.render({}, value)) {
    assert.equal(block.type, 'text', `${name} rendered a non-text block`)
  }
}
console.log('✓ every tool renders text-only blocks')

// The exact regression: the old renderer's image block must now be refused.
const old = sandboxDefineTool({
  name: 'old_screenshot', description: 'old', parameters: {},
  output: { schema: { type: 'json' }, render: (_a: any, v: any) => [{ type: 'image', mimeType: 'image/png', data: v.image }] },
  execute: async () => ({ image: 'iVBORw0KGgo=' }),
})
assert.throws(() => old.output.render({}, { image: 'iVBORw0KGgo=' }), /only the attachment service can issue/)
console.log('✓ the original image-block renderer is now refused at registration, not mid-turn')
