/**
 * The picture at the top of the README is a picture of this page.
 *
 *   npm run check:capture
 *
 * A still goes stale exactly as quietly as a recording does. `watch-it-think`
 * shipped a GIF of a green page for two days after the page became flame and
 * blue, with the README underneath calling it the real page, and nothing failed
 * because every other gate reads code or numbers. Its first fix recorded eight
 * colours and a typeface, so it then passed over a recording showing a headline
 * that had since been rewritten. `tokenlab`'s picture was correct only because
 * the capture happened to be re-run three minutes after its palette changed.
 *
 * So `capture.json` records the paint, the words and the counts, and this reads
 * the page back and compares all three. The counts matter most: this picture's
 * entire content is how many marks sit inside how many bands, and the one number
 * that carries the argument is `insideBands`, which must stay small on the
 * closed loop and large on the open one.
 */

import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { lookAt } from './capture-state.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const record = resolve(root, 'docs/capture.json')
const shot = resolve(root, 'docs/gatewaylab.png')

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

if (!existsSync(shot)) {
  console.error('FAIL  docs/gatewaylab.png is missing, and the README leads with it')
  process.exit(1)
}
if (!existsSync(record)) {
  console.error('FAIL  docs/capture.json is missing, so nothing records what the page looked like when it was photographed')
  console.error('      run npm run capture')
  process.exit(1)
}

const was = JSON.parse(readFileSync(record, 'utf8'))

/*
 * A record written by an older tool is refused, not partly believed. Comparing
 * whichever keys happen to be present means that the day the capture learns to
 * write down something new, this goes on passing without it.
 */
for (const part of ['paint', 'words', 'state']) {
  if (!was.looked || typeof was.looked[part] !== 'object') {
    fail(`docs/capture.json records no ${part}, so it was made before this gate read ${part}`, 'Run npm run capture.')
  }
}
if (failed > 0) process.exit(1)

const { serve, useShared } = await import('./serve.mjs')
const server = process.env.GATEWAYLAB_URL ? await useShared(process.env.GATEWAYLAB_URL) : await serve()

try {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(server.url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelectorAll('[data-mark]').length > 0, null, { timeout: 60_000 })
  await page.waitForTimeout(250)

  const now = await page.evaluate(lookAt)

  const drifted = []
  for (const part of ['paint', 'words', 'state']) {
    for (const [k, v] of Object.entries(was.looked[part])) {
      if (now[part][k] !== v) {
        drifted.push(`${part}.${k}: photographed ${JSON.stringify(v)}, page is ${JSON.stringify(now[part][k])}`)
      }
    }
  }

  if (drifted.length > 0) {
    fail(
      `the page has changed in ${drifted.length} way${drifted.length === 1 ? '' : 's'} since the picture was taken on ${was.recorded}`,
      drifted.join(String.fromCharCode(10) + '      ') +
        String.fromCharCode(10) + '      Run npm run capture. The README calls this the real page.',
    )
  } else {
    console.log(
      `  ok      the picture of ${was.recorded} is of this page: ${was.looked.state.rows} rows, ` +
        `${was.looked.state.marks} marks, ${was.looked.state.bands} bands`,
    )
  }

  /*
   * And the argument, separately, because every count above could match while
   * the picture said the opposite. `insideBands` is marks per row inside a
   * shaded window: the closed loop should have about one per stall and the open
   * loop should have the rate it was holding.
   */
  const [closedIn, openIn] = String(now.state.insideBands).split(',').map(Number)
  if (!(closedIn <= now.state.bands / 2 + 1)) {
    fail(
      `the closed loop has ${closedIn} marks inside its stall windows`,
      'It should have about one per stall, the request that gets caught. The picture is not showing coordinated omission.',
    )
  } else if (!(openIn > closedIn * 5)) {
    fail(
      `the open loop has ${openIn} marks inside its stall windows against the closed loop's ${closedIn}`,
      'The open loop holds its rate through a stall. If it does not, the two rows draw the same thing.',
    )
  } else {
    console.log(`  ok      the argument is in the picture: ${closedIn} closed-loop marks inside the shading against ${openIn} open-loop`)
  }

  await browser.close()
} finally {
  server.stop()
}

/*
 * The README claims the picture is the real page. If that sentence goes, this
 * gate guards nothing. Matched with `includes` on a flattened README: the
 * version of this in `watch-it-think` used a regular expression and twice tested
 * my memory of the wording rather than the wording.
 */
const readme = readFileSync(resolve(root, 'README.md'), 'utf8').replace(/\s+/g, ' ')
const CLAIM = 'That is the real page in a real browser, taken by `npm run capture`'
if (!readme.includes(CLAIM)) {
  fail('the README no longer claims the picture is the real page, so this gate is guarding nothing', `looked for: ${JSON.stringify(CLAIM)}`)
} else {
  console.log('  ok      the README makes the claim this gate exists to keep true')
}

/*
 * Weight. The cap sits just above what the tool produces rather than comfortably
 * above it: a ceiling with slack lets a file grow silently, which is the same
 * mechanism tools/check-queue.mjs ratchets against in the findings queue.
 *
 * It is in kilobytes because this is a lossless still of a flat page. The four
 * recordings in this workspace are capped in megabytes.
 */
const kb = statSync(shot).size / 1024
if (kb > 40) {
  fail(`docs/gatewaylab.png is ${kb.toFixed(0)} KB`, 'a tighter frame, not a lossier encoder')
} else {
  console.log(`  ok      docs/gatewaylab.png is ${kb.toFixed(0)} KB`)
}

if (failed > 0) {
  console.error('\nThe picture at the top is the only thing most people will look at.')
  process.exit(1)
}

console.log('capture: the picture shows the page that exists, and the README can say so')
