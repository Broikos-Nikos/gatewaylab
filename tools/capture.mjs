/**
 * Photograph the timeline for the top of the README.
 *
 *   npm run capture
 *
 * **A still, not a recording, and that is a decision rather than a shortcut.**
 *
 * The other four projects in this workspace lead with a GIF because each of them
 * has something that moves: a slider that redraws the cuts, a filter that dims
 * five rows, a bar dragged past a threshold. This page has none. Its argument is
 * a shape that is already on the screen when it loads, and the honest picture of
 * a static page is a still one. A GIF here would be eight seconds of nothing
 * happening, three times the weight, sold as motion.
 *
 * The spec promised a stall frequency control. That control is real work with a
 * real payoff, because the percentile the two harnesses disagree at moves with
 * the stall frequency and watching it move is the sharpest version of this
 * project's finding. It needs runs precomputed at four or five frequencies and
 * it is stage two. The spec has been amended to say so rather than left
 * promising something the page does not do.
 *
 * Choreographed against measured geometry, viewport 1280, page 1,324 tall:
 *
 *   the timeline   407 to 711, two rows of 142 at 407 and 569
 *   the status     731 to 802
 *
 * So the frame is 400 to 815, which holds both rows, both sets of bands and the
 * sentence that says what the shading means, and nothing else.
 *
 * Taken with `page.screenshot`, which is lossless, rather than through ffmpeg.
 * A still going through a video encoder and a 16 colour palette would be a
 * smaller file that is worse, and the reason `chunkline` and `agentscope` do
 * that is that they are recordings.
 */

import { mkdirSync, writeFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { serve } from './serve.mjs'
import { lookAt } from './capture-state.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(root, 'docs/gatewaylab.png')

/** The band, from the geometry above. */
const CLIP = { x: 0, y: 400, width: 1280, height: 415 }

mkdirSync(resolve(root, 'docs'), { recursive: true })

const server = await serve()
let looked

try {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
  await page.goto(server.url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelectorAll('.mark').length > 0, null, { timeout: 60_000 })
  await page.waitForTimeout(400)

  looked = await page.evaluate(lookAt)

  /*
   * Refuse to photograph a page that is not making the argument.
   *
   * The picture is two rows where one goes quiet under the shading. If the marks
   * or the bands are not there, the file would still be written and would still
   * look like a screenshot of something, which is the worst failure available
   * here: a plausible picture of nothing.
   */
  if (looked.state.rows !== 2) {
    console.error(`FAIL  ${looked.state.rows} rows on the page, and the picture is a comparison of two`)
    process.exit(1)
  }
  if (looked.state.marks === 0 || looked.state.bands === 0) {
    console.error(`FAIL  ${looked.state.marks} marks and ${looked.state.bands} bands, so there is nothing to photograph`)
    process.exit(1)
  }

  await page.screenshot({ path: OUT, clip: CLIP })
  await browser.close()
} finally {
  server.stop()
}

writeFileSync(
  resolve(root, 'docs/capture.json'),
  JSON.stringify({ recorded: new Date().toISOString().slice(0, 10), clip: CLIP, looked }, null, 2) + String.fromCharCode(10),
)

const kb = statSync(OUT).size / 1024
console.log(`docs/gatewaylab.png   ${kb.toFixed(0)} KB, ${CLIP.width}x${CLIP.height}, lossless`)
console.log(`${looked.state.rows} rows, ${looked.state.marks} marks, ${looked.state.bands} bands, ${looked.state.slow} of them slow`)
console.log('a still, because the page does not move. See the header of this file.')
