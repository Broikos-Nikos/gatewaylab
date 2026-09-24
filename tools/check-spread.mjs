/**
 * The committed run is quotable, or it is not committed.
 *
 *   npm run check:spread
 *
 * A timing figure from one run is a number with an unstated error bar, and this
 * project is about unstated error bars. The drill repeats itself and writes every
 * repetition to the file; this is what decides whether the median of them is
 * worth printing to two significant figures.
 *
 * Three things:
 *
 * 1. There are enough repeats to speak of. Fewer than three is one run with an
 *    opinion.
 * 2. The headline ratio holds across them. If it swings, the median is a lucky
 *    run and the page must say a range instead.
 * 3. The dispatch slip holds across them. The slip is what makes the effect
 *    believable, so a run where the clock behaved and a run where it did not are
 *    not the same experiment.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const d = JSON.parse(readFileSync(resolve(root, 'src/generated/drill.json'), 'utf8'))

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

const runs = d.runs ?? []

if (runs.length < 3) {
  fail(`the drill was run ${runs.length} time${runs.length === 1 ? '' : 's'}`, 'A timing figure from fewer than three is one run with an opinion.')
} else {
  console.log(`  ok      ${runs.length} repeats are in the file, not a sentence about them`)
}

/** Relative spread, which is the only way to compare a ratio with a latency. */
const spread = (xs) => {
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  return { lo, hi, rel: lo === 0 ? (hi === 0 ? 0 : Infinity) : (hi - lo) / lo }
}

if (runs.length >= 3) {
  const r = spread(runs.map((x) => x.p95Ratio))
  if (r.rel > 0.25) {
    fail(
      `the p95 ratio varies by ${(r.rel * 100).toFixed(0)}% across the repeats, ${r.lo}x to ${r.hi}x`,
      'Too wide to quote a median. Say the range, or find out why it moves.',
    )
  } else {
    console.log(`  ok      the p95 ratio held ${r.lo}x to ${r.hi}x, ${(r.rel * 100).toFixed(0)}% spread`)
  }

  const s = spread(runs.map((x) => x.openSlipP99))
  if (s.rel > 1) {
    fail(
      `the harness's dispatch slip varies by ${(s.rel * 100).toFixed(0)}% across the repeats, ${s.lo}ms to ${s.hi}ms`,
      'The slip is what makes the effect believable. A run where the clock behaved and one where it did not are not the same experiment.',
    )
  } else {
    console.log(`  ok      the dispatch slip held ${s.lo}ms to ${s.hi}ms across the repeats`)
  }

  /*
   * And the effect has to be an effect in every run, not on average.
   *
   * A median of 10x built from 1x, 10x and 19x is arithmetic rather than a
   * finding, and the spread check above would pass it if the two extremes
   * happened to sit inside the tolerance.
   */
  const weak = runs.filter((x) => (x.p95Ratio ?? 0) < 3)
  if (weak.length > 0) {
    fail(
      `${weak.length} of ${runs.length} runs show a p95 ratio below 3x`,
      runs.map((x) => `${x.p95Ratio}x`).join(', ') + '. The median is arithmetic, not a finding.',
    )
  } else {
    console.log(`  ok      every run shows the effect on its own: ${runs.map((x) => `${x.p95Ratio}x`).join(', ')}`)
  }
}

if (failed > 0) {
  console.error('\nA timing figure from one run is a number with an unstated error bar.')
  process.exit(1)
}

console.log('spread: the committed run is quotable, and every repeat shows the effect')
