/**
 * The page states what the drill measured, and draws the argument it claims to.
 *
 *   npm run check:page
 *
 * `check:drill` proves the derived figures come from the committed run,
 * `check:harness` proves the harnesses behave, and `check:spread` proves the run
 * is quotable. None of them opens the page.
 *
 * Two kinds of assertion here, and the second is the one worth the file.
 *
 * **The figures**, as phrases and never as bare integers. `watch-it-think` held
 * a claim as the string "6" in a README containing nineteen of them and it could
 * not fail; `evalkit`'s page printed a threshold its own slider refused, and
 * only a gate that opened the page caught it.
 *
 * **The argument.** This page exists to show that the closed loop stops sending
 * during a stall. That is a property of where the marks are, not of any number,
 * and a page could state every figure correctly while drawing the marks in the
 * wrong places or the bands in the wrong places. So the marks inside the shaded
 * windows are counted, on both rows, and the closed loop must be nearly empty
 * there while the open loop is not.
 *
 * A gate that only checked the numbers would pass a picture that argued the
 * opposite.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { stallWindows } from '../src/lib/harness.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const d = JSON.parse(readFileSync(resolve(root, 'src/generated/drill.json'), 'utf8'))

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

const cfg = d.drill
const [closed, open] = d.harnesses
const v = d.verdict
const shown = d.shown

const CLAIMS = [
  ['the headline, both figures', `six seconds: ${closed.p95}ms at p95, or ${open.p95}ms.`],
  ['the repeats and the two figures in the standfirst', `${cfg.repeats} repeats: ${closed.p95}ms against ${open.p95}ms`],
  ['what the closed loop finished against what was due', `${shown.closedRequests} requests where ${v.intendedRequests} were due`],
  ['the p99 agreement and the widest', `agree at p99 (${v.ratios.p99}x) and differ by ${v.widest.ratio}x at ${v.widest.percentile}`],
  ['the run shown is the median', `median of ${cfg.repeats} by p95 ratio, not the widest`],
  ['the slip against the effect', `${v.slipP99}ms at p99, which is ${(v.slipShareOfEffect * 100).toFixed(1)}% of the ${v.effectMs}ms effect`],
]

for (const h of d.harnesses) {
  CLAIMS.push([`the table row for the ${h.harness}`, `${h.requests} requests p95 ${h.p95}ms p99 ${h.p99}ms`])
}

const { serve, useShared } = await import('./serve.mjs')
const server = process.env.GATEWAYLAB_URL ? await useShared(process.env.GATEWAYLAB_URL) : await serve()

try {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } })
  await page.goto(server.url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelectorAll('[data-mark]').length > 0, null, { timeout: 60_000 })

  // innerText, not textContent: the question is what a visitor is looking at.
  const seen = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
  const missing = CLAIMS.filter(([, x]) => !seen.includes(x.replace(/\s+/g, ' ')))
  if (missing.length > 0) {
    fail(
      `${missing.length} of ${CLAIMS.length} figures the page should state are not on it`,
      missing.map(([what, x]) => `${what}: expected ${JSON.stringify(x)}`).join('; '),
    )
  } else {
    console.log(`  ok      ${CLAIMS.length} figures on the page are what the drill measured`)
  }

  /*
   * The drawing. Every mark and every band read back as a fraction of the track,
   * so the comparison is against the data rather than against pixels.
   */
  const drawn = await page.evaluate(() =>

    [...document.querySelectorAll('[data-row]')].map((r) => ({
      label: r.dataset.row,
      marks: [...r.querySelectorAll('[data-mark]')].map((m) => parseFloat(m.style.left)),
      bands: [...r.querySelectorAll('[data-band]')].map((b) => [parseFloat(b.style.left), parseFloat(b.style.width)]),
    })),
  )

  const expected = [
    ['closed', closed.harness, shown.samples.closed, shown.stallPhase.closed],
    ['open', open.harness, shown.samples.open, shown.stallPhase.open],
  ]

  const problems = []
  if (drawn.length !== 2) problems.push(`${drawn.length} rows drawn, the page has two harnesses`)

  for (const [i, [, label, samples, phase]] of expected.entries()) {
    const row = drawn[i]
    if (!row) continue
    if (row.label !== label) problems.push(`row ${i} is ${row.label}, the drill calls it ${label}`)
    if (row.marks.length !== samples.length) {
      problems.push(`${label}: ${row.marks.length} marks drawn, the run has ${samples.length} samples`)
    }
    const windows = stallWindows(phase, cfg, cfg.durationMs)
    if (row.bands.length !== windows.length) {
      problems.push(`${label}: ${row.bands.length} bands drawn, the parameters give ${windows.length}`)
    } else {
      for (const [j, [from, to]] of windows.entries()) {
        const wantLeft = (from / cfg.durationMs) * 100
        const wantWidth = ((to - from) / cfg.durationMs) * 100
        if (Math.abs(row.bands[j][0] - wantLeft) > 0.5 || Math.abs(row.bands[j][1] - wantWidth) > 0.5) {
          problems.push(`${label}: band ${j} at ${row.bands[j][0].toFixed(1)}% wide ${row.bands[j][1].toFixed(1)}%, the parameters say ${wantLeft.toFixed(1)}% and ${wantWidth.toFixed(1)}%`)
        }
      }
    }
  }

  if (problems.length > 0) {
    fail(`the drawing disagrees with the run in ${problems.length} place${problems.length === 1 ? '' : 's'}`, problems.join(String.fromCharCode(10) + '      '))
  } else {
    const total = drawn.reduce((s, r) => s + r.marks.length, 0)
    console.log(`  ok      ${drawn.length} rows, ${total} marks and ${drawn.reduce((s, r) => s + r.bands.length, 0)} bands, all where the run and the parameters put them`)
  }

  /*
   * And the argument itself.
   *
   * The closed loop must be nearly silent inside the shaded windows and the open
   * loop must not, because that is the entire claim of the page. Every figure
   * above could be right while the marks were drawn somewhere that says the
   * opposite.
   *
   * "Nearly" rather than "entirely": the closed loop does send one request into
   * each stall, the one that gets caught by it, and that mark belongs there.
   */
  const inside = (marks, windows) =>
    marks.filter((left) => {
      const at = (left / 100) * cfg.durationMs
      return windows.some(([from, to]) => at >= from && at < to)
    }).length

  const closedWindows = stallWindows(shown.stallPhase.closed, cfg, cfg.durationMs)
  const openWindows = stallWindows(shown.stallPhase.open, cfg, cfg.durationMs)
  const closedIn = drawn[0] ? inside(drawn[0].marks, closedWindows) : -1
  const openIn = drawn[1] ? inside(drawn[1].marks, openWindows) : -1

  // How many the open loop should have inside: it holds its rate throughout.
  const stalledMs = openWindows.reduce((s, [a, b]) => s + (b - a), 0)
  const expectedOpenIn = Math.round((stalledMs / 1000) * cfg.ratePerSecond * 0.5)

  if (closedIn > closedWindows.length + 1) {
    fail(
      `the closed loop has ${closedIn} marks inside the ${closedWindows.length} stall windows`,
      'It should have about one per stall, the request that gets caught. More than that and the picture is not showing coordinated omission.',
    )
  } else if (openIn < expectedOpenIn) {
    fail(
      `the open loop has only ${openIn} marks inside the stall windows, against ${expectedOpenIn} expected`,
      'The open loop holds its rate through a stall. If it does not, the two rows are drawing the same thing.',
    )
  } else {
    console.log(
      `  ok      the argument is drawn: ${closedIn} closed-loop marks inside ${closedWindows.length} stall windows against ${openIn} open-loop marks`,
    )
  }

  /*
   * And the slow requests are still the slow ones when the reader picks the
   * colours.
   *
   * Swept out of watch-it-think's WP-F9 at tick 175. This page says one thing,
   * that the closed harness stalls and the open one does not, and it says it
   * with colour: 76 flame marks among 781 grey. Measured before the fix, with
   * forced colours active, both arrived as rgb(255, 255, 255) and the finding
   * left the picture. The CSS now names Highlight and CanvasText there, two
   * colours the system guarantees are distinguishable, so the distinction
   * survives in the reader's palette instead of by overriding it.
   */
  const forced = await browser.newContext({ viewport: { width: 1280, height: 1000 }, forcedColors: 'active' })
  const fpage = await forced.newPage()
  await fpage.goto(server.url)
  await fpage.waitForFunction(() => document.querySelectorAll('[data-mark]').length > 0, null, { timeout: 60_000 })
  const marks = await fpage.evaluate(() => {
    const look = (sel) => {
      const n = document.querySelector(sel)
      return n ? getComputedStyle(n).backgroundColor : null
    }
    return {
      plain: look('.mark:not(.mark--slow)'),
      slow: look('.mark--slow'),
      counts: [document.querySelectorAll('[data-mark]:not([data-slow])').length, document.querySelectorAll('[data-mark][data-slow]').length],
    }
  })

  if (!marks.plain || !marks.slow) {
    fail('under forced colours the timeline has no marks to compare', JSON.stringify(marks))
  } else if (marks.plain === marks.slow) {
    fail(
      `under forced colours all ${marks.counts[0] + marks.counts[1]} marks are ${marks.slow}`,
      `${marks.counts[1]} of them are the slow requests this page exists to show, and they are the same colour as the other ${marks.counts[0]}.`,
    )
  } else {
    console.log(
      `  ok      under forced colours the ${marks.counts[1]} slow marks are ${marks.slow} against ${marks.plain} for the other ${marks.counts[0]}`,
    )
  }
  await forced.close()

  await browser.close()
} finally {
  server.stop()
}

if (failed > 0) {
  console.error('\nA page can state every figure correctly and draw a picture that argues the opposite.')
  process.exit(1)
}

console.log('page: every figure is the drill’s, and the closed loop is drawn going quiet where it went quiet')
