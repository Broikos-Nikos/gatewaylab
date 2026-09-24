/**
 * Run the drill and freeze it.
 *
 *   npm run run:drill      # re-measures. Changes every number. Nothing runs it automatically.
 *   npm run check:drill    # recomputes the derived figures from the frozen run. Runs in the build.
 *
 * Timing on a laptop is not reproducible to the millisecond, so the output is a
 * committed artefact like `chunkline`'s corpus and `agentscope`'s frozen log.
 * The spec learned this the expensive way on 2026-09-24: one exploratory
 * re-measure left it quoting eight figures that no longer existed, and its gate
 * failed on all eight.
 *
 * So the rule here is the same as there. Re-measure deliberately, then update
 * everything that quotes it, or do not re-measure.
 *
 * Ten repetitions, because one run of anything timing related is a number with an
 * unstated error bar and this project is about unstated error bars. Every run is
 * written to the file rather than summarised into a sentence about it.
 *
 * Ten rather than three, and that is a measurement: three said the spread was
 * 5%, ten said 21%, on identical parameters. See `repeats` below.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PERCENTILES, runOnce, compare } from '../src/lib/harness.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Every knob, named, so the numbers can be read against them. */
export const DRILL = {
  /** How long a healthy response takes. */
  baseMs: 5,
  /** How long the server stops answering for, when it stops. */
  stallMs: 400,
  /** How often it stops. */
  stallEveryMs: 2000,
  /** The rate the open loop holds, and the rate the closed one cannot. */
  ratePerSecond: 100,
  /** How long each client runs. */
  durationMs: 6000,
  /**
   * How many times the whole thing is repeated.
   *
   * Ten, and the number was measured rather than picked. Three repeats of these
   * parameters reported a p95 ratio of 9.9x, 9.4x and 9.6x, a spread of 5%. Ten
   * repeats of the identical parameters span 8.5x to 10.3x, which is 21%.
   *
   * Three consecutive runs inside one process are more alike than three separate
   * ones, so a small repeat count does not sample the variance, it samples a
   * corner of it and then reports a confident error bar. That is the failure
   * this project is about, in the file that measures for it.
   */
  repeats: 10,
}

mkdirSync(resolve(root, 'src/generated'), { recursive: true })

const runs = []
for (let i = 0; i < DRILL.repeats; i++) runs.push(await runOnce(DRILL))

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const pick = (which, key) => median(runs.map((r) => r[which][key]))
const pickSlip = (key) => median(runs.map((r) => r.open.slip[key]))

const closed = {
  harness: runs[0].closed.harness,
  requests: pick('closed', 'requests'),
  max: pick('closed', 'max'),
  ...Object.fromEntries(PERCENTILES.map((q) => [`p${q}`, pick('closed', `p${q}`)])),
  slip: null,
}
const open = {
  harness: runs[0].open.harness,
  requests: pick('open', 'requests'),
  max: pick('open', 'max'),
  ...Object.fromEntries(PERCENTILES.map((q) => [`p${q}`, pick('open', `p${q}`)])),
  slip: {
    ...Object.fromEntries(PERCENTILES.map((q) => [`p${q}`, pickSlip(`p${q}`)])),
    max: pickSlip('max'),
    lateBy5ms: pickSlip('lateBy5ms'),
  },
}

const { ratios, widest } = compare(closed, open)

/*
 * One run's samples, kept for the page, and it is the median run rather than
 * the best.
 *
 * The picture this project makes is the closed loop's sends going quiet for the
 * length of each stall, and a summary cannot show that. Measured before
 * deciding to keep them: 176 closed and 600 open samples come to 7.9 KB of JSON,
 * which is nothing against the argument they carry.
 *
 * The median by p95 ratio, so the run on screen is the run the headline
 * describes. Picking the widest would be choosing the picture that argues best,
 * which is the thing this project is about.
 */
const byRatio = runs
  .map((r, i) => ({ i, ratio: r.closed.p95 ? r.open.p95 / r.closed.p95 : 0 }))
  .sort((a, b) => a.ratio - b.ratio)
const shown = runs[byRatio[Math.floor(byRatio.length / 2)].i]

const result = {
  measured: new Date().toISOString().slice(0, 10),
  drill: DRILL,
  harnesses: [closed, open],
  shown: {
    what: 'the median run by p95 ratio, which is the run the headline describes',
    stallPhase: shown.stallPhase,
    samples: shown.samples,
    closedRequests: shown.closed.requests,
    openRequests: shown.open.requests,
  },
  runs: runs.map((r) => ({
    closedRequests: r.closed.requests,
    closedP95: r.closed.p95,
    openP95: r.open.p95,
    p95Ratio: r.closed.p95 ? Number((r.open.p95 / r.closed.p95).toFixed(1)) : null,
    openSlipP99: r.open.slip.p99,
  })),
  verdict: {
    ratios,
    widest,
    requestsClosed: closed.requests,
    requestsOpen: open.requests,
    intendedRequests: Math.round((DRILL.durationMs / 1000) * DRILL.ratePerSecond),
    sentShareOfIntended: Number((closed.requests / ((DRILL.durationMs / 1000) * DRILL.ratePerSecond)).toFixed(2)),
    /*
     * The harness's own error against the effect it is reporting.
     *
     * This is the figure that decides whether the run means anything. If the
     * open loop's dispatch slips by as much as the difference it claims to have
     * found, the difference is the harness.
     */
    slipP99: open.slip.p99,
    effectMs: open[widest.percentile] - closed[widest.percentile],
    slipShareOfEffect: Number((open.slip.p99 / (open[widest.percentile] - closed[widest.percentile])).toFixed(3)),
  },
}

writeFileSync(resolve(root, 'src/generated/drill.json'), JSON.stringify(result, null, 2) + String.fromCharCode(10))

console.log(`a server that answers in ${DRILL.baseMs}ms and stalls ${DRILL.stallMs}ms every ${DRILL.stallEveryMs}ms`)
console.log(`both clients run ${DRILL.durationMs}ms, ${DRILL.repeats} times; the open loop holds ${DRILL.ratePerSecond}/s`)
console.log()
console.log('harness                          requests' + PERCENTILES.map((q) => `p${q}`.padStart(8)).join(''))
for (const h of result.harnesses) {
  console.log(`${h.harness.padEnd(30)} ${String(h.requests).padStart(8)}` + PERCENTILES.map((q) => String(h[`p${q}`]).padStart(8)).join(''))
}
console.log()
console.log('ratio, open over closed: ' + PERCENTILES.map((q) => `p${q} ${ratios[`p${q}`]}x`).join('   '))
console.log(`widest at ${widest.percentile}: ${closed[widest.percentile]}ms against ${open[widest.percentile]}ms`)
console.log(`the closed loop sent ${closed.requests} where ${result.verdict.intendedRequests} were due: ${Math.round(result.verdict.sentShareOfIntended * 100)}%`)
console.log()
console.log(`the run kept for the page: ${shown.closed.requests} closed and ${shown.open.requests} open samples, ${(JSON.stringify(shown.samples).length / 1024).toFixed(1)} KB`)
console.log()
console.log(`the harness's own dispatch slip: p99 ${open.slip.p99}ms, max ${open.slip.max}ms, ${open.slip.lateBy5ms} of ${open.requests} more than 5ms late`)
console.log(`which is ${(result.verdict.slipShareOfEffect * 100).toFixed(1)}% of the ${result.verdict.effectMs}ms effect it is reporting`)
