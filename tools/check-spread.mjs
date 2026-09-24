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

/*
 * Eight, not three, and the threshold was measured.
 *
 * This file used to accept three. Three repeats of the drill's parameters
 * reported a p95 ratio of 9.9x, 9.4x and 9.6x and this gate printed "5% spread"
 * and passed. Ten repeats of the identical parameters span 8.5x to 10.3x, which
 * is 21%: four times the error bar, from the same experiment.
 *
 * A small repeat count does not sample the variance, it samples a corner of it
 * and then reports a confident number about how confident it is. The gate that
 * exists to stop an unstated error bar was understating one.
 */
const MINIMUM_REPEATS = 8

if (runs.length < MINIMUM_REPEATS) {
  fail(
    `the drill was run ${runs.length} time${runs.length === 1 ? '' : 's'} and ${MINIMUM_REPEATS} is the minimum`,
    'Measured: three repeats of these parameters report a 5% spread and ten report 21%. Three does not sample the variance.',
  )
} else {
  console.log(`  ok      ${runs.length} repeats are in the file, not a sentence about them`)
}

/**
 * Relative spread, measured across the middle half rather than across the ends.
 *
 * The first version used min to max, and raising the repeat count from three to
 * ten took the reported spread from 5% to 29% while nine of the ten runs sat
 * inside 8%:
 *
 *   9.8, 10.2, 9.7, 12.5, 10.2, 10.1, 10.5, 10.5, 10.1, 9.9
 *
 * One run in ten at 12.5x set the whole figure. **A min to max spread grows with
 * the sample size by construction**, because every extra sample can only widen
 * the extremes, so that gate got harder to pass the more honestly the experiment
 * was repeated. A tolerance that punishes better sampling is the wrong
 * tolerance, and it would have been read as evidence that three repeats were
 * fine.
 *
 * The interquartile range does not move with n. The full range is reported
 * beside it, because hiding the outlier would be the opposite mistake.
 */
const spread = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))]
  const q1 = at(0.25)
  const q3 = at(0.75)
  return {
    lo: s[0],
    hi: s.at(-1),
    q1,
    q3,
    rel: q1 === 0 ? (q3 === 0 ? 0 : Infinity) : (q3 - q1) / q1,
    // How far the worst run sits outside the middle half, in IQR units. The
    // conventional 1.5 is the line, and it is reported rather than enforced
    // silently.
    outliers: s.filter((x) => x < q1 - 1.5 * (q3 - q1) || x > q3 + 1.5 * (q3 - q1)),
  }
}

if (runs.length >= MINIMUM_REPEATS) {
  const r = spread(runs.map((x) => x.p95Ratio))
  if (r.rel > 0.25) {
    fail(
      `the p95 ratio's middle half spans ${(r.rel * 100).toFixed(0)}%, ${r.q1}x to ${r.q3}x`,
      `Full range ${r.lo}x to ${r.hi}x. Too wide to quote a median. Say the range, or find out why it moves.`,
    )
  } else {
    console.log(
      `  ok      the p95 ratio's middle half held ${r.q1}x to ${r.q3}x, ${(r.rel * 100).toFixed(0)}%` +
        ` (full range ${r.lo}x to ${r.hi}x, ${r.outliers.length} outlier${r.outliers.length === 1 ? '' : 's'})`,
    )
  }

  /*
   * And too many outliers is its own failure. The interquartile range is robust
   * to one bad run, which is the point, and that robustness becomes a way to
   * hide three bad runs if nothing counts them.
   */
  if (r.outliers.length > runs.length * 0.2) {
    fail(
      `${r.outliers.length} of ${runs.length} runs sit outside 1.5 interquartile ranges: ${r.outliers.join('x, ')}x`,
      'The middle half looking tidy while a fifth of the runs are elsewhere is not a stable measurement.',
    )
  }

  const sl = spread(runs.map((x) => x.openSlipP99))
  if (sl.rel > 1) {
    fail(
      `the harness's dispatch slip varies by ${(sl.rel * 100).toFixed(0)}% across its middle half, ${sl.q1}ms to ${sl.q3}ms`,
      'The slip is what makes the effect believable. A run where the clock behaved and one where it did not are not the same experiment.',
    )
  } else {
    console.log(`  ok      the dispatch slip held ${sl.q1}ms to ${sl.q3}ms across its middle half, ${sl.lo}ms to ${sl.hi}ms in full`)
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
