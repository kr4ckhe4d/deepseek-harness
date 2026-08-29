return {
  name: 'chrome-browser',
  inject: ['shell', 'tools'],
  apply(ctx) {
    const shell = ctx.shell
    // The one machine-specific value in this body: the absolute path of call.cjs
    // next to this file in the skill's scripts directory. Set it for this
    // checkout before defining the plugin.
    const CLIENT = '/Users/nipunaherath/code/deepseek-harness/.agents/skills/dsh-browser-automation/scripts/call.cjs'

    // The command carries no data: the JSON payload goes over stdin, so a
    // selector or typed string containing quotes can never reshape the shell
    // word it sits in.
    const call = async (action, args) => {
      const request = { command: `node ${CLIENT}`, stdin: JSON.stringify({ action, args: args || {} }), timeoutMs: 180000 }
      const spec = typeof shell.resolve === 'function' ? shell.resolve(request) : request
      const run = await shell.run(spec)
      const stdout = (run.stdout || '').trim()
      if (!stdout) throw new Error(`browser daemon returned no output (exit ${run.exitCode}): ${(run.stderr || '').slice(0, 400)}`)
      let parsed
      try {
        parsed = JSON.parse(stdout)
      } catch (e) {
        throw new Error(`browser daemon returned non-JSON: ${stdout.slice(0, 400)}`)
      }
      if (!parsed.ok) throw new Error(parsed.error || 'browser action failed')
      return parsed.result
    }

    // Every renderer returns text. A dynamic package cannot mint an image
    // block: that block carries an attachment reference only the attachment
    // service issues, so `browser_screenshot` reports the PNG's path instead.
    const lines = (...parts) => [{ type: 'text', text: parts.filter(Boolean).join('\n') }]
    const place = value => `${value.title ? value.title + '\n' : ''}${value.url}`

    const define = (spec) => harness.registerTool(ctx, harness.defineTool(spec))

    define({
      name: 'browser_navigate',
      description: 'Open a URL in the persistent browser and wait for it to settle. The page stays open for later browser_* calls.',
      parameters: { url: { type: 'string', required: true, description: 'Absolute URL to open.' } },
      output: { schema: { type: 'json' }, render: (_a, v) => lines(place(v)) },
      execute: args => call('navigate', { url: args.url }),
    })

    define({
      name: 'browser_new_tab',
      description: 'Open a new tab and make it the target of every later browser_* call. Optionally navigate it straight to a URL.',
      parameters: { url: { type: 'string', description: 'Optional URL to open in the new tab.' } },
      output: { schema: { type: 'json' }, render: (_a, v) => lines(`tab ${v.index} is now active`, place(v)) },
      execute: args => call('newTab', { url: args.url }),
    })

    define({
      name: 'browser_list_tabs',
      description: 'List the open tabs with their index, URL, and which one is currently active.',
      parameters: {},
      output: {
        schema: { type: 'json' },
        render: (_a, v) => lines(
          `${v.count} tab(s)`,
          ...v.tabs.map(t => `[${t.index}]${t.active ? ' *' : '  '} ${t.title ? t.title + ' — ' : ''}${t.url}`),
        ),
      },
      execute: () => call('listTabs', {}),
    })

    define({
      name: 'browser_select_tab',
      description: 'Attach to an already-open tab by its index from browser_list_tabs.',
      parameters: { index: { type: 'integer', required: true, description: 'Tab index from browser_list_tabs.' } },
      output: { schema: { type: 'json' }, render: (_a, v) => lines(`tab ${v.index} is now active`, place(v)) },
      execute: args => call('selectTab', { index: args.index }),
    })

    define({
      name: 'browser_close_tab',
      description: 'Close a tab by index, or the active tab when no index is given.',
      parameters: { index: { type: 'integer', description: 'Tab index to close; omit for the active tab.' } },
      output: { schema: { type: 'json' }, render: (_a, v) => lines(`closed ${v.closed}; ${v.remaining} tab(s) left`, v.url) },
      execute: args => call('closeTab', { index: args.index }),
    })

    define({
      name: 'browser_back',
      description: 'Go back one entry in the persistent browser history.',
      parameters: {},
      output: { schema: { type: 'json' }, render: (_a, v) => lines(place(v)) },
      execute: () => call('back', {}),
    })

    define({
      name: 'browser_get_text',
      description: 'Read visible text from the current page, or from one element when a selector is given. Use this to understand a page before acting on it.',
      parameters: { selector: { type: 'string', description: 'Optional CSS selector; omit for the whole page.' } },
      output: {
        schema: { type: 'json' },
        render: (_a, v) => lines(place(v), '', v.text, v.truncated ? '\n[text truncated]' : ''),
      },
      execute: args => call('getText', { selector: args.selector }),
    })

    define({
      name: 'browser_snapshot',
      description: 'List the clickable and fillable elements on the current page, each with a unique pure-CSS selector. Call this to discover selectors instead of guessing; repeated controls (one per product row) each get their own selector.',
      parameters: {
        match: { type: 'string', description: 'Optional case-insensitive label filter, e.g. "add to cart".' },
        limit: { type: 'integer', description: 'Maximum elements to return (default 150).' },
      },
      output: {
        schema: { type: 'json' },
        render: (_a, v) => lines(
          place(v),
          `${v.count} interactive element(s)`,
          ...v.elements.map((e, i) =>
            `[${i}] <${e.tag}${e.type ? ' type=' + e.type : ''}> ${JSON.stringify(e.label)}`
            + `${e.href ? ' href=' + e.href : ''}${e.selector ? '  selector: ' + e.selector : ''}`),
        ),
      },
      execute: args => call('snapshot', { match: args.match, limit: args.limit }),
    })

    define({
      name: 'browser_click',
      description: 'Click an element and wait for any resulting navigation. Snapshot selectors are already unique; index is only needed for a hand-written selector that matches several elements.',
      parameters: {
        selector: { type: 'string', required: true, description: 'CSS selector, e.g. "#id" or "#goods_sty > li:nth-of-type(1) > div > button". Take these from browser_snapshot.' },
        index: { type: 'integer', description: 'Zero-based match to click; omit for the first.' },
      },
      output: { schema: { type: 'json' }, render: (_a, v) => lines(place(v)) },
      execute: args => call('click', { selector: args.selector, index: args.index }),
    })

    define({
      name: 'browser_fill',
      description: 'Replace the value of an input or textarea with the given text.',
      parameters: {
        selector: { type: 'string', required: true, description: 'CSS selector for the field.' },
        text: { type: 'string', required: true, description: 'Text to set.' },
        index: { type: 'integer', description: 'Zero-based match to fill; omit for the first.' },
      },
      output: { schema: { type: 'json' }, render: (_a, v) => lines(`filled ${JSON.stringify(v.filled)} on ${v.url}`) },
      execute: args => call('fill', { selector: args.selector, text: args.text, index: args.index }),
    })

    define({
      name: 'browser_press',
      description: 'Press a key, optionally focused on one element first (e.g. Enter to submit a search box).',
      parameters: {
        key: { type: 'string', required: true, description: 'Key name, e.g. "Enter", "Escape", "ArrowDown".' },
        selector: { type: 'string', description: 'Optional element to focus before pressing.' },
        index: { type: 'integer', description: 'Zero-based match when the selector is ambiguous.' },
      },
      output: { schema: { type: 'json' }, render: (_a, v) => lines(place(v)) },
      execute: args => call('press', { key: args.key, selector: args.selector, index: args.index }),
    })

    define({
      name: 'browser_wait_for',
      description: 'Wait until an element appears on the current page.',
      parameters: {
        selector: { type: 'string', required: true, description: 'CSS selector to wait for.' },
        timeout: { type: 'integer', description: 'Milliseconds to wait (default 30000).' },
      },
      output: { schema: { type: 'json' }, render: (_a, v) => lines(`matched ${v.matched} on ${v.url}`) },
      execute: args => call('waitFor', { selector: args.selector, timeout: args.timeout }),
    })

    define({
      name: 'browser_screenshot',
      description: 'Save a PNG of the current page to disk and report its path. The image is not inlined into the conversation.',
      parameters: { fullPage: { type: 'boolean', description: 'Capture the full scrollable page instead of the viewport.' } },
      output: { schema: { type: 'json' }, render: (_a, v) => lines(place(v), `screenshot: ${v.path}`) },
      execute: args => call('screenshot', { fullPage: args.fullPage }),
    })

    define({
      name: 'browser_status',
      description: 'Report whether the persistent browser is running and what page it is on.',
      parameters: {},
      output: { schema: { type: 'json' }, render: (_a, v) => lines(place(v)) },
      execute: () => call('status', {}),
    })
  },
}
